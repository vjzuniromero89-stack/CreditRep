// Asistente de paquete de cartas: analiza el cliente y arma las cartas por bureau
// en el orden de impresión TransUnion → Experian → Equifax → acreedores.

export const PACKET_ORDER = ['TU', 'EX', 'EQ'];
const up = (s) => (s || '').toUpperCase();
const words = (s) => up(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const digits = (s) => (s || '').replace(/\D/g, '');
export const creditorNorm = (s) => up(s).replace(/[^A-Z0-9]/g, '').slice(0, 30);

// ------------------------------------------------------------------ info personal a limpiar
export function flagPersonal(items, client) {
  const out = [];
  const warnings = new Set();
  const nameTokens = new Set([client.first_name, client.middle_name, client.last_name, client.suffix].flatMap(words));
  const initials = new Set([...nameTokens].map((t) => t[0]));
  const street = words(client.address);
  const zip = (client.zip || '').slice(0, 5);
  const phones = [client.phone, client.phone2].map((p) => digits(p).slice(-10)).filter((p) => p.length === 10);
  const emp = up(client.employer).replace(/[^A-Z0-9]/g, '');
  const dobY = client.dob ? client.dob.slice(0, 4) : null;

  items.filter((i) => i.kind === 'personal' && i.status !== 'eliminada').forEach((i) => {
    let reason = null;
    const v = i.name || '';
    if (i.category === 'nombre' || i.category === 'alias') {
      if (!nameTokens.size) { warnings.add('Completa el nombre del cliente para detectar nombres incorrectos.'); return; }
      const extra = words(v).filter((w) => !(nameTokens.has(w) || (w.length === 1 && initials.has(w))));
      if (extra.length) reason = `No coincide con el nombre del cliente (${extra.join(' ')})`;
      else if (i.category === 'alias' && words(v).length < 2) reason = 'Alias incompleto';
    } else if (i.category === 'direccion') {
      if (!street.length || !zip) { warnings.add('Completa la dirección actual del cliente para detectar direcciones viejas.'); return; }
      const vw = words(v);
      const vzip = (v.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/) || [])[1];
      const sameNum = vw[0] === street[0];
      const sameStreet = vw.slice(1, 3).some((w) => street.includes(w));
      if (!(sameNum && sameStreet && vzip === zip)) reason = 'No es la dirección actual';
    } else if (i.category === 'telefono') {
      if (!phones.length) { warnings.add('Agrega el teléfono del cliente para detectar teléfonos incorrectos.'); return; }
      if (!phones.includes(digits(v).slice(-10))) reason = 'Teléfono que no es del cliente';
    } else if (i.category === 'empleador') {
      const ve = up(v).replace(/[^A-Z0-9]/g, '');
      if (!emp || !(ve.includes(emp) || emp.includes(ve))) reason = emp ? 'Empleador que no es el actual' : 'Empleador anterior / no confirmado';
    } else if (i.category === 'fecha_nacimiento') {
      const y = (v.match(/\b(19|20)\d{2}\b/) || [])[0];
      if (dobY && y && y !== dobY) reason = 'Fecha de nacimiento incorrecta';
    }
    if (reason) out.push({ item: i, reason });
  });
  return { flagged: out, warnings: [...warnings] };
}

// ------------------------------------------------------------------ plantilla por propósito y ronda
export function pickTemplate(templates, purpose, round = 1) {
  const act = templates.filter((t) => t.active !== false);
  let list = act.filter((t) => t.purpose === purpose);
  if (!list.length) {
    // compatibilidad con plantillas sin "tipo"
    const map = { disputa_cuentas: ['bureau', 'cuenta'], inquiries: ['bureau', 'inquiry'], personal: ['bureau', 'personal'], validacion: ['acreedor', 'cuenta'], goodwill: ['acreedor', 'cuenta'] }[purpose];
    if (map) list = act.filter((t) => t.recipient === map[0] && (t.applies_to === map[1] || t.applies_to === 'todos'));
    if (purpose === 'goodwill') list = list.filter((t) => /goodwill|buena voluntad/i.test(t.name));
    if (purpose === 'validacion') list = list.filter((t) => /valid/i.test(t.name));
  }
  if (!list.length) return null;
  const exact = list.find((t) => Number(t.round || 1) === round);
  if (exact) return exact;
  const lower = list.filter((t) => Number(t.round || 1) < round).sort((a, b) => b.round - a.round)[0];
  return lower || list.sort((a, b) => a.round - b.round)[0];
}

export const nextRound = (i) => (i.dispute_round || 0) + 1;
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d + 'T12:00:00')) / 864e5) : Infinity);

