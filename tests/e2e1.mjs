import { chromium } from 'playwright';
const B = 'http://localhost:5180';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
const shot = (n) => page.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: false });

await page.goto(B + '/login');
await page.evaluate(() => localStorage.clear());
await page.goto(B + '/login');
await shot('01-login');
await page.fill('input[autocomplete=username]', 'admin@test.com');
await page.fill('input[type=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/admin');
await page.waitForTimeout(500);
await shot('02-dashboard');

// crear cliente
await page.click('text=Clientes');
await page.click('text=Nuevo cliente');
const modal = page.locator('.fixed.inset-0').last();
await modal.locator('label:has-text("Nombre") input').first().fill('Juan');
await modal.locator('label:has-text("Apellido(s)") input').fill('Perez');
await modal.locator('label:has-text("Teléfono") input').first().fill('302-555-1212');
await page.click('text=Crear cliente');
await page.waitForSelector('text=Acceso al portal del cliente');
await shot('03-creds');
const creds = await page.locator('.font-mono').innerText();
console.log('CREDS', creds.replace(/\n/g, ' | '));
await page.locator('button[aria-label=Cerrar]').last().click();
await page.waitForURL('**/admin/clientes/*');
await page.waitForTimeout(400);
await shot('04-client');

// subir reporte 1
await page.click('text=Subir reporte');
await page.setInputFiles('input[type=file][accept=".pdf,.html,.htm,.mhtml,.txt"]', 'tests/fixtures/iiq1.pdf');
await page.click('text=Leer reporte automáticamente');
await page.waitForSelector('text=Guardar en el cliente', { timeout: 20000 });
await page.waitForTimeout(300);
await shot('05-review1');
await page.click('text=Guardar en el cliente');
await page.waitForSelector('text=Reporte guardado');
console.log('RESULT1', await page.locator('text=nuevos ·').innerText());
await page.click('button:has-text("Listo")');
await page.waitForTimeout(500);
await shot('06-resumen');
await page.click('button:has-text("Cuentas")');
await page.waitForTimeout(300);
await shot('07-cuentas');
await page.click('button:has-text("Datos del cliente")');
await page.waitForTimeout(300);
const addr = await page.locator('label:has-text("Calle y número") input').inputValue();
console.log('ADDR autofill:', addr, await page.locator('label:has-text("Ciudad") input').inputValue());
await page.fill('label:has-text("Seguro Social") input', '123456789');
await page.click('text=Guardar cambios');
await page.waitForTimeout(400);

// cartas
await page.click('button:has-text("Cuentas")');
await page.waitForTimeout(300);
await page.locator('thead input[type=checkbox]').first().check();
await page.waitForTimeout(200);
const [popup] = await Promise.all([
  ctx.waitForEvent('page'),
  (async () => { await page.click('button:has-text("Generar cartas") >> nth=-1'); await page.waitForSelector('text=Generar cartas de disputa'); await page.waitForTimeout(300); await shot('08-wizard'); await page.click('text=Generar e imprimir'); })(),
]);
await popup.waitForLoadState();
await popup.waitForTimeout(1200);
await popup.screenshot({ path: '/tmp/shots/09-print.png' });
console.log('LETTERS pages:', await popup.locator('.print-page').count());
await popup.close();

// reporte 2 (con eliminaciones)
await page.click('button:has-text("Subir reporte") >> nth=0');
await page.setInputFiles('input[type=file][accept=".pdf,.html,.htm,.mhtml,.txt"]', 'tests/fixtures/iiq2.pdf');
await page.click('text=Leer reporte automáticamente');
await page.waitForSelector('text=Guardar en el cliente', { timeout: 20000 });
await page.waitForTimeout(300);
await shot('10-review2');
await page.click('text=Guardar en el cliente');
await page.waitForSelector('text=Reporte guardado');
console.log('RESULT2', await page.locator('.py-6').innerText());
await page.click('button:has-text("Listo")');
await page.waitForTimeout(500);
await shot('11-resumen2');
await page.click('button:has-text("Cobros")');
await page.waitForTimeout(300);
await shot('12-cobros');
await page.goto(B + '/admin');
await page.waitForTimeout(600);
await shot('13-dashboard2');
await page.goto(B + '/admin/cobros');
await page.waitForTimeout(500);
await shot('14-cobros-global');
await page.goto(B + '/admin/plantillas');
await page.waitForTimeout(500);
await page.click('text=Vista previa');
await shot('15-plantillas');
await page.goto(B + '/admin/configuracion');
await page.waitForTimeout(500);
await shot('16-config');
console.log('CREDS_RAW', creds);
console.log('ERRORS', JSON.stringify(errors, null, 1));
await browser.close();
