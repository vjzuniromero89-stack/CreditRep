// Base de datos falsa en memoria (solo para pruebas locales de la interfaz)
const KEY = 'crmockdb2';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const H = '{{cliente_nombre}}\n{{cliente_direccion}}\n{{cliente_ciudad_estado_zip}}\nDate of Birth: {{cliente_dob}}\nSSN: XXX-XX-{{cliente_ssn4}}\n\n{{fecha}}\n\n{{destinatario_nombre}}\n{{destinatario_direccion}}\n\n';
const F = '\n\nSincerely,\n\n{{cliente_nombre}}';
const TEMPLATES = [
  { name: 'Ronda 1 – Disputa de cuentas', purpose: 'disputa_cuentas', recipient: 'bureau', applies_to: 'cuenta', round: 1, default_reason: 'This information is inaccurate and cannot be verified.', body: H + 'RE: Request for Investigation\n\nI dispute the following:\n\n{{lista_items}}' + F },
  { name: 'Ronda 2 – Método de verificación', purpose: 'disputa_cuentas', recipient: 'bureau', applies_to: 'cuenta', round: 2, default_reason: 'Provide method of verification.', body: H + 'RE: Method of Verification\n\n{{lista_items}}' + F },
  { name: 'Información personal incorrecta', purpose: 'personal', recipient: 'bureau', applies_to: 'personal', round: 1, default_reason: 'This information does not belong to me / is outdated.', body: H + 'RE: Correct Personal Information\n\n{{lista_items}}' + F },
  { name: 'Inquiries no autorizadas', purpose: 'inquiries', recipient: 'bureau', applies_to: 'inquiry', round: 1, default_reason: 'I did not authorize this inquiry.', body: H + 'RE: Unauthorized Inquiries\n\n{{lista_items}}' + F },
  { name: 'Validación de deuda', purpose: 'validacion', recipient: 'acreedor', applies_to: 'cuenta', round: 1, default_reason: 'Please validate this debt.', attach_bill: false, body: H + 'RE: Debt Validation\n\n{{lista_items}}' + F },
  { name: 'Carta de buena voluntad (pagos tarde)', purpose: 'goodwill', recipient: 'acreedor', applies_to: 'cuenta', round: 1, default_reason: 'Goodwill removal.', attach_id: false, attach_bill: false, body: H + 'RE: Goodwill\n\n{{lista_items}}' + F },
];


function seed() {
  const adminId = uid();
  return {
    users: [{ id: adminId, email: 'admin@test.com', password: 'password123' }],
    cr_admins: [{ user_id: adminId, name: 'Victor', email: 'admin@test.com', created_at: now() }],
    cr_settings: [{ id: 1, company_name: 'Crédito Pro Demo', fee_coleccion: 150, fee_charge_off: 150, fee_pagos_tarde: 75, fee_repo: 200, fee_registro_publico: 200, fee_otro_negativo: 100, fee_inquiry: 0, fee_personal: 0,
      address_tu: 'TransUnion LLC\nConsumer Dispute Center\nP.O. Box 2000\nChester, PA 19016', address_ex: 'Experian\nP.O. Box 4500\nAllen, TX 75013', address_eq: 'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374', allow_public_signup: true }],
    cr_clients: [], cr_documents: [], cr_reports: [], cr_items: [], cr_charges: [], cr_letters: [], cr_activity: [],
    cr_templates: TEMPLATES.map((t) => ({ attach_id: true, attach_bill: true, attach_ssn: false, ...t, id: uid(), active: true, created_at: now(), updated_at: now() })),
    cr_packages: [], cr_creditors: [],
    files: {}, seq: 1000,
  };
}

export function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch { /* */ }
  const d = seed(); save(d); return d;
}
export function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

const DEFAULTS = {
  cr_clients: (d) => ({ status: 'nuevo', source: 'admin', intake_completed: false, reviewed: true, client_no: ++d.seq, created_at: now(), updated_at: now(), start_date: now().slice(0, 10) }),
  cr_items: () => ({ status: 'activa', dispute_round: 0, late_30: 0, late_60: 0, late_90: 0, reappeared: false, extra: {}, is_negative: false, created_at: now(), updated_at: now() }),
  cr_charges: () => ({ status: 'pendiente', created_at: now() }),
  cr_letters: () => ({ status: 'generada', created_at: now(), item_ids: [] }),
  cr_templates: () => ({ active: true, round: 1, created_at: now(), updated_at: now() }),
  default: () => ({ created_at: now() }),
};

export function insert(d, table, row) {
  const def = (DEFAULTS[table] || DEFAULTS.default)(d);
  const r = { id: table === 'cr_settings' ? 1 : uid(), ...def, ...stripUndef(row) };
  if (table === 'cr_admins') delete r.id;
  (d[table] = d[table] || []).push(r);
  return r;
}
function stripUndef(o) { const r = {}; Object.entries(o).forEach(([k, v]) => { if (v !== undefined) r[k] = v; }); return r; }