// ------------------------------------------------------------------ paquete
export function buildPackage({ client, items, templates, docs = [], creditors = [], options = {} }) {
  const opt = { perAccount: false, waitDays: 30, includeRecent: false, creditorLetters: true, goodwill: true, cleanPersonal: true, inquiries: true, ...options };
  const warnings = [];
  const letters = [];
  const skippedRecent = [];
  const recentOk = (i) => opt.includeRecent || daysSince(i.last_dispute_at) >= opt.waitDays;
  const open = items.filter((i) => i.status !== 'eliminada');

  const { flagged, warnings: pw } = opt.cleanPersonal ? flagPersonal(items, client) : { flagged: [], warnings: [] };
  warnings.push(...pw);
  const flaggedReason = Object.fromEntries(flagged.map((f) => [f.item.id, f.reason]));

  const add = (spec) => {
    if (!spec.template) { warnings.push(`No hay plantilla activa para "${spec.purposeLabel}". Créala o impórtala en Plantillas.`); return; }
    letters.push({ key: `${spec.group}|${spec.purpose}|${spec.round || ''}|${letters.length}`, enabled: true, ...spec,
      attach: { id: !!spec.template.attach_id, bill: !!spec.template.attach_bill, ssn: !!spec.template.attach_ssn } });
  };

  for (const b of PACKET_ORDER) {
    // 1) info personal
    const pers = open.filter((i) => i.kind === 'personal' && i.bureau === b && flaggedReason[i.id]);
    if (pers.length) {
      const ok = pers.filter(recentOk); pers.filter((i) => !recentOk(i)).forEach((i) => skippedRecent.push(i));
      if (ok.length) add({ group: b, bureau: b, recipient: 'bureau', purpose: 'personal', purposeLabel: 'Limpiar información personal', template: pickTemplate(templates, 'personal', 1), items: ok, reasons: Object.fromEntries(ok.map((i) => [i.id, flaggedReason[i.id]])) });
    }
    // 2) cuentas negativas por ronda
    const accts = open.filter((i) => i.kind === 'cuenta' && i.is_negative && i.bureau === b);
    const okA = accts.filter(recentOk); accts.filter((i) => !recentOk(i)).forEach((i) => skippedRecent.push(i));
    const byRound = {};
    okA.forEach((i) => { (byRound[nextRound(i)] = byRound[nextRound(i)] || []).push(i); });
    Object.keys(byRound).map(Number).sort().forEach((r) => {
      const tpl = pickTemplate(templates, 'disputa_cuentas', r);
      const groups = opt.perAccount ? byRound[r].map((i) => [i]) : [byRound[r]];
      groups.forEach((g) => add({ group: b, bureau: b, recipient: 'bureau', purpose: 'disputa_cuentas', purposeLabel: `Disputa de cuentas – ronda ${r}`, round: r, template: tpl, items: g }));
    });
    // 3) inquiries
    if (opt.inquiries) {
      const inq = open.filter((i) => i.kind === 'inquiry' && i.bureau === b);
      const okI = inq.filter(recentOk); inq.filter((i) => !recentOk(i)).forEach((i) => skippedRecent.push(i));
      if (okI.length) add({ group: b, bureau: b, recipient: 'bureau', purpose: 'inquiries', purposeLabel: 'Inquiries', template: pickTemplate(templates, 'inquiries', 1), items: okI });
    }
  }

  // 4) acreedores / cobradores (una carta por cuenta, sin repetir los 3 bureaus)
  if (opt.creditorLetters) {
    const dir = Object.fromEntries(creditors.map((c) => [c.norm || creditorNorm(c.name), c]));
    const seen = new Map();
    open.filter((i) => i.kind === 'cuenta' && i.is_negative).forEach((i) => {
      const purpose = ['coleccion', 'charge_off'].includes(i.category) ? 'validacion' : i.category === 'pagos_tarde' ? (opt.goodwill ? 'goodwill' : null) : null;
      if (!purpose) return;
      const k = `${purpose}|${creditorNorm(i.name)}|${digits(i.account_number).slice(0, 4)}`;
      if (!seen.has(k)) seen.set(k, { purpose, items: [] });
      seen.get(k).items.push(i);
    });
    [...seen.values()].forEach(({ purpose, items: its }) => {
      const first = its[0];
      const d = dir[creditorNorm(first.name)];
      const ok = its.filter(recentOk);
      if (!ok.length) return;
      add({ group: 'ACREEDOR', bureau: null, recipient: 'acreedor', purpose, purposeLabel: purpose === 'validacion' ? 'Validación de deuda' : 'Buena voluntad (pagos tarde)',
        template: pickTemplate(templates, purpose, 1), items: [ok[0]], allItems: ok,
        recipientName: d?.name || first.name, recipientAddress: d?.address || '', creditorNorm: creditorNorm(first.name) });
    });
  }

  // 5) avisos
  if (!client.address || !client.city || !client.zip) warnings.push('Falta la dirección completa del cliente (va arriba en cada carta).');
  if (!client.dob) warnings.push('Falta la fecha de nacimiento del cliente.');
  if (digits(client.ssn).length < 4) warnings.push('Falta el Seguro Social del cliente.');
  const has = (t) => docs.some((d) => d.doc_type === t);
  if (letters.some((l) => l.attach.id) && !has('licencia_frente')) warnings.push('Falta la foto del ID / licencia (frente) para adjuntar.');
  if (letters.some((l) => l.attach.bill) && !has('bill')) warnings.push('Falta la foto del bill para adjuntar.');
  if (letters.some((l) => l.attach.ssn) && !has('ssn')) warnings.push('Falta la foto de la tarjeta de Seguro Social para adjuntar.');
  letters.filter((l) => l.recipient === 'acreedor' && !l.recipientAddress).forEach((l) => warnings.push(`Falta la dirección de ${l.recipientName}.`));

  return { letters, warnings: [...new Set(warnings)], skippedRecent, flagged };
}

// Orden de impresión (y separación en sobres)
export function envelopeKey(l) {
  return l.recipient_type === 'bureau' || l.recipient === 'bureau' ? `B|${l.bureau}` : `A|${(l.recipient_name || l.recipientName || '').toUpperCase()}`;
}
