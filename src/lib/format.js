export const money = (n) => (n == null || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const fullName = (c) => [c?.first_name, c?.middle_name, c?.last_name, c?.suffix].filter(Boolean).join(' ') || c?.username || 'Sin nombre';
export const initials = (c) => ((c?.first_name || '?')[0] + (c?.last_name || '')[0] || '').toUpperCase();
export function fmtDate(d, opts) {
  if (!d) return '—';
  const s = String(d);
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
  if (isNaN(dt)) return s;
  return dt.toLocaleDateString('es-US', opts || { year: 'numeric', month: 'short', day: 'numeric' });
}
export const today = () => new Date().toISOString().slice(0, 10);
export const letterDate = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
export function toISODate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return null;
}
export const ssn4 = (ssn) => (ssn || '').replace(/\D/g, '').slice(-4);
export const maskSSN = (ssn) => { const d = (ssn || '').replace(/\D/g, ''); return d ? `***-**-${d.slice(-4)}` : '—'; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
