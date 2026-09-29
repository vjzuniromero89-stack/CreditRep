import { BUREAU_NAME, PERSONAL_CATEGORIES } from './constants';
import { esc, fullName, letterDate, money, ssn4 } from './format';

export const PLACEHOLDERS = [
  ['{{fecha}}', 'Fecha de hoy (en inglés)'],
  ['{{cliente_nombre}}', 'Nombre completo del cliente'],
  ['{{cliente_direccion}}', 'Calle y número (+ apto)'],
  ['{{cliente_ciudad_estado_zip}}', 'Ciudad, Estado ZIP'],
  ['{{cliente_dob}}', 'Fecha de nacimiento'],
  ['{{cliente_ssn4}}', 'Últimos 4 del SSN'],
  ['{{cliente_ssn}}', 'SSN completo'],
  ['{{cliente_telefono}}', 'Teléfono'],
  ['{{cliente_email}}', 'Email'],
  ['{{destinatario_nombre}}', 'Bureau o acreedor (1ra línea)'],
  ['{{destinatario_direccion}}', 'Dirección del destinatario'],
  ['{{bureau}}', 'TransUnion / Experian / Equifax'],
  ['{{lista_items}}', 'Lista numerada de lo que se disputa'],
  ['{{empresa_nombre}}', 'Nombre de tu empresa'],
];

export function bureauRecipient(bureau, settings) {
  const addr = (settings?.[`address_${bureau.toLowerCase()}`] || '').split('\n');
  return { name: addr[0] || BUREAU_NAME[bureau], address: addr.slice(1).join('\n') };
}

export function itemLine(item, reason) {
  const parts = [];
  if (item.kind === 'cuenta') {
    parts.push(`<b>${esc(item.name)}</b>`);
    if (item.account_number) parts.push(`Account #: ${esc(item.account_number)}`);
    if (item.original_creditor) parts.push(`Original creditor: ${esc(item.original_creditor)}`);
    if (item.balance != null) parts.push(`Balance: ${esc(money(item.balance))}`);
    if (item.date_opened) parts.push(`Opened: ${esc(item.date_opened)}`);
    const lates = [];
    if (item.late_30) lates.push(`30 days late: ${item.late_30}`);
    if (item.late_60) lates.push(`60 days late: ${item.late_60}`);
    if (item.late_90) lates.push(`90+ days late: ${item.late_90}`);
    if (lates.length) parts.push(lates.join(', '));
  } else if (item.kind === 'inquiry') {
    parts.push(`<b>${esc(item.name)}</b>`);
    if (item.item_date) parts.push(`Inquiry date: ${esc(item.item_date)}`);
  } else {
    const label = { nombre: 'Name', alias: 'Name / AKA', direccion: 'Address', telefono: 'Phone number', empleador: 'Employer', fecha_nacimiento: 'Date of birth' }[item.category] || PERSONAL_CATEGORIES[item.category] || 'Item';
    parts.push(`${label}: <b>${esc(item.name)}</b>`);
  }
  let html = parts.join(' — ');
  if (reason) html += `<br><i>Reason: ${esc(reason)}</i>`;
  return html;
}

export function renderLetter({ template, client, recipientName, recipientAddress, bureau, items, reasons = {}, defaultReason, settings }) {
  const cityLine = [client.city, [client.state, client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const street = [client.address, client.address2].filter(Boolean).join(', ');
  const listHtml = `<ol>${items.map((it) => `<li>${itemLine(it, reasons[it.id] || defaultReason)}</li>`).join('')}</ol>`;
  const dob = client.dob ? new Date(client.dob + 'T12:00:00').toLocaleDateString('en-US') : '';
  const map = {
    fecha: esc(letterDate()),
    cliente_nombre: esc(fullName(client)),
    cliente_direccion: esc(street),
    cliente_ciudad_estado_zip: esc(cityLine),
    cliente_dob: esc(dob),
    cliente_ssn4: esc(ssn4(client.ssn)),
    cliente_ssn: esc(client.ssn || ''),
    cliente_telefono: esc(client.phone || ''),
    cliente_email: esc(client.email || ''),
    destinatario_nombre: esc(recipientName || ''),
    destinatario_direccion: esc(recipientAddress || ''),
    bureau: esc(bureau ? BUREAU_NAME[bureau] : ''),
    empresa_nombre: esc(settings?.company_name || ''),
    lista_items: '\u0000LIST\u0000',
  };
  let body = esc(template.body).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => (k in map ? map[k] : m));
  // la lista va como HTML; quitamos saltos de línea alrededor para que no queden huecos
  body = body.replace(/\n?\u0000LIST\u0000\n?/g, listHtml);
  return body;
}
