// Analiza las filas de un reporte 3-bureau (IdentityIQ, SmartCredit, MyScoreIQ, MyFreeScoreNow…)
// y devuelve la información organizada por bureau.

export const BUREAUS = ['TU', 'EX', 'EQ'];

const low = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const strip = (s) => low(s).replace(/[:：]\s*$/, '').replace(/\*+$/, '').trim();

export function bureauOf(s) {
  const t = low(s).replace(/[^a-z]/g, '');
  if (!t) return null;
  if (['transunion', 'tu', 'tuc', 'trans'].includes(t)) return 'TU';
  if (['experian', 'exp', 'ex', 'xpn'].includes(t)) return 'EX';
  if (['equifax', 'eqf', 'eq', 'efx'].includes(t)) return 'EQ';
  return null;
}

const EMPTY = new Set(['', '-', '--', '---', 'n/a', 'na', 'none', 'not reported', 'unknown', '—', '–']);
const isEmpty = (v) => v == null || EMPTY.has(low(v));
const val = (v) => (isEmpty(v) ? null : v.trim());

export function money(v) {
  if (isEmpty(v)) return null;
  const m = String(v).replace(/,/g, '').match(/-?\$?\s*(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

const DATE_RE = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{4})\b/;

// ------------------------------------------------------------------ etiquetas
const LABELS = {
  // personal
  'credit report date': 'reportDate', 'report date': 'reportDate', 'date of report': 'reportDate',
  'name': 'name', 'names': 'name', 'consumer name': 'name', 'name(s)': 'name',
  'also known as': 'aka', 'aka': 'aka', 'also known as (aka)': 'aka', 'alias': 'aka', 'aliases': 'aka', 'other names': 'aka',
  'former': 'former', 'former name': 'former', 'former names': 'former', 'previous name': 'former',
  'date of birth': 'dob', 'dob': 'dob', 'birth date': 'dob', 'year of birth': 'dob', 'birth year': 'dob',
  'current address(es)': 'curAddr', 'current address': 'curAddr', 'current addresses': 'curAddr', 'address': 'curAddr', 'addresses': 'curAddr',
  'previous address(es)': 'prevAddr', 'previous address': 'prevAddr', 'previous addresses': 'prevAddr', 'former address': 'prevAddr', 'former addresses': 'prevAddr', 'other addresses': 'prevAddr',
  'employers': 'employer', 'employer': 'employer', 'employer(s)': 'employer', 'employment': 'employer', 'employer name': 'employer',
  'phone': 'phone', 'phone number': 'phone', 'phone numbers': 'phone', 'phone number(s)': 'phone', 'telephone': 'phone', 'telephone numbers': 'phone',
  // score
  'credit score': 'score', 'score': 'score', 'fico score': 'score', 'vantagescore 3.0': 'score', 'vantagescore': 'score', 'vantage score': 'score', 'vantagescore® 3.0': 'score',
  // cuentas
  'account #': 'number', 'account number': 'number', 'acct #': 'number', 'account no': 'number', 'account no.': 'number', 'acct number': 'number', 'account': 'number',
  'account type': 'type', 'type': 'type', 'loan type': 'type',
  'account type - detail': 'typeDetail', 'account type detail': 'typeDetail', 'type detail': 'typeDetail', 'detail': 'typeDetail', 'account detail': 'typeDetail',
  'bureau code': 'responsibility', 'responsibility': 'responsibility', 'account designator': 'responsibility', 'ecoa': 'responsibility',
  'account status': 'accountStatus', 'status': 'accountStatus', 'condition': 'accountStatus', 'account condition': 'accountStatus',
  'monthly payment': 'monthly', 'payment': 'monthly', 'scheduled payment': 'monthly',
  'date opened': 'dateOpened', 'opened': 'dateOpened', 'open date': 'dateOpened', 'opened date': 'dateOpened',
  'balance': 'balance', 'balance owed': 'balance', 'current balance': 'balance', 'amount': 'balance', 'balance amount': 'balance',
  'no. of months (terms)': 'terms', 'terms': 'terms', 'term': 'terms', 'no. of months': 'terms',
  'high credit': 'highCredit', 'high balance': 'highCredit', 'highest balance': 'highCredit', 'original amount': 'highCredit',
  'credit limit': 'creditLimit', 'limit': 'creditLimit',
  'past due': 'pastDue', 'amount past due': 'pastDue', 'past due amount': 'pastDue',
  'payment status': 'paymentStatus', 'pay status': 'paymentStatus', 'current payment status': 'paymentStatus', 'account rating': 'paymentStatus',
  'last reported': 'lastReported', 'date reported': 'lastReported', 'reported': 'lastReported', 'last updated': 'lastReported', 'date last reported': 'lastReported',
  'comments': 'comments', 'remarks': 'comments', 'creditor remarks': 'comments', 'comment': 'comments', 'remark': 'comments',
  'date last active': 'lastActive', 'last activity': 'lastActive', 'date of last activity': 'lastActive',
  'date of last payment': 'lastPayment', 'last payment': 'lastPayment', 'last payment date': 'lastPayment',
  'original creditor': 'originalCreditor', 'original creditor name': 'originalCreditor',
  'creditor type': 'creditorType', 'type of business': 'creditorType', 'industry': 'creditorType', 'kind of business': 'creditorType',
  'account name': 'creditorName', 'creditor': 'creditorName', 'creditor name': 'creditorName', 'company': 'creditorName', 'company name': 'creditorName', 'subscriber': 'creditorName',
  'days late - 7 year history': 'lateSummary', 'days late': 'lateSummary', 'times late': 'lateSummary', 'late payments': 'lateSummary', 'times 30/60/90 days late': 'lateSummary',
  'date filed': 'dateFiled', 'filed': 'dateFiled', 'court': 'court', 'reference #': 'number', 'docket number': 'number', 'date closed': 'dateClosed', 'closed date': 'dateClosed',
  'date of first delinquency': 'dofd', 'dofd': 'dofd',
};

const PERSONAL_KEYS = new Set(['reportDate', 'name', 'aka', 'former', 'dob', 'curAddr', 'prevAddr', 'employer', 'phone']);
export const labelKey = (s) => LABELS[strip(s)] || null;
const looksLikeLabel = (s) => /[:：]\s*$/.test(s || '') || !!labelKey(s);

// ------------------------------------------------------------------ secciones
function sectionOf(text) {
  const t = low(text).replace(/[^a-z0-9 ()&/-]/g, '').trim();
  if (!t || t.length > 45) return null;
  if (/^(personal (information|info|profile)|personal data|consumer (information|identification))$/.test(t)) return 'personal';
  if (/^(credit scores?|scores?|credit score( details)?|vantagescore.*|your credit scores?)$/.test(t)) return 'scores';
  if (/^(summary|credit summary|report summary|account summary|overview)$/.test(t)) return 'summary';
  if (/^(account history|accounts?|account details|trade ?lines?|credit accounts|revolving accounts|installment accounts|mortgage accounts|open accounts|closed accounts|other accounts|auto loans?|student loans?|real estate accounts|derogatory accounts|negative accounts|adverse accounts|accounts in good standing)$/.test(t)) return 'accounts';
  if (/^(collections?|collection accounts)$/.test(t)) return 'collections';
  if (/^(public (information|records?)|public record information|bankruptcies|judgments)$/.test(t)) return 'public';
  if (/^(inquiries|credit inquiries|hard inquiries|inquiry|regular inquiries|inquiries \(.*\))$/.test(t)) return 'inquiries';
  if (/^(creditor contacts?|creditor contact information|contact information|creditors contact|consumer statements?|messages)$/.test(t)) return 'ignore';
  return null;
}

const NOISE_RE = /(https?:\/\/|www\.|page \d+ of \d+|^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}|back to top|print this|all rights reserved|©|copyright)/i;
const HISTORY_TITLE = /(two[- ]year payment history|payment history|days late|7 year history|month|year|^jan|^feb)/i;
const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i;

// ------------------------------------------------------------------ direcciones
const ZIP_LINE = /\b[A-Z]{2},?\s+\d{5}(-\d{4})?\b/i;
export function groupAddresses(text) {
  const lines = (text || '').split(/\n| \| /).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let cur = [];
  for (const line of lines) {
    if (DATE_RE.test(line) && line.replace(DATE_RE, '').replace(/[^a-z0-9]/gi, '').length < 3) {
      if (out.length && cur.length === 0) out[out.length - 1].date = line;
      continue;
    }
    cur.push(line);
    if (ZIP_LINE.test(line)) { out.push({ value: cur.join(', ') }); cur = []; }
  }
  if (cur.length) {
    const joined = cur.join(' ');
    // Dirección en una sola línea sin salto: separar por zip
    const parts = joined.split(/(?<=\b\d{5}(?:-\d{4})?\b)\s+(?=\d)/);
    parts.forEach((p) => out.push({ value: p.trim() }));
  }
  return out.filter((a) => a.value && a.value.length > 4);
}

function splitList(text) {
  return (text || '').split(/\n| \| |;/).map((s) => s.trim()).filter((s) => s && !isEmpty(s));
}

// ------------------------------------------------------------------ clasificación de cuentas
export function classify(a, section) {
  const txt = low([a.account_type, a.extra?.typeDetail, a.account_status, a.payment_status, a.comments, a.extra?.creditorType].filter(Boolean).join(' | '));
  if (section === 'public' || /bankruptcy|judgment|tax lien|civil claim/.test(txt)) return 'registro_publico';
  if (/collection|factoring|debt buyer|placed for collection|cobro/.test(txt) || section === 'collections') return 'coleccion';
  if (/charge[\s-]?off|charged off|\bc\/o\b|profit and loss|written off/.test(txt)) return 'charge_off';
  if (/reposs|foreclos|surrender/.test(txt)) return 'repo';
  const lates = (a.late_30 || 0) + (a.late_60 || 0) + (a.late_90 || 0);
  if (lates > 0 || /\b(late|delinquen|past due|30 days|60 days|90 days|120 days|150 days|180 days)\b/.test(low([a.payment_status, a.account_status].join(' '))) || (a.past_due || 0) > 0) return 'pagos_tarde';
  if (/derogatory|adverse|settled|settlement|paid for less|less than full|negative|default/.test(txt)) return 'otro_negativo';
  return 'positiva';
}

export const normName = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
export const digits = (s) => (s || '').replace(/[^0-9]/g, '');
export const normText = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function matchKey(kind, it) {
  if (kind === 'cuenta') return `${normName(it.name)}|${digits(it.account_number)}`;
  if (kind === 'inquiry') return `${normName(it.name)}|${digits(it.item_date)}`;
  if (it.category === 'direccion') {
    const zip = (it.name.match(/\b\d{5}\b/) || [''])[0];
    return `direccion|${normText(it.name.split(',')[0]).slice(0, 20)}|${zip}`;
  }
  return `${it.category}|${normText(it.name)}`;
}

// ------------------------------------------------------------------ parser principal
export function parseReport(rows, rawText = '') {
  const res = {
    provider: detectProvider(rawText + ' ' + rows.slice(0, 80).map((r) => r.cells.join(' ')).join(' ')),
    reportDate: null,
    bureaus: [],
    scores: {},
    personal: [],
    accounts: [],
    inquiries: [],
    summary: {},
    warnings: [],
  };
  const seenBureaus = new Set();

  let section = null;
  let header = null;         // { order: ['TU','EX','EQ'], idx: [1,2,3], xs: [..] }
  let block = null;          // cuenta en proceso
  let lastLabeled = null;    // para continuaciones de PDF
  let inquiryBureau = null;

  const flushPersonal = () => {
    if (lastLabeled && lastLabeled.kind === 'personal' && !lastLabeled.done) {
      for (const b of BUREAUS) if (lastLabeled.values[b]) addPersonal(res, b, lastLabeled.key, lastLabeled.values[b]);
      lastLabeled.done = true;
    }
  };
  const flush = () => {
    flushPersonal();
    if (block) finishBlock(block, res);
    block = null;
  };

  const mapValues = (row) => {
    // devuelve { label, values: {TU,EX,EQ} } usando el encabezado actual
    const out = { TU: null, EX: null, EQ: null };
    if (!header) return null;
    const { cells, xs } = row;
    if (xs && header.cols) {
      const cols = header.cols;
      const raw = row.parts && row.parts.length ? row.parts : cells.map((c, i) => ({ text: c, x: xs[i], w: row.ws?.[i], ln: 0 }));
      const parts = raw.flatMap((q) => splitPart(q, cols));
      const buckets = { label: [], TU: [], EX: [], EQ: [] };
      parts.forEach((q) => {
        if (q.x < cols[0] - 10) { buckets.label.push(q); return; }
        let best = 0;
        cols.forEach((cx, j) => { if (cx - 10 <= q.x) best = j; });
        buckets[header.order[best]].push(q);
      });
      const join = (arr) => {
        if (!arr.length) return null;
        arr.sort((a, b) => a.ln - b.ln || a.x - b.x);
        let s = ''; let prev = null;
        arr.forEach((q) => { s += prev === null ? q.text : (q.ln !== prev ? '\n' : ' ') + q.text; prev = q.ln; });
        return s;
      };
      for (const b of BUREAUS) out[b] = join(buckets[b]);
      return { label: join(buckets.label), values: out };
    }
    const n = header.order.length;
    let label = cells[0];
    let vals;
    if (cells.length === header.width) vals = header.idx.map((i) => cells[i]);
    else if (cells.length - 1 >= n) vals = cells.slice(1, 1 + n);
    else vals = cells.slice(1);
    header.order.forEach((b, j) => { out[b] = vals[j] ?? null; });
    return { label, values: out };
  };

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const cells = row.cells.map((c) => c || '');
    const nonEmpty = cells.filter((c) => c.trim());
    if (!nonEmpty.length) continue;
    const joined = nonEmpty.join(' ');
    if (NOISE_RE.test(joined) && joined.length < 160 && !looksLikeLabel(cells[0])) continue;

    // ¿Encabezado de bureaus?
    const hdr = headerOf(cells, row);
    if (hdr) {
      header = hdr;
      if (row.xs) header.cols = columnsAfter(rows, ri, header.order.length);
      header.order.forEach((b) => seenBureaus.add(b));
      flushPersonal();
      lastLabeled = null;
      continue;
    }

    flushPersonal();

    // ¿Fila de texto sola? (título de sección, nombre del acreedor, bureau de inquiries)
    let splitRow = false;
    if (row.xs && header?.cols && nonEmpty.length === 1) {
      const c0 = header.cols[0] - 10;
      const ps = row.parts || [];
      splitRow = (ps.some((q) => q.x < c0) && ps.some((q) => q.x >= c0)) || startsWithLabel(nonEmpty[0]);
    }
    const single = nonEmpty.length === 1 && !looksLikeLabel(nonEmpty[0]) && !splitRow;
    if (single) {
      const text = nonEmpty[0];
      const sec = sectionOf(text);
      if (sec) {
        flush();
        section = sec === 'ignore' ? 'ignore' : sec;
        inquiryBureau = null;
        lastLabeled = null;
        continue;
      }
      const b = bureauOf(text);
      if (b) { inquiryBureau = b; seenBureaus.add(b); continue; }
      if ((section === 'accounts' || section === 'collections' || section === 'public') && isCreditorTitle(text)) {
        flush();
        block = { title: text, section, fields: { TU: {}, EX: {}, EQ: {} }, history: { TU: [], EX: [], EQ: [] } };
        lastLabeled = null;
        continue;
      }
      continue;
    }

    // Filas del historial de pagos: "TransUnion OK OK 30 ..."
    const firstB = bureauOf(cells[0]);
    if (firstB && nonEmpty.length >= 4 && block) {
      block.history[firstB].push(...cells.slice(1).map((c) => c.trim().toUpperCase()));
      continue;
    }

    // ---------- Inquiries (tabla con columna de bureau)
    if (section === 'inquiries') {
      const inq = parseInquiryRow(cells, inquiryBureau, header, mapValues, row);
      if (inq.length) { inq.forEach((q) => { res.inquiries.push(q); seenBureaus.add(q.bureau); }); continue; }
      continue;
    }

    // ---------- Filas con etiqueta y 3 valores
    let mapped = mapValues(row);
    let label = mapped ? mapped.label : cells[0];
    let key = labelKey(label);

    // Sin encabezado: "Etiqueta: valor" (formato de un solo bureau o texto)
    if (!mapped) {
      const m = joined.match(/^([^:]{2,40}):\s*(.+)$/);
      if (m && labelKey(m[1])) {
        key = labelKey(m[1]);
        mapped = { label: m[1], values: { TU: m[2], EX: m[2], EQ: m[2] }, generic: true };
      } else continue;
    }
    if (!key) {
      // late summary dentro de cualquier fila
      if (block) scanLates(block, cells, mapped.values);
      continue;
    }

    // Sección implícita
    if (!section && PERSONAL_KEYS.has(key)) section = 'personal';
    if (key === 'score') {
      for (const b of BUREAUS) {
        const n = parseInt((mapped.values[b] || '').replace(/[^0-9]/g, ''), 10);
        if (n >= 250 && n <= 900) { res.scores[b] = n; seenBureaus.add(b); }
      }
      continue;
    }
    if (key === 'reportDate') {
      const v = BUREAUS.map((b) => val(mapped.values[b])).find(Boolean);
      if (v && !res.reportDate) res.reportDate = (v.match(DATE_RE) || [v])[0];
      continue;
    }

    if (section === 'summary') {
      for (const b of BUREAUS) {
        if (val(mapped.values[b])) { res.summary[b] = res.summary[b] || {}; res.summary[b][strip(label)] = mapped.values[b]; }
      }
      continue;
    }

    if (PERSONAL_KEYS.has(key) && (section === 'personal' || section === null)) {
      const values = {};
      for (const b of BUREAUS) {
        const v = mapped.values[b];
        if (isEmpty(v)) continue;
        seenBureaus.add(b);
        values[b] = v;
      }
      lastLabeled = { key, kind: 'personal', row, values };
      continue;
    }

    if (section === 'accounts' || section === 'collections' || section === 'public') {
      if (!block) block = { title: '', section, fields: { TU: {}, EX: {}, EQ: {} }, history: { TU: [], EX: [], EQ: [] } };
      if (key === 'lateSummary') { scanLates(block, cells, mapped.values); continue; }
      for (const b of BUREAUS) {
        const v = mapped.values[b];
        if (isEmpty(v)) continue;
        block.fields[b][key] = block.fields[b][key] ? block.fields[b][key] + ' ' + v : v;
      }
      lastLabeled = { key, kind: 'account', row, block };
      continue;
    }
  }
  flush();

  // Dedupe personal
  const seen = new Set();
  res.personal = res.personal.filter((p) => {
    const k = p.bureau + matchKey('personal', p);
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  res.accounts.forEach((a) => seenBureaus.add(a.bureau));
  res.bureaus = BUREAUS.filter((b) => seenBureaus.has(b));
  if (!res.reportDate) {
    const m = (rawText || '').match(/(?:report date|date of report|credit report date)[:\s]*([0-9/-]{8,10})/i);
    if (m) res.reportDate = m[1];
  }
  if (!res.accounts.length) res.warnings.push('No se detectaron cuentas. Revisa el formato del archivo o agrega las cuentas manualmente.');
  if (!res.bureaus.length) res.warnings.push('No se detectaron las columnas TransUnion / Experian / Equifax.');
  return res;
}

function startsWithLabel(text) {
  if (sectionOf(text)) return false;
  const w = text.split(/\s+/);
  for (let n = Math.min(6, w.length - 1); n >= 2; n--) if (labelKey(w.slice(0, n).join(' '))) return true;
  return false;
}

// Si un texto del PDF cruza el inicio de una columna, lo corta en el espacio más cercano
function splitPart(q, cols) {
  if (!q.w || q.text.length < 3) return [q];
  const cw = q.w / q.text.length;
  for (const c of cols) {
    if (q.x < c - 10 && q.x + q.w > c + 10) {
      const target = (c - q.x) / cw;
      let best = -1; let bd = Infinity;
      for (let i = 1; i < q.text.length; i++) {
        if (q.text[i] === ' ' && Math.abs(i - target) < bd) { bd = Math.abs(i - target); best = i; }
      }
      if (best < 0 || bd > 6) continue;
      const a = { ...q, text: q.text.slice(0, best).trim(), w: best * cw };
      const b = { ...q, text: q.text.slice(best + 1).trim(), x: q.x + (best + 1) * cw, w: q.w - (best + 1) * cw };
      return [...splitPart(a, cols), ...splitPart(b, cols)].filter((p) => p.text);
    }
  }
  return [q];
}

function headerOf(cells, row) {
  const nonEmpty = cells.filter((c) => c.trim());
  // cada celda es un bureau
  const bIdx = [];
  cells.forEach((c, i) => { const b = bureauOf(c); if (b) bIdx.push([i, b]); });
  if (bIdx.length >= 2 && bIdx.length === nonEmpty.length) {
    return { order: bIdx.map(([, b]) => b), idx: bIdx.map(([i]) => i), width: cells.length };
  }
  // PDF: "TransUnion Experian" pegados en una celda
  if (row.xs) {
    const words = nonEmpty.join(' ').replace(/trans\s+union/gi, 'TransUnion').split(/\s+/);
    const bs = words.map(bureauOf);
    if (bs.length >= 2 && bs.every(Boolean) && new Set(bs).size === bs.length) return { order: bs, idx: bs.map((_, i) => i + 1), width: bs.length + 1 };
  }
  return null;
}

// Detecta dónde empiezan las columnas de valores mirando las filas debajo del encabezado
function columnsAfter(rows, hi, n) {
  const xs = [];
  const labelOk = (t) => /[:：]\s*$/.test(t) || !!labelKey(t) || startsWithLabel(t);
  for (let k = hi + 1; k < Math.min(rows.length, hi + 60); k++) {
    const r = rows[k];
    if (!r.xs) break;
    if (headerOf(r.cells, r)) break;
    if (!labelOk(r.cells[0]) || r.cells.length < 2) continue;
    r.xs.slice(1).forEach((x) => xs.push(x));
  }
  const fromHeader = () => {
    // posición de cada palabra del encabezado (TransUnion / Experian / Equifax)
    const out = [];
    (rows[hi].parts || []).forEach((q) => {
      const cw = (q.w || q.text.length * 5) / q.text.length;
      let idx = 0;
      q.text.split(/(\s+)/).forEach((tok) => {
        if (bureauOf(tok)) out.push(q.x + idx * cw);
        idx += tok.length;
      });
    });
    return out.length === n ? out : rows[hi].xs.slice(-n);
  };
  if (!xs.length) return fromHeader();
  xs.sort((a, b) => a - b);
  const clusters = [];
  xs.forEach((x) => {
    const c = clusters.find((cl) => Math.abs(cl.x - x) <= 8);
    if (c) { c.n++; c.x = Math.min(c.x, x); } else clusters.push({ x, n: 1 });
  });
  const top = [...clusters].sort((a, b) => b.n - a.n).slice(0, n).sort((a, b) => a.x - b.x);
  if (top.length < n) return fromHeader();
  return top.map((c) => c.x);
}

function isCreditorTitle(text) {
  if (text.length < 2 || text.length > 70) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (HISTORY_TITLE.test(text) || MONTHS.test(text)) return false;
  if (/^(ok|co|nd|\d+)$/i.test(text)) return false;
  if (/^(open|closed|paid|current|derogatory|positive|negative|individual|joint)$/i.test(text)) return false;
  if (DATE_RE.test(text) && text.length < 14) return false;
  return true;
}

function isContinuation(row, prev, header) {
  if (!prev || prev.page !== row.page || row.y == null || prev.y == null) return false;
  const firstX = Math.min(...header.xs);
  if (row.xs[0] < firstX - 12) return false;
  const lh = Math.max(8, row.y - prev.y);
  return row.y - prev.y < 22 && lh < 22;
}

function addPersonal(res, b, key, v) {
  const push = (category, value, extra = {}) => {
    value = value.replace(/\s+/g, ' ').trim();
    if (!value || isEmpty(value)) return;
    res.personal.push({ bureau: b, category, name: value, extra });
  };
  if (key === 'name') splitList(v).forEach((x) => push('nombre', x));
  else if (key === 'aka') splitList(v).forEach((x) => push('alias', x));
  else if (key === 'former') splitList(v).forEach((x) => push('alias', x, { tipo: 'former' }));
  else if (key === 'dob') push('fecha_nacimiento', splitList(v)[0] || v);
  else if (key === 'employer') splitList(v).filter((x) => !(DATE_RE.test(x) && x.length < 20)).forEach((x) => push('empleador', x.replace(DATE_RE, '').trim()));
  else if (key === 'phone') (v.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || []).forEach((x) => push('telefono', x));
  else if (key === 'curAddr' || key === 'prevAddr') {
    groupAddresses(v).forEach((a) => push('direccion', a.value, { tipo: key === 'curAddr' ? 'actual' : 'anterior', fecha: a.date || null }));
  }
}

function scanLates(block, cells, values) {
  const re = /30\s*[:=]?\s*(\d+)\D{0,6}60\s*[:=]?\s*(\d+)\D{0,6}90\s*[:=]?\s*(\d+)/;
  let found = false;
  if (values) {
    for (const b of BUREAUS) {
      const m = (values[b] || '').match(re);
      if (m) { found = true; setLates(block, b, m); }
    }
  }
  if (!found) {
    const text = cells.join(' ');
    const re2 = /(transunion|experian|equifax)\s*:?\s*30\s*[:=]?\s*(\d+)\D{0,6}60\s*[:=]?\s*(\d+)\D{0,6}90\s*[:=]?\s*(\d+)/gi;
    let m;
    while ((m = re2.exec(text))) setLates(block, bureauOf(m[1]), [null, m[2], m[3], m[4]]);
  }
}
function setLates(block, b, m) {
  block.lates = block.lates || {};
  block.lates[b] = { l30: +m[1], l60: +m[2], l90: +m[3] };
}

function finishBlock(block, res) {
  for (const b of BUREAUS) {
    const f = block.fields[b];
    const hasData = ['number', 'balance', 'accountStatus', 'paymentStatus', 'dateOpened', 'type', 'highCredit', 'dateFiled'].some((k) => val(f[k]));
    if (!hasData) continue;
    const hist = block.history[b] || [];
    let l30 = 0, l60 = 0, l90 = 0;
    hist.forEach((h) => {
      if (h === '30') l30++; else if (h === '60') l60++;
      else if (['90', '120', '150', '180'].includes(h)) l90++;
    });
    const ls = block.lates?.[b];
    if (ls) { l30 = Math.max(l30, ls.l30); l60 = Math.max(l60, ls.l60); l90 = Math.max(l90, ls.l90); }
    const name = (val(f.creditorName) || block.title || val(f.type) || 'Sin nombre').replace(/\s+/g, ' ').trim();
    const a = {
      bureau: b,
      name,
      account_number: val(f.number),
      original_creditor: val(f.originalCreditor),
      account_type: [val(f.type), val(f.typeDetail)].filter(Boolean).join(' — ') || null,
      balance: money(f.balance),
      past_due: money(f.pastDue),
      high_credit: money(f.highCredit),
      credit_limit: money(f.creditLimit),
      monthly_payment: money(f.monthly),
      date_opened: val(f.dateOpened) || val(f.dateFiled),
      last_reported: val(f.lastReported),
      account_status: val(f.accountStatus),
      payment_status: val(f.paymentStatus),
      comments: val(f.comments),
      late_30: l30, late_60: l60, late_90: l90,
      extra: {
        typeDetail: val(f.typeDetail), creditorType: val(f.creditorType), responsibility: val(f.responsibility),
        lastActive: val(f.lastActive), lastPayment: val(f.lastPayment), terms: val(f.terms), dofd: val(f.dofd),
        court: val(f.court), dateClosed: val(f.dateClosed),
        history: hist.length ? hist.join(' ') : null,
      },
    };
    if (/collection|factoring/i.test(block.title) && !a.extra.creditorType) a.extra.creditorType = 'Collection';
    a.category = classify(a, block.section);
    a.is_negative = a.category !== 'positiva';
    res.accounts.push(a);
  }
}

function parseInquiryRow(cells, ctxBureau, header, mapValues, row) {
  const out = [];
  const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
  if (!nonEmpty.length) return out;
  if (/creditor name|date of inquiry|inquiry date|type of business/i.test(nonEmpty.join(' '))) return out;
  const bIdx = nonEmpty.findIndex((c) => bureauOf(c));
  let dIdx = nonEmpty.findIndex((c) => DATE_RE.test(c) && c.length <= 12);
  let extraName = null;
  if (dIdx < 0 && bIdx >= 0) {
    dIdx = nonEmpty.findIndex((c, i) => i !== bIdx && DATE_RE.test(c));
    if (dIdx >= 0) extraName = nonEmpty[dIdx].replace(DATE_RE, '').trim() || null;
  }
  if (dIdx >= 0 && (bIdx >= 0 || ctxBureau)) {
    const rest = nonEmpty.filter((_, i) => i !== bIdx && i !== dIdx);
    if (extraName) rest.unshift(extraName);
    out.push({
      bureau: bIdx >= 0 ? bureauOf(nonEmpty[bIdx]) : ctxBureau,
      name: rest[0] || 'Sin nombre',
      business_type: rest[1] || null,
      item_date: nonEmpty[dIdx].match(DATE_RE)[0],
    });
    return out;
  }
  // formato de columnas por bureau: acreedor | fecha TU | fecha EX | fecha EQ
  if (header && nonEmpty.length >= 2) {
    const m = mapValues(row);
    if (m && m.label && !DATE_RE.test(m.label)) {
      for (const b of BUREAUS) {
        const d = (m.values[b] || '').match(DATE_RE);
        if (d) out.push({ bureau: b, name: m.label.replace(/[:：]$/, ''), item_date: d[0], business_type: null });
      }
    }
  }
  return out;
}

export function detectProvider(text) {
  const t = low(text);
  if (t.includes('identityiq') || t.includes('identity iq')) return 'IdentityIQ';
  if (t.includes('smartcredit') || t.includes('smart credit')) return 'SmartCredit';
  if (t.includes('myscoreiq') || t.includes('my score iq')) return 'MyScoreIQ';
  if (t.includes('myfreescorenow') || t.includes('my free score now')) return 'MyFreeScoreNow';
  if (t.includes('privacyguard')) return 'PrivacyGuard';
  if (t.includes('annualcreditreport')) return 'AnnualCreditReport';
  return 'Otro';
}
