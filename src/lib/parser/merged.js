// Lector de reportes hipotecarios "tri-merge" (MeridianLink, Premium Credit Bureau, CreditXpert, etc.)
// Cada cuenta aparece UNA vez con la columna SOURCE (XP/TU/EF) que dice en qué bureaus reporta.
import { classify, money } from './parse.js';

const SRC_RE = /^(?:XP|TU|EF|EX|EQ|TR)(?:\/(?:XP|TU|EF|EX|EQ|TR))*$/;
const SRC_MAP = { XP: 'EX', EX: 'EX', TU: 'TU', TR: 'TU', EF: 'EQ', EQ: 'EQ' };
const DATE2 = /^(\d{2}\/\d{2}|--\/--)$/;
const MONEY = /^(\$[\d,]+(\.\d+)?\*?|-)$/;
const INT = /^\d{1,3}$/;
const TYPE_MAP = { REV: 'Revolving', INST: 'Installment', OPEN: 'Open', AUTO: 'Auto', LEAS: 'Lease', MTG: 'Mortgage', MORT: 'Mortgage', EDU: 'Education', CHG: 'Charge account' };
const COL_TOKENS = new Set(['W', 'E', 'H', 'C', 'O', 'S', 'A', 'DATE', 'HIGH', 'CREDIT', 'BALANCE', 'STATUS', 'OPENED', 'OR', 'LIMIT', 'PAST', 'MO', 'CREDITOR', '30', '60', '90+', 'REPORTED', 'DUE', 'REV', 'DLA', 'ACCT', 'TYPE', 'TERMS', 'SOURCE', 'ECOA', 'WHOSE']);

export function isMergedReport(text) {
  const t = (text || '').toUpperCase();
  const hits = ['TRADELINES', 'REPOSITORIES', 'SOURCE OF INFORMATION', 'ECOA KEY', 'MERIDIANLINK', 'CREDITXPERT', 'DEROGATORY SUMMARY', 'TRADE SUMMARY', 'FNMA'].filter((k) => t.includes(k)).length;
  return hits >= 3 && /\b(XP|TU|EF)\/(XP|TU|EF)\b/.test(t);
}

const srcBureaus = (tok) => [...new Set(tok.split('/').map((s) => SRC_MAP[s]).filter(Boolean))];

export function parseTradeLine(line) {
  const t = line.trim().split(/\s+/);
  if (t.length < 10 || !/^[A-Z]$/.test(t[0]) || !/^[A-Z]$/.test(t[1])) return null;
  let i = 2;
  while (i < t.length && !/^\d{2}\/\d{2}$/.test(t[i])) i++;
  if (i === 2 || i >= t.length - 6) return null;
  const creditor = t.slice(2, i).join(' ');
  const reported = t[i];
  if (!DATE2.test(t[i + 1] || '')) return null;
  const opened = t[i + 1] === '--/--' ? null : t[i + 1];
  let j = i + 2;
  const moneys = [];
  while (j < t.length && MONEY.test(t[j]) && moneys.length < 4) moneys.push(t[j++]);
  const ints = [];
  while (j < t.length && INT.test(t[j]) && ints.length < 4) ints.push(+t[j++]);
  if (moneys.length < 2 || ints.length < 4) return null;
  // columnas: HIGH CREDIT/LIMIT, (pago), BALANCE, PAST DUE
  const [high, bal, past] = moneys.length >= 3 ? [moneys[0], moneys[moneys.length - 2], moneys[moneys.length - 1]] : [moneys[0], moneys[1], null];
  return {
    ecoa: t[0], whose: t[1], creditor, reported, opened,
    high: money(high), balance: money(bal), pastDue: money(past),
    months: ints[0], l30: ints[1], l60: ints[2], l90: ints[3],
    status: t.slice(j).join(' '),
  };
}

