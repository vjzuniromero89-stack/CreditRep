import { supabase } from './supabase';
import { feeFor, isBillable } from './reportDiff';
import { BUREAU_NAME } from './constants';
import { money, today, toISODate } from './format';
import { creditorNorm } from './packageBuilder';

const ITEM_FIELDS = ['kind', 'category', 'bureau', 'name', 'account_number', 'original_creditor', 'account_type', 'balance', 'past_due',
  'high_credit', 'credit_limit', 'monthly_payment', 'date_opened', 'last_reported', 'item_date', 'account_status', 'payment_status',
  'comments', 'late_30', 'late_60', 'late_90', 'is_negative', 'match_key', 'extra'];

export function toRow(it) {
  const r = {};
  ITEM_FIELDS.forEach((f) => { if (it[f] !== undefined) r[f] = it[f]; });
  return r;
}

export function itemLabel(it) {
  const k = it.kind === 'cuenta' ? 'Cuenta' : it.kind === 'inquiry' ? 'Inquiry' : 'Info personal';
  return `${k} ${it.name} (${BUREAU_NAME[it.bureau] || it.bureau})`;
}

async function chunked(list, size, fn) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

export function suggestClientFields(parsed) {
  const pick = (cat) => ['TU', 'EX', 'EQ'].map((b) => parsed.personal.find((p) => p.bureau === b && p.category === cat)).find(Boolean);
  const out = {};
  const name = pick('nombre');
  if (name) {
    const w = name.name.split(/\s+/);
    out.first_name = cap(w[0]);
    if (w.length > 2) { out.middle_name = cap(w.slice(1, -1).join(' ')); }
    if (w.length > 1) out.last_name = cap(w[w.length - 1]);
  }
  const dob = parsed.personal.find((p) => p.category === 'fecha_nacimiento' && toISODate(p.name));
  if (dob) out.dob = toISODate(dob.name);
  const addr = parsed.personal.find((p) => p.category === 'direccion' && p.extra?.tipo === 'actual') || pick('direccion');
  if (addr) {
    const m = addr.name.match(/^(.*?),\s*([^,]+?),?\s+([A-Z]{2}),?\s+(\d{5}(?:-\d{4})?)/i);
    if (m) { out.address = cap(m[1]); out.city = cap(m[2]); out.state = m[3].toUpperCase(); out.zip = m[4]; }
    else out.address = cap(addr.name);
  }
  const phone = pick('telefono');
  if (phone) out.phone = phone.name;
  const emp = pick('empleador');
  if (emp) out.employer = cap(emp.name);
  return out;
}
const cap = (s) => (s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

export async function saveImport({ client, parsed, plan, file, settings, fillClient = true, provider, reportDate }) {
  const clientId = client.id;
  const summary = { inserted: 0, updated: 0, removed: 0, reappeared: 0, charges: 0, chargeTotal: 0 };

  // 1) archivo original
  let file_path = null;
  if (file) {
    const safe = file.name.replace(/[^a-z0-9._-]/gi, '_');
    file_path = `${clientId}/reports/${Date.now()}_${safe}`;
    const up = await supabase.storage.from('cr-files').upload(file_path, file, { contentType: file.type || 'application/octet-stream' });
    if (up.error) { console.warn('No se pudo guardar el archivo', up.error); file_path = null; }
  }

  // 2) registro del reporte
  const { data: report, error: repErr } = await supabase.from('cr_reports').insert({
    client_id: clientId,
    provider: provider || parsed.provider,
    report_date: toISODate(reportDate || parsed.reportDate) || today(),
    bureaus: parsed.bureaus.length ? parsed.bureaus : ['TU', 'EX', 'EQ'],
    file_path,
    file_name: file?.name || null,
    score_tu: parsed.scores.TU ?? null,
    score_ex: parsed.scores.EX ?? null,
    score_eq: parsed.scores.EQ ?? null,
    summary: { counts: { cuentas: parsed.accounts.length, negativas: parsed.accounts.filter((a) => a.is_negative).length, inquiries: parsed.inquiries.length, personal: parsed.personal.length }, bureau_summary: parsed.summary },
  }).select().single();
  if (repErr) throw repErr;

  // 3) nuevos
  if (plan.inserts.length) {
    const rows = plan.inserts.map((it) => ({ ...toRow(it), client_id: clientId, first_report_id: report.id, last_report_id: report.id, status: 'activa' }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('cr_items').insert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    summary.inserted = rows.length;
  }

  // 4) siguen en el reporte: actualizar datos
  await chunked(plan.updates, 10, async (u) => {
    const { error } = await supabase.from('cr_items').update({ ...u.patch, last_report_id: report.id }).eq('id', u.id);
    if (error) throw error;
  });
  summary.updated = plan.updates.length;
  summary.reappeared = plan.reappeared.length;

  // 5) ELIMINADOS -> marcar y crear cobro
  const activity = [];
  const charges = [];
  await chunked(plan.removed, 10, async (it) => {
    const { error } = await supabase.from('cr_items').update({ status: 'eliminada', removed_at: today(), removed_report_id: report.id }).eq('id', it.id);
    if (error) throw error;
  });
  plan.removed.forEach((it) => {
    activity.push(`✅ Eliminado: ${itemLabel(it)}`);
    if (isBillable(it, settings)) {
      const amount = feeFor(it, settings);
      charges.push({ client_id: clientId, item_id: it.id, description: `Eliminación — ${itemLabel(it)}`, amount, status: 'pendiente' });
    }
  });
  if (charges.length) {
    const { error } = await supabase.from('cr_charges').insert(charges);
    if (error) throw error;
    summary.charges = charges.length;
    summary.chargeTotal = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  }
  summary.removed = plan.removed.length;
  plan.reappeared.forEach((it) => activity.push(`⚠️ Reinsertado (volvió a aparecer): ${itemLabel(it)}`));

  // 6) completar datos del cliente vacíos
  if (fillClient) {
    const sug = suggestClientFields(parsed);
    const patch = {};
    Object.entries(sug).forEach(([k, v]) => { if (v && !client[k]) patch[k] = v; });
    if (Object.keys(patch).length) await supabase.from('cr_clients').update(patch).eq('id', clientId);
  }

  // 7) directorio de acreedores (direcciones del reporte)
  const contacts = (parsed.creditorContacts || []).filter((c) => c.address);
  if (contacts.length) {
    const rows = [...new Map(contacts.map((c) => [creditorNorm(c.name), { name: c.name, norm: creditorNorm(c.name), address: c.address, phone: c.phone }])).values()];
    await supabase.from('cr_creditors').upsert(rows, { onConflict: 'norm', ignoreDuplicates: true });
  }

  // 8) historial
  activity.unshift(`📄 Reporte ${provider || parsed.provider} subido: ${summary.inserted} nuevos, ${summary.removed} eliminados, ${summary.reappeared} reinsertados` +
    (summary.charges ? `, ${summary.charges} cobros (${money(summary.chargeTotal)})` : ''));
  await supabase.from('cr_activity').insert(activity.map((message) => ({ client_id: clientId, message })));

  return { report, summary };
}
