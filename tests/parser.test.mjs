import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { DOMParser } from 'linkedom';
import { htmlToRows } from '../src/lib/parser/extract.js';
import { parseReport } from '../src/lib/parser/parse.js';
import { parsedToItems, computeDiff, feeFor, isBillable } from '../src/lib/reportDiff.js';
import { pdfToRowsNode } from './pdfhelper.mjs';

const html = (f) => { const h = fs.readFileSync(`tests/fixtures/${f}`, 'utf8'); return parseReport(htmlToRows(h, DOMParser), h); };
const pdf = async (f) => { const { rows, text } = await pdfToRowsNode(fs.readFileSync(`tests/fixtures/${f}`)); return parseReport(rows, text); };

function checkIIQ(r) {
  assert.equal(r.provider, 'IdentityIQ');
  assert.equal(r.reportDate, '09/15/2026');
  assert.deepEqual(r.scores, { TU: 548, EX: 561, EQ: 552 });
  assert.deepEqual(r.bureaus, ['TU', 'EX', 'EQ']);
  const col = r.accounts.filter((a) => a.category === 'coleccion');
  assert.equal(col.length, 4, '3 Midland + 1 Portfolio');
  assert.equal(r.accounts.filter((a) => a.category === 'charge_off').length, 3);
  const cap = r.accounts.find((a) => a.name === 'CAPITAL ONE' && a.bureau === 'TU');
  assert.equal(cap.late_30, 1); assert.equal(cap.late_60, 1); assert.equal(cap.category, 'pagos_tarde');
  assert.equal(r.inquiries.length, 4);
  const addrTU = r.personal.filter((p) => p.bureau === 'TU' && p.category === 'direccion').map((p) => p.name);
  assert.deepEqual(addrTU, ['123 MAIN ST, WILMINGTON, DE 19801', '45 OAK AVE APT 2, NEWARK, DE 19711', '900 PINE RD, DOVER, DE 19901']);
  assert.equal(r.personal.filter((p) => p.category === 'alias').length, 3);
  assert.equal(r.creditorContacts[0].address, '350 CAMINO DE LA REINA, SAN DIEGO, CA 92108');
}

test('IdentityIQ HTML', () => checkIIQ(html('iiq1.html')));
test('IdentityIQ PDF (celdas centradas)', async () => checkIIQ(await pdf('iiq1.pdf')));
test('IdentityIQ PDF (celdas arriba)', async () => checkIIQ(await pdf('iiq1_top.pdf')));

test('SmartCredit (orden de columnas distinto)', async () => {
  for (const r of [html('sc.html'), await pdf('sc.pdf')]) {
    assert.equal(r.provider, 'SmartCredit');
    assert.deepEqual(r.scores, { TU: 580, EQ: 575, EX: 590 });
    const lv = r.accounts.filter((a) => a.name === 'LVNV FUNDING LLC');
    assert.deepEqual(lv.map((a) => a.bureau).sort(), ['EQ', 'TU']);
    assert.equal(lv[0].category, 'coleccion');
    assert.equal(r.inquiries[0].bureau, 'EQ');
    assert.equal(r.personal.filter((p) => p.category === 'telefono').length, 2);
  }
});

test('Detecta eliminaciones al subir reporte nuevo', () => {
  const r1 = html('iiq1.html');
  let id = 0;
  const existing = parsedToItems(r1).map((it) => ({ ...it, id: String(++id), status: 'activa' }));
  const r2 = html('iiq2.html');
  const plan = computeDiff(existing, parsedToItems(r2), r2.bureaus);
  const removed = plan.removed.map((e) => `${e.kind}:${e.bureau}:${e.name}`).sort();
  assert.deepEqual(removed, [
    'cuenta:EQ:MIDLAND CREDIT MGMT', 'cuenta:EX:MIDLAND CREDIT MGMT',
    'inquiry:EX:WESTLAKE FINANCIAL',
    'personal:TU:45 OAK AVE APT 2, NEWARK, DE 19711', 'personal:TU:900 PINE RD, DOVER, DE 19901',
    'personal:TU:JOHN PEREZ', 'personal:TU:JUAN PERES',
  ]);
  assert.equal(plan.inserts.length, 0);
  const settings = { fee_coleccion: 150, fee_inquiry: 0, fee_personal: 0 };
  const billable = plan.removed.filter((e) => isBillable(e, settings));
  assert.equal(billable.length, 2);
  assert.equal(feeFor(billable[0], settings), 150);
  // reinserción
  const again = existing.map((e) => (e.bureau === 'EX' && e.name === 'MIDLAND CREDIT MGMT' ? { ...e, status: 'eliminada' } : e));
  const plan2 = computeDiff(again, parsedToItems(r1), r1.bureaus);
  assert.equal(plan2.reappeared.length, 1);
});

test('Reporte de un solo bureau no elimina los otros', () => {
  const r1 = html('iiq1.html');
  let id = 0;
  const existing = parsedToItems(r1).map((it) => ({ ...it, id: String(++id), status: 'activa' }));
  const onlyTU = parsedToItems(r1).filter((i) => i.bureau === 'TU');
  const plan = computeDiff(existing, onlyTU, ['TU']);
  assert.equal(plan.removed.length, 0);
});
