// Compara el reporte nuevo con lo que ya está guardado del cliente.
// Detecta: nuevos, siguen, ELIMINADOS (para cobrar) y reinsertados.
import { matchKey, normName, digits, BUREAUS } from './parser/parse.js';

export function parsedToItems(parsed, opts = {}) {
  const items = [];
  const onlyNegative = !!opts.onlyNegative;
  parsed.accounts.forEach((a) => {
    if (onlyNegative && !a.is_negative) return;
    items.push({ kind: 'cuenta', ...a });
  });
  parsed.inquiries.forEach((q) => items.push({
    kind: 'inquiry', category: 'inquiry', bureau: q.bureau, name: q.name, item_date: q.item_date,
    account_type: q.business_type || null, is_negative: true, extra: {},
  }));
  parsed.personal.forEach((p) => items.push({
    kind: 'personal', category: p.category, bureau: p.bureau, name: p.name, is_negative: false, extra: p.extra || {},
  }));
  items.forEach((it) => { it.match_key = matchKey(it.kind, it); });
  return items;
}

function sameAccount(a, b) {
  if (a.match_key === b.match_key) return 3;
  if (normName(a.name) !== normName(b.name)) {
    // Mismo número completo aunque el nombre cambie un poco (p.ej. "MIDLAND CREDIT MGMT" vs "MIDLAND CREDIT MANAGEMENT")
    const da = digits(a.account_number); const db = digits(b.account_number);
    if (da.length >= 6 && da === db && normName(a.name).slice(0, 5) === normName(b.name).slice(0, 5)) return 2;
    return 0;
  }
  const da = digits(a.account_number); const db = digits(b.account_number);
  if (da && db && (da.startsWith(db) || db.startsWith(da) || da.endsWith(db) || db.endsWith(da)) && Math.min(da.length, db.length) >= 4) return 2;
  if (a.date_opened && b.date_opened && a.date_opened === b.date_opened) return 1;
  if (!da || !db) return 1;
  return 0;
}

const UPDATABLE = ['name', 'account_number', 'original_creditor', 'account_type', 'balance', 'past_due', 'high_credit', 'credit_limit',
  'monthly_payment', 'date_opened', 'last_reported', 'item_date', 'account_status', 'payment_status', 'comments', 'late_30', 'late_60', 'late_90',
  'category', 'is_negative'];

/**
 * existing: filas cr_items del cliente
 * newItems: salida de parsedToItems
 * bureaus: bureaus incluidos en el reporte nuevo (solo esos se revisan para eliminar)
 */
export function computeDiff(existing, newItems, bureaus = BUREAUS, opts = {}) {
  const plan = { inserts: [], updates: [], removed: [], reappeared: [], unchanged: 0 };
  const used = new Set();
  const byKindBureau = {};
  existing.forEach((e) => {
    const k = e.kind + '|' + e.bureau;
    (byKindBureau[k] = byKindBureau[k] || []).push(e);
  });

  for (const it of newItems) {
    const pool = (byKindBureau[it.kind + '|' + it.bureau] || []).filter((e) => !used.has(e.id));
    let match = null; let score = 0;
    for (const e of pool) {
      const s = it.kind === 'cuenta' ? sameAccount(it, e) : (e.match_key === it.match_key ? 3 : 0);
      if (s > score) { score = s; match = e; }
      if (s === 3) break;
    }
    if (match) {
      used.add(match.id);
      const patch = {};
      UPDATABLE.forEach((f) => {
        if (it[f] !== undefined && it[f] !== null && it[f] !== match[f]) patch[f] = it[f];
      });
      // No bajar la categoría si el usuario la cambió manualmente a algo negativo
      if (match.extra?.manual_category) { delete patch.category; delete patch.is_negative; }
      if (match.status === 'eliminada') {
        patch.status = 'activa'; patch.reappeared = true; patch.removed_at = null; patch.removed_report_id = null;
        plan.reappeared.push({ ...match, ...patch });
      }
      if (it.extra && Object.keys(it.extra).length) patch.extra = { ...(match.extra || {}), ...stripNulls(it.extra) };
      plan.updates.push({ id: match.id, patch, item: match });
      if (Object.keys(patch).length === 0) plan.unchanged++;
    } else {
      plan.inserts.push(it);
    }
  }

  // Lo que estaba y ya no aparece => ELIMINADO
  existing.forEach((e) => {
    if (used.has(e.id)) return;
    if (e.status === 'eliminada') return;
    if (!bureaus.includes(e.bureau)) return;
    if (opts.onlyNegative && e.kind === 'cuenta' && !e.is_negative) return;
    if (opts.kinds && !opts.kinds.includes(e.kind)) return;
    plan.removed.push(e);
  });
  return plan;
}

function stripNulls(o) {
  const r = {};
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') r[k] = v; });
  return r;
}

export function feeFor(item, settings) {
  if (item.fee != null && item.fee !== '') return Number(item.fee);
  if (!settings) return 0;
  if (item.kind === 'inquiry') return Number(settings.fee_inquiry || 0);
  if (item.kind === 'personal') return Number(settings.fee_personal || 0);
  const key = 'fee_' + (item.category || 'otro_negativo');
  return Number(settings[key] ?? settings.fee_otro_negativo ?? 0);
}

// ¿Genera cobro cuando se elimina?
export function isBillable(item, settings) {
  if (item.kind === 'cuenta') return !!item.is_negative;
  return feeFor(item, settings) > 0;
}
