import { toISODate } from './format.js';

export function suggestClientFields(parsed) {
  const pick = (cat) => ['TU', 'EX', 'EQ'].map((b) => parsed.personal.find((p) => p.bureau === b && p.category === cat)).find(Boolean);
  const out = {};
  const ap = parsed.applicant;
  if (ap?.name) {
    const [last, rest] = ap.name.includes(',') ? ap.name.split(',').map((x) => x.trim()) : [null, ap.name];
    const w = (rest || '').split(/\s+/).filter(Boolean);
    if (last) { out.last_name = cap(last); out.first_name = cap(w[0]); if (w.length > 1) out.middle_name = cap(w.slice(1).join(' ')); }
  }
  if (ap?.ssn) out.ssn = ap.ssn;
  if (ap?.dob && toISODate(ap.dob)) out.dob = toISODate(ap.dob);
  if (ap?.address) parsed = { ...parsed, personal: [{ bureau: 'TU', category: 'direccion', name: ap.address, extra: { tipo: 'actual' } }, ...parsed.personal] };
  const name = out.first_name ? null : pick('nombre');
  if (name) {
    const w = name.name.split(/\s+/);
    out.first_name = cap(w[0]);
    if (w.length > 2) { out.middle_name = cap(w.slice(1, -1).join(' ')); }
    if (w.length > 1) out.last_name = cap(w[w.length - 1]);
  }
  const dob = parsed.personal.find((p) => p.category === 'fecha_nacimiento' && toISODate(p.name));
  if (dob && !out.dob) out.dob = toISODate(dob.name);
  const addr = parsed.personal.find((p) => p.category === 'direccion' && p.extra?.tipo === 'actual') || parsed.personal.find((p) => p.category === 'direccion');
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
