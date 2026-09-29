import { chromium } from 'playwright';
import fs from 'fs';
import { identityIQ, smartCredit } from './fixtures/make.js';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage();
for (const [n, h] of [['iiq1', identityIQ()], ['iiq2', identityIQ({ removed: true })], ['sc', smartCredit()]]) {
  await page.setContent(h); await page.pdf({ path: `tests/fixtures/${n}.pdf`, format: 'Letter' });
  fs.writeFileSync(`tests/fixtures/${n}.html`, h);
}
await b.close(); console.log('pdfs ok');
const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p2 = await b2.newPage();
await p2.setContent(identityIQ().replace('<style>', '<style>td,th{vertical-align:top} ')); await p2.pdf({ path: 'tests/fixtures/iiq1_top.pdf', format: 'Letter' });
// texto copiado del navegador (con tabs)
await p2.setContent(identityIQ());
const txt = await p2.evaluate(() => document.body.innerText);
fs.writeFileSync('tests/fixtures/iiq1.txt', txt);
await b2.close();
