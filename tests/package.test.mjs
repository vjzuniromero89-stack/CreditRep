import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { DOMParser } from 'linkedom';
import { htmlToRows } from '../src/lib/parser/extract.js';
import { parseReport } from '../src/lib/parser/parse.js';
import { parsedToItems } from '../src/lib/reportDiff.js';
import { buildPackage, flagPersonal, pickTemplate } from '../src/lib/packageBuilder.js';

const h = fs.readFileSync('tests/fixtures/iiq1.html', 'utf8');
const parsed = parseReport(htmlToRows(h, DOMParser), h);
let n = 0;
const items = parsedToItems(parsed).map((i) => ({ ...i, id: 'i' + ++n, status: 'activa', dispute_round: 0 }));
const client = { first_name: 'Juan', middle_name: 'Carlos', last_name: 'Perez', address: '123 Main St', city: 'Wilmington', state: 'DE', zip: '19801', dob: '1989-01-01', ssn: '123-45-6789', phone: '302-555-1212', employer: 'Acme Logistics' };
const T = (name, purpose, recipient, round = 1, extra = {}) => ({ id: name, name, purpose, recipient, round, active: true, attach_id: recipient === 'bureau', attach_bill: recipient === 'bureau', ...extra });
const templates = [T('R1', 'disputa_cuentas', 'bureau', 1), T('R2', 'disputa_cuentas', 'bureau', 2), T('R3', 'disputa_cuentas', 'bureau', 3), T('PI', 'personal', 'bureau'), T('INQ', 'inquiries', 'bureau'), T('VAL', 'validacion', 'acreedor', 1, { attach_id: true }), T('GW', 'goodwill', 'acreedor')];

test('detecta info personal a limpiar', () => {
  const { flagged } = flagPersonal(items, client);
  const f = flagged.map((x) => `${x.item.bureau}:${x.item.category}:${x.item.name}`).sort();
  assert.ok(f.includes('TU:alias:JUAN PERES'));
  assert.ok(f.includes('TU:alias:JOHN PEREZ'));
  assert.ok(f.includes('TU:direccion:45 OAK AVE APT 2, NEWARK, DE 19711'));
  assert.ok(!f.some((x) => x.includes('123 MAIN')), 'la dirección actual no se marca');
  assert.ok(!f.some((x) => x.includes('JUAN CARLOS PEREZ')), 'el nombre correcto no se marca');
  assert.ok(f.some((x) => x.includes('EX:alias:JUAN C PEREZ LOPEZ')));
});

test('arma paquete TU → EX → EQ → acreedores', () => {
  const docs = [{ doc_type: 'licencia_frente' }, { doc_type: 'bill' }];
  const pkg = buildPackage({ client, items, templates, docs, creditors: [{ name: 'MIDLAND CREDIT MGMT', norm: 'MIDLANDCREDITMGMT', address: '350 Camino de la Reina, San Diego, CA 92108' }] });
  const seq = pkg.letters.map((l) => `${l.group}:${l.purpose}:${l.items.length}`);
  assert.deepEqual(seq.slice(0, 3), ['TU:personal:4', 'TU:disputa_cuentas:3', 'TU:inquiries:2']);
  assert.equal(seq.filter((s) => s.startsWith('EX:disputa')).join(), 'EX:disputa_cuentas:4');
  assert.equal(seq.filter((s) => s.startsWith('EQ:disputa')).join(), 'EQ:disputa_cuentas:3');
  const cred = pkg.letters.filter((l) => l.group === 'ACREEDOR');
  assert.deepEqual(cred.map((l) => `${l.purpose}:${l.recipientName}`).sort(), ['goodwill:CAPITAL ONE', 'validacion:JPMCB CARD', 'validacion:MIDLAND CREDIT MGMT', 'validacion:PORTFOLIO RECOVERY']);
  assert.equal(cred.find((l) => l.recipientName === 'MIDLAND CREDIT MGMT').recipientAddress.includes('San Diego'), true);
  assert.ok(pkg.letters.filter((l) => l.recipient === 'bureau').every((l) => l.attach.id && l.attach.bill));
  assert.ok(pkg.warnings.some((w) => w.includes('JPMCB')));
  assert.ok(!pkg.warnings.some((w) => w.includes('licencia')));
});

test('ronda siguiente y espera de 30 días', () => {
  const d = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
  const recent = new Date().toISOString().slice(0, 10);
  const its = items.map((i) => (i.kind === 'cuenta' && i.bureau === 'TU' ? { ...i, dispute_round: 1, status: 'en_disputa', last_dispute_at: i.name === 'JPMCB CARD' ? recent : d } : i));
  const pkg = buildPackage({ client, items: its, templates, options: { creditorLetters: false } });
  const tu = pkg.letters.find((l) => l.group === 'TU' && l.purpose === 'disputa_cuentas');
  assert.equal(tu.template.name, 'R2');
  assert.equal(tu.items.length, 2);
  assert.ok(pkg.skippedRecent.some((i) => i.name === 'JPMCB CARD'));
  assert.equal(pickTemplate(templates, 'disputa_cuentas', 7).name, 'R3');
});

test('una carta por cuenta', () => {
  const pkg = buildPackage({ client, items, templates, options: { perAccount: true, creditorLetters: false } });
  assert.equal(pkg.letters.filter((l) => l.group === 'TU' && l.purpose === 'disputa_cuentas').length, 3);
});
