import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPlaceholders } from '../src/lib/templateImport.js';
import { buildPackage, groupEnvelopes, roundUpdates } from '../src/lib/packageBuilder.js';

test('una plantilla importada nunca pide el SSN completo', () => {
  const { text } = autoPlaceholders('Name: [Your Name]\nSocial Security Number: [Your SSN]\nThanks');
  assert.ok(!text.includes('{{cliente_ssn}}'), 'no debe quedar el SSN completo');
  assert.match(text, /XXX-XX-\{\{cliente_ssn4\}\}/);
});

test('sobres: un solo sobre por buró aunque las cartas no vengan seguidas', () => {
  const L = (id, bureau) => ({ id, client_id: 'c1', recipient_type: 'bureau', bureau });
  const envs = groupEnvelopes([L(1, 'TU'), L(2, 'EX'), L(3, 'TU'), { id: 4, client_id: 'c1', recipient_type: 'acreedor', recipient_name: 'Midland' }]);
  assert.equal(envs.length, 3);
  assert.deepEqual(envs[0].letters.map((l) => l.id), [1, 3]);
  assert.equal(envs[2].key, 'A|MIDLAND');
});

test('sobres: dos clientes no comparten sobre', () => {
  const envs = groupEnvelopes([{ id: 1, client_id: 'a', recipient_type: 'bureau', bureau: 'TU' }, { id: 2, client_id: 'b', recipient_type: 'bureau', bureau: 'TU' }]);
  assert.equal(envs.length, 2);
});

test('la ronda sube solo con cartas a burós y toma la más alta', () => {
  const upd = roundUpdates([
    { recipient_type: 'bureau', round: 1, item_ids: ['x', 'y'] },
    { recipient_type: 'bureau', round: 2, item_ids: ['y'] },
    { recipient_type: 'acreedor', round: 3, item_ids: ['z'] },
  ]);
  assert.deepEqual(Object.fromEntries(upd), { x: 1, y: 2 });
});

test('el paquete nunca adjunta la tarjeta del Seguro Social', () => {
  const client = { first_name: 'Ana', last_name: 'Ruiz', address: '1 Main St', city: 'Miami', state: 'FL', zip: '33101', dob: '1990-01-01', ssn_last4: '1234' };
  const items = [{ id: 'i1', kind: 'cuenta', category: 'coleccion', bureau: 'TU', name: 'MIDLAND', account_number: '1234', is_negative: true, status: 'activa', dispute_round: 0 }];
  const templates = [{ id: 'R1', name: 'R1', purpose: 'disputa_cuentas', recipient: 'bureau', round: 1, active: true, attach_id: true, attach_bill: true, attach_ssn: true }];
  const { letters, warnings } = buildPackage({ client, items, templates, docs: [{ doc_type: 'licencia_frente' }, { doc_type: 'bill' }], options: { creditorLetters: false } });
  assert.equal(letters.length, 1);
  assert.equal(letters[0].attach.ssn, undefined);
  assert.ok(!warnings.some((w) => /Seguro Social/.test(w)), 'con ssn_last4 no debe pedir el SSN');
});
