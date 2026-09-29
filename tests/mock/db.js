// Base de datos falsa en memoria (solo para pruebas locales de la interfaz)
const KEY = 'crmockdb';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const TEMPLATES = [
  { name: 'Ronda 1 – Disputa de cuentas', recipient: 'bureau', applies_to: 'cuenta', round: 1, default_reason: 'This information is inaccurate and cannot be verified.',
    body: '{{cliente_nombre}}\n{{cliente_direccion}}\n{{cliente_ciudad_estado_zip}}\nDate of Birth: {{cliente_dob}}\nSSN: XXX-XX-{{cliente_ssn4}}\n\n{{fecha}}\n\n{{destinatario_nombre}}\n{{destinatario_direccion}}\n\nRE: Request for Investigation\n\nTo Whom It May Concern:\n\nI dispute the following:\n\n{{lista_items}}\n\nPlease delete.\n\nSincerely,\n\n{{cliente_nombre}}' },
  { name: 'Inquiries no autorizadas', recipient: 'bureau', applies_to: 'inquiry', round: 1, default_reason: 'I did not authorize this inquiry.', body: '{{cliente_nombre}}\n\n{{destinatario_nombre}}\n{{destinatario_direccion}}\n\n{{lista_items}}' },
  { name: 'Validación de deuda', recipient: 'acreedor', applies_to: 'cuenta', round: 1, default_reason: 'Please validate this debt.', body: '{{cliente_nombre}}\n\n{{destinatario_nombre}}\n{{destinatario_direccion}}\n\n{{lista_items}}' },
];

function seed() {
  const adminId = uid();
  return {
    users: [{ id: adminId, email: 'admin@test.com', password: 'password123' }],
    cr_admins: [{ user_id: adminId, name: 'Victor', email: 'admin@test.com', created_at: now() }],
    cr_settings: [{ id: 1, company_name: 'Crédito Pro Demo', fee_coleccion: 150, fee_charge_off: 150, fee_pagos_tarde: 75, fee_repo: 200, fee_registro_publico: 200, fee_otro_negativo: 100, fee_inquiry: 0, fee_personal: 0,
      address_tu: 'TransUnion LLC\nConsumer Dispute Center\nP.O. Box 2000\nChester, PA 19016', address_ex: 'Experian\nP.O. Box 4500\nAllen, TX 75013', address_eq: 'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374', allow_public_signup: true }],
    cr_clients: [], cr_documents: [], cr_reports: [], cr_items: [], cr_charges: [], cr_letters: [], cr_activity: [],
    cr_templates: TEMPLATES.map((t) => ({ ...t, id: uid(), active: true, created_at: now(), updated_at: now() })),
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
