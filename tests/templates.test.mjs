import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPlaceholders, guessMeta, sheetToTemplates, itemsToText } from '../src/lib/templateImport.js';

const LETTER = `[Your Name]
[Your Address]
[City, State Zip]
DOB: [Date of Birth]  SSN: XXX-XX-[Last 4 of SSN]

[Date]

[Credit Bureau Name]
[Bureau Address]

To whom it may concern,
The following accounts are inaccurate:
Account Name: [Account Name]   Account Number: [Account Number]
Creditor: [Creditor Account]
Please delete them.
Sincerely, [Your Name]`;

test('campos automáticos', () => {
  const { text, changes } = autoPlaceholders(LETTER);
  assert.match(text, /^\{\{cliente_nombre\}\}\n\{\{cliente_direccion\}\}\n\{\{cliente_ciudad_estado_zip\}\}/);
  assert.match(text, /DOB: \{\{cliente_dob\}\}  SSN: XXX-XX-\{\{cliente_ssn4\}\}/);
  assert.match(text, /\{\{fecha\}\}/);
  assert.match(text, /\{\{destinatario_nombre\}\}\n\{\{destinatario_direccion\}\}/);
  assert.equal((text.match(/\{\{lista_items\}\}/g) || []).length, 1);
  assert.ok(!/Account Number/.test(text));
  assert.match(text, /Sincerely, \{\{cliente_nombre\}\}/);
  assert.ok(changes.length >= 6);
});

test('lista de cuentas', () => {
  assert.match(autoPlaceholders('Items:\n[List of Accounts]\nBye').text, /Items:\n\{\{lista_items\}\}\nBye/);
});

test('adivina tipo de carta', () => {
  assert.equal(guessMeta({ name: 'Debt validation', body: 'pursuant to 15 USC 1692g' }).recipient, 'acreedor');
  assert.equal(guessMeta({ name: 'Round 2 MOV', body: 'method of verification' }).round, 2);
  assert.equal(guessMeta({ name: 'x', body: 'remove these hard inquiries' }).purpose, 'inquiries');
  assert.equal(guessMeta({ name: 'Goodwill', body: 'goodwill adjustment' }).attach_id, false);
});

test('Excel con varias plantillas', () => {
  const t = sheetToTemplates([['Nombre', 'Ronda', 'Carta'], ['R1', '1', 'Hola [Name]'], ['R2', '2', 'Otra'], ['', '', '']], 'x');
  assert.equal(t.length, 2);
  assert.equal(t[1].roundHint, '2');
  const one = sheetToTemplates([['Dear bureau'], ['line 2']], 'Mi carta');
  assert.equal(one[0].body, 'Dear bureau\nline 2');
});

test('PDF a texto con párrafos', () => {
  const t = itemsToText([{ str: 'Hello', x: 10, y: 10, h: 10 }, { str: 'world', x: 50, y: 10, h: 10 }, { str: 'Line 2', x: 10, y: 22, h: 10 }, { str: 'New para', x: 10, y: 60, h: 10 }]);
  assert.equal(t, 'Hello world\nLine 2\n\nNew para');
});
