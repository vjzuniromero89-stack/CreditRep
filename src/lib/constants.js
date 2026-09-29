export const CLIENT_EMAIL_DOMAIN = 'clientes.creditopro.app';
export const usernameToEmail = (u) => `${String(u || '').trim().toLowerCase()}@${CLIENT_EMAIL_DOMAIN}`;

export const BUREAUS = ['TU', 'EX', 'EQ'];
export const BUREAU_NAME = { TU: 'TransUnion', EX: 'Experian', EQ: 'Equifax' };
export const BUREAU_COLOR = {
  TU: 'bg-sky-100 text-sky-800 ring-sky-200',
  EX: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  EQ: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const ACCOUNT_CATEGORIES = {
  coleccion: { label: 'Colección', color: 'bg-red-100 text-red-800 ring-red-200' },
  charge_off: { label: 'Charge-off', color: 'bg-orange-100 text-orange-800 ring-orange-200' },
  pagos_tarde: { label: 'Pagos tarde', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
  repo: { label: 'Repo / Embargo', color: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200' },
  registro_publico: { label: 'Registro público', color: 'bg-purple-100 text-purple-800 ring-purple-200' },
  otro_negativo: { label: 'Otro negativo', color: 'bg-yellow-100 text-yellow-800 ring-yellow-200' },
  positiva: { label: 'Positiva', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
};

export const PERSONAL_CATEGORIES = {
  nombre: 'Nombre',
  alias: 'Alias / AKA',
  direccion: 'Dirección',
  telefono: 'Teléfono',
  empleador: 'Empleador',
  fecha_nacimiento: 'Fecha de nacimiento',
};

export const ITEM_STATUS = {
  activa: { label: 'Activa', color: 'bg-slate-100 text-slate-700 ring-slate-200' },
  en_disputa: { label: 'En disputa', color: 'bg-blue-100 text-blue-800 ring-blue-200' },
  eliminada: { label: 'Eliminada', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  verificada: { label: 'Verificada', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
};

export const CLIENT_STATUS = {
  nuevo: { label: 'Nuevo', color: 'bg-sky-100 text-sky-800 ring-sky-200' },
  activo: { label: 'Activo', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  en_pausa: { label: 'En pausa', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
  completado: { label: 'Completado', color: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  cancelado: { label: 'Cancelado', color: 'bg-slate-200 text-slate-700 ring-slate-300' },
};

export const CHARGE_STATUS = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
  pagado: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  anulado: { label: 'Anulado', color: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const LETTER_STATUS = {
  generada: { label: 'Generada', color: 'bg-slate-100 text-slate-700 ring-slate-200' },
  enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-800 ring-blue-200' },
  respondida: { label: 'Respondida', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
};

export const DOC_TYPES = {
  licencia_frente: 'Licencia / ID (frente)',
  licencia_atras: 'Licencia / ID (atrás)',
  bill: 'Bill / Comprobante de dirección',
  ssn: 'Tarjeta de Seguro Social',
  otro: 'Otro documento',
};

export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR'];

export const DISPUTE_REASONS = [
  'This account does not belong to me.',
  'This information is inaccurate and cannot be verified.',
  'The balance reported is incorrect.',
  'The payment history reported is inaccurate.',
  'The dates reported are inaccurate.',
  'This account was paid / settled and is reported incorrectly.',
  'This is a duplicate account.',
  'I did not authorize this inquiry.',
  'This information does not belong to me / is outdated.',
];

export const TEMPLATE_PURPOSES = {
  disputa_cuentas: 'Disputa de cuentas (bureau)',
  personal: 'Limpiar información personal (bureau)',
  inquiries: 'Inquiries (bureau)',
  validacion: 'Validación de deuda (acreedor/cobrador)',
  goodwill: 'Buena voluntad – pagos tarde (acreedor)',
  otro: 'Otra',
};
