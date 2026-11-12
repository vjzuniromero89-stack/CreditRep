import test from 'node:test';
import assert from 'node:assert/strict';
import { addSignature, companyReady, consentState, contractHtml, disclosureHtml, feeTable, mdy, todayNewYork } from '../src/lib/consent.js';

const settings = { company_name: 'Crédito Pro LLC', company_address: '100 Main St\nMiami, FL 33130', company_phone: '(305) 555-0100', fee_coleccion: 80, fee_personal: 10 };
const client = { first_name: 'Ana', last_name: 'Ruiz', address: '1 Oak St', city: 'Miami', state: 'FL', zip: '33101' };
const items = [
  { kind: 'cuenta', category: 'coleccion', is_negative: true, status: 'activa' },
  { kind: 'cuenta', category: 'coleccion', is_negative: true, status: 'activa' },
  { kind: 'cuenta', category: 'coleccion', is_negative: true, status: 'eliminada' },
  { kind: 'personal', category: 'direccion', status: 'activa' },
  { kind: 'cuenta', category: 'positiva', is_negative: false, status: 'activa' },
];

test('estado del contrato', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  assert.equal(consentState(null, now), 'sin_firmar');
  assert.equal(consentState({ cancelled_at: '2026-11-19T00:00:00Z', can_start_at: '2026-11-18T08:00:00Z' }, now), 'cancelado');
  assert.equal(consentState({ can_start_at: '2026-11-21T08:00:00Z' }, now), 'espera');
  assert.equal(consentState({ can_start_at: '2026-11-18T08:00:00Z' }, now), 'vigente');
});

test('sin nombre ni dirección de la empresa no se puede firmar', () => {
  assert.equal(companyReady({ company_name: 'Mi Empresa de Crédito', company_address: 'x' }), false);
  assert.equal(companyReady({ company_name: 'Crédito Pro LLC', company_address: '' }), false);
  assert.equal(companyReady(settings), true);
});

test('total máximo: solo lo que sigue en el reporte y tiene precio', () => {
  const { max, rows } = feeTable(settings, items);
  assert.equal(max, 2 * 80 + 1 * 10);
  assert.equal(rows.find((r) => r.key === 'fee_coleccion').count, 2);
});

test('el contrato tiene lo que exige la CROA, palabra por palabra', () => {
  const h = contractHtml({ settings, client, items, deadlineISO: '2026-11-17' });
  assert.match(h, /You may cancel this contract without penalty or obligation at any time before midnight of the 3rd business day after the date on which you signed the contract\. See the attached notice of cancellation form for an explanation of this right\./);
  assert.equal((h.match(/Notice of Cancellation/g) || []).length, 2, 'el aviso va en duplicado');
  assert.match(h, /before midnight on 11\/17\/2026/);
  assert.match(h, /I hereby cancel this transaction,/);
  assert.match(h, /Crédito Pro LLC/);
  assert.match(h, /100 Main St/);
  assert.match(h, /Total máximo de todos los pagos: \$170\.00/);
  assert.match(h, /No garantizamos ningún resultado/);
});

test('la firma queda justo después de la frase en negrita, antes de los avisos', () => {
  const h = addSignature(contractHtml({ settings, client, items, deadlineISO: '2026-11-17' }), '<p class="firma">FIRMA</p>');
  const bold = h.indexOf('Vea el aviso de cancelación adjunto');
  const firma = h.indexOf('FIRMA');
  const aviso = h.indexOf('Notice of Cancellation');
  assert.ok(bold < firma && firma < aviso);
  assert.ok(firma - bold < 200, 'la firma va pegada a la frase');
  assert.match(h, /Retirar este consentimiento/);
  assert.match(h, /Copia en papel/);
});

test('el documento de derechos es el texto de la ley', () => {
  const d = disclosureHtml();
  assert.match(d, /Consumer Credit File Rights Under State and Federal Law/);
  assert.match(d, /You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it\./);
  assert.match(d, /Washington, D\.C\. 20580/);
});

test('el nombre de la empresa se escapa (no se inyecta HTML)', () => {
  const h = contractHtml({ settings: { ...settings, company_name: '<img src=x onerror=alert(1)>' }, client, items, deadlineISO: '2026-11-17' });
  assert.ok(!h.includes('<img'));
});

test('fechas', () => {
  assert.equal(mdy('2026-11-17'), '11/17/2026');
  assert.equal(todayNewYork(new Date('2026-11-13T03:30:00Z')), '2026-11-12');   // 10:30 pm del 12 en Nueva York
});