export function parseMergedReport(rows) {
  const res = { provider: 'Tri-merge (hipotecario)', reportDate: null, bureaus: [], scores: {}, personal: [], accounts: [], inquiries: [], creditorContacts: [], summary: {}, warnings: [], applicant: {} };
  const lines = rows.map((r) => ({ text: r.cells.filter((c) => c && c.trim()).join(' ').replace(/\s+/g, ' ').trim(), cells: r.cells.map((c) => (c || '').trim()).filter(Boolean) })).filter((l) => l.text);
  const hasHeader = lines.some((l) => l.text.startsWith('FILE #'));

  // ---- datos del encabezado (se repiten en cada página)
  for (const { text } of lines) {
    let m;
    if (!res.reportDate && (m = text.match(/DATE COMPLETED\s+(\d{1,2}\/\d{1,2}\/\d{4})/))) res.reportDate = m[1];
    if (!res.applicant.name && (m = text.match(/^APPLICANT\s+(.+?)(?:\s+CO-APPLICANT.*)?$/)) && !/^CO-APPLICANT/.test(m[1])) res.applicant.name = m[1].trim();
    if (!res.applicant.ssn && (m = text.match(/SOC SEC #\s+(\d{3}-?\d{2}-?\d{4})/))) res.applicant.ssn = m[1];
    if (!res.applicant.dob && (m = text.match(/SOC SEC #.*?\bDOB\s+(\d{1,2}\/\d{1,2}\/\d{4})/))) res.applicant.dob = m[1];
    if (!res.applicant.address && (m = text.match(/^CURRENT ADDRESS\s+(.+?)(?:\s+LENGTH\b.*)?$/))) res.applicant.address = m[1].trim();
  }

  // ---- limpiar encabezados y pies de página
  const clean = [];
  let skip = hasHeader ? 'pre' : null;
  for (const l of lines) {
    const t = l.text;
    if (skip === 'pre') { if (t.startsWith('FILE #')) skip = 'header'; else continue; }
    if (t.startsWith('FILE #')) { skip = 'header'; continue; }
    if (skip === 'header') { if (/^MARITAL STATUS/.test(t)) skip = null; continue; }
    if (/^ECOA KEY/.test(t)) { skip = 'footer'; continue; }
    if (skip === 'footer') { if (/^Page \d+\s*\/\s*\d+/i.test(t)) skip = null; continue; }
    clean.push(l);
  }

  let section = null; let block = null; let contact = null; let srcB = null; let scoreB = null; let addrIdx = {};
  const flush = () => { if (block) finishTrade(block, res); block = null; };
  const HEAD = [
    [/^SCORE MODELS$/, 'scores'], [/^TRADELINES$/, 'trades'], [/^INQUIRIES/, 'inquiries'], [/^PUBLIC RECORDS$/, 'public'],
    [/^CREDITORS$/, 'creditors'], [/^MISCELLANEOUS INFORMATION$/, 'misc'], [/^ALERT$/, 'misc'], [/^TRADE SUMMARY$/, 'misc'],
    [/^DEROGATORY SUMMARY$/, 'misc'], [/^SOURCE OF INFORMATION$/, 'source'], [/^DISCLAIMER$/, 'misc'], [/^(CURRENT|PREVIOUS) ADDRESS/, 'misc'],
  ];

  for (const { text, cells } of clean) {
    const head = HEAD.find(([re]) => re.test(text));
    if (head) {
      if (head[1] !== 'trades' || section !== 'trades') flush();
      section = head[1]; contact = null;
      continue;
    }
    if (/^Request New Tradeline/i.test(text) || /END OF REPORT/.test(text)) continue;

    if (section === 'scores') {
      let m;
      if ((m = text.match(/^(EQUIFAX|TRANSUNION|EXPERIAN)\b/))) scoreB = { EQUIFAX: 'EQ', TRANSUNION: 'TU', EXPERIAN: 'EX' }[m[1]];
      else if ((m = text.match(/^SCORE:\s*(\d{3})/)) && scoreB) res.scores[scoreB] = +m[1];
      continue;
    }

    if (section === 'trades') {
      if (text.split(' ').every((w) => COL_TOKENS.has(w))) continue;
      const tl = parseTradeLine(text);
      if (tl) { flush(); block = { ...tl, remarks: [], nameExtra: [] }; continue; }
      if (!block) continue;
      const toks = text.split(' ');
      const last = toks[toks.length - 1];
      if (!block.source && SRC_RE.test(last)) {
        block.source = last;
        const dIdx = toks.findIndex((x) => DATE2.test(x));
        const before = dIdx > 0 ? toks.slice(0, dIdx) : [];
        if (before.length && before.some((x) => /\d/.test(x))) block.acct = before.join('');
        else if (before.length) block.nameExtra.push(before.join(' '));
        if (dIdx >= 0) {
          block.dla = toks[dIdx] === '--/--' ? null : toks[dIdx];
          block.type = toks[dIdx + 1] && !SRC_RE.test(toks[dIdx + 1]) ? toks[dIdx + 1] : null;
          block.terms = toks.slice(dIdx + 2, -1).join(' ');
        }
        continue;
      }
      if (!block.acct && toks.length === 1 && /\d{4,}/.test(text) && block.source) { block.acct = text; continue; }
      if (!block.source && toks.length <= 3 && /^[A-Z&.' ]+$/.test(text)) { block.nameExtra.push(text); continue; }
      block.remarks.push(text);
      continue;
    }

    if (section === 'inquiries') {
      if (/NONE/.test(text)) continue;
      const m = text.match(/^(.*?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{2}\/\d{2})\b.*?((?:XP|TU|EF)(?:\/(?:XP|TU|EF))*)\s*$/);
      if (m && m[1] && !/CREDITOR|DATE/.test(m[1])) srcBureaus(m[3]).forEach((b) => res.inquiries.push({ bureau: b, name: m[1].trim(), item_date: m[2], business_type: null }));
      continue;
    }

    if (section === 'public') {
      if (!/NONE/.test(text)) res.warnings.push('El reporte tiene registros públicos: revísalos y agrégalos a mano si hace falta.');
      continue;
    }

    if (section === 'creditors') {
      if (cells.length === 1 && contact && /^[A-Z&.' ]{2,20}$/.test(text) && !/\d/.test(text)) { contact.name += ' ' + text; continue; }
      const name = cells[0];
      const phone = (text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\s*$/) || [])[0] || null;
      let address = cells.slice(1).join(' ').replace(phone || '\u0000', '').replace(/^[\s,]+|[\s,]+$/g, '').trim();
      if (cells.length === 1) {
        const m = text.match(/^(.+?)\s{0,}((?:P\s?O\s?B(?:OX)?|POB|\d+)\s.+?\d{5}(?:-\d{4})?)/i);
        contact = m ? { name: m[1].trim(), address: m[2].trim(), phone } : null;
      } else contact = { name: name.replace(/[\s,]+$/, ''), address: address || null, phone };
      if (contact) res.creditorContacts.push(contact);
      continue;
    }

    if (section === 'source') {
      let m;
      if ((m = text.match(/^\d\s+(EXPERIAN|TRANSUNION|EQUIFAX)\b/))) { srcB = { EQUIFAX: 'EQ', TRANSUNION: 'TU', EXPERIAN: 'EX' }[m[1]]; addrIdx[srcB] = 0; continue; }
      if (!srcB) continue;
      if ((m = text.match(/^NAME:\s*(.*)$/))) {
        const dob = (m[1].match(/DOB:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/) || [])[1];
        const nm = m[1].replace(/DOB:.*$/, '').replace(/\b\d{9}\b.*$/, '').trim();
        if (nm) res.personal.push({ bureau: srcB, category: 'nombre', name: nm, extra: {} });
        if (dob) res.personal.push({ bureau: srcB, category: 'fecha_nacimiento', name: dob, extra: {} });
        continue;
      }
      if ((m = text.match(/^ADDRESS:\s*(.+?)(?:\s+-\s+REPORTED\s+(.*))?$/))) {
        const i = addrIdx[srcB]++;
        res.personal.push({ bureau: srcB, category: 'direccion', name: m[1].trim(), extra: { tipo: i === 0 ? 'actual' : 'anterior', fecha: m[2] || null } });
        continue;
      }
      if ((m = text.match(/^EMPLOYER:\s*(.+?)(?:\s+-\s+REPORTED.*)?$/))) {
        const parts = [...new Set(m[1].split('/').map((s) => s.trim()).filter(Boolean))];
        parts.forEach((p) => res.personal.push({ bureau: srcB, category: 'empleador', name: p, extra: {} }));
        continue;
      }
      if ((m = text.match(/^PHONE:\s*(.+)$/))) { res.personal.push({ bureau: srcB, category: 'telefono', name: m[1].trim(), extra: {} }); continue; }
      continue;
    }
  }
  flush();

  // quitar duplicados de info personal
  const seen = new Set();
  res.personal = res.personal.filter((p) => { const k = `${p.bureau}|${p.category}|${p.name.toUpperCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const bs = new Set([...Object.keys(res.scores), ...res.accounts.map((a) => a.bureau), ...res.personal.map((p) => p.bureau)]);
  res.bureaus = ['TU', 'EX', 'EQ'].filter((b) => bs.has(b));
  if (!res.accounts.length) res.warnings.push('No se detectaron cuentas en el reporte tri-merge.');
  return res;
}

function finishTrade(b, res) {
  const bureaus = srcBureaus(b.source || 'XP/TU/EF');
  const remarks = b.remarks.join('; ');
  const orig = (remarks.match(/ORIGINAL CREDITOR:\s*([^;]+)/i) || [])[1]?.trim() || null;
  const lateDates = (remarks.match(/Late Dates:\s*([^;]+?)(?:\(See status\))?(?:,\s*)?(?=;|$)/i) || [])[1]?.trim() || null;
  const base = {
    name: [b.creditor, ...b.nameExtra].join(' ').replace(/\s+/g, ' ').trim(),
    account_number: b.acct || null,
    original_creditor: orig,
    account_type: TYPE_MAP[b.type] || b.type || null,
    balance: b.balance, past_due: b.pastDue, high_credit: b.high, credit_limit: b.type === 'REV' ? b.high : null, monthly_payment: null,
    date_opened: b.opened, last_reported: b.reported,
    account_status: b.status || null, payment_status: b.status || null,
    comments: remarks.replace(/Late Dates:[^;]*;?\s*/i, '').trim() || null,
    late_30: b.l30, late_60: b.l60, late_90: b.l90,
    extra: { ecoa: b.ecoa, lastActive: b.dla || null, terms: b.terms || null, lateDates, source: b.source || null, authorizedUser: b.ecoa === 'A' || /AUTHORIZED USER/i.test(remarks) },
  };
  base.category = classify(base, /COLLECTION|FACTORING/i.test(`${b.status} ${remarks}`) ? 'collections' : 'accounts');
  base.is_negative = base.category !== 'positiva';
  bureaus.forEach((bu) => res.accounts.push({ ...base, bureau: bu, extra: { ...base.extra } }));
}
