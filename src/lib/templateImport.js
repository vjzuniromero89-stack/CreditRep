// Importar plantillas de cartas desde Word (.docx), Excel (.xlsx/.xls/.csv), PDF o texto.

// ------------------------------------------------------------------ lectura de archivos
export async function readTemplateFile(file) {
  const name = (file.name || '').toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (name.endsWith('.doc')) throw new Error('Los archivos .doc viejos no se pueden leer. En Word: Archivo → Guardar como → .docx');
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth/mammoth.browser.js');
    const mammoth = mod.default || mod;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return [{ name: base, body: cleanText(value) }];
  }
  if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const out = [];
    wb.SheetNames.forEach((sn) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
      out.push(...sheetToTemplates(rows, wb.SheetNames.length > 1 ? sn : base));
    });
    return out.filter((t) => t.body.trim());
  }
  if (name.endsWith('.pdf')) return [{ name: base, body: await pdfToText(await file.arrayBuffer()) }];
  return [{ name: base, body: cleanText(await file.text()) }];
}

// Excel: si hay columnas "nombre" y "carta/contenido" => una plantilla por fila. Si no, todo el texto es una plantilla.
export function sheetToTemplates(rows, fallbackName) {
  const clean = rows.filter((r) => r.some((c) => String(c).trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h) => String(h).toLowerCase().trim());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iName = col(/^(nombre|name|t[ií]tulo|title|plantilla)$/);
  const iBody = col(/(carta|contenido|texto|body|letter|template|cuerpo|plantilla\s*\(texto\))/);
  if (iName >= 0 && iBody >= 0 && iName !== iBody) {
    const iRec = col(/(para|destinatario|recipient|enviar a)/);
    const iRound = col(/(ronda|round)/);
    const iType = col(/(tipo|purpose|prop[oó]sito|categor)/);
    return clean.slice(1).filter((r) => String(r[iBody]).trim()).map((r) => ({
      name: String(r[iName]).trim() || fallbackName,
      body: cleanText(String(r[iBody])),
      recipientHint: iRec >= 0 ? String(r[iRec]) : '',
      roundHint: iRound >= 0 ? String(r[iRound]) : '',
      typeHint: iType >= 0 ? String(r[iType]) : '',
    }));
  }
  const text = clean.map((r) => r.map((c) => String(c).trim()).filter(Boolean).join(' ')).join('\n');
  return [{ name: fallbackName, body: cleanText(text) }];
}

async function pdfToText(buf) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str !== undefined).map((i) => ({ str: i.str, x: i.transform[4], y: vp.height - i.transform[5], h: Math.hypot(i.transform[2], i.transform[3]) || 10 }));
    pages.push(itemsToText(items));
  }
  return cleanText(pages.join('\n\n'));
}

// Reconstruye líneas y párrafos a partir de la posición del texto
export function itemsToText(items) {
  const lines = [];
  items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x).forEach((it) => {
    const l = lines.find((ln) => Math.abs(ln.y - it.y) <= Math.max(2, it.h * 0.4));
    if (l) l.items.push(it); else lines.push({ y: it.y, h: it.h, items: [it] });
  });
  lines.sort((a, b) => a.y - b.y);
  let out = ''; let prev = null;
  lines.forEach((l) => {
    const text = l.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (prev) out += (l.y - prev.y > prev.h * 1.8 ? '\n\n' : '\n');
    out += text; prev = l;
  });
  return out;
}

export function cleanText(t) {
  return String(t || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+\n/g, '\n').replace(/[ \t ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------------------------------------------ campos automáticos
const B = String.raw`[\[\{<(«]{1,2}\s*`; // abre corchete / llave
const E = String.raw`\s*[\]\}>)»]{1,2}`;
const W = (s) => new RegExp(B + '(?:' + s + ')' + E, 'gi');

const RULES = [
  [W(String.raw`(your|client'?s?|consumer'?s?|customer'?s?|full|my|tu|nombre del cliente|nombre)?\s*(full\s*)?name|nombre( completo)?|client|consumer|cliente`), '{{cliente_nombre}}', 'Nombre del cliente'],
  [W(String.raw`(your|client'?s?|consumer'?s?|my|current)?\s*(street\s*)?address(\s*line\s*1)?|direcci[oó]n|calle`), '{{cliente_direccion}}', 'Dirección'],
  [W(String.raw`(your\s*)?city,?\s*state,?\s*(and\s*)?zip(\s*code)?|ciudad,?\s*estado,?\s*(y\s*)?zip`), '{{cliente_ciudad_estado_zip}}', 'Ciudad, estado, zip'],
  [W(String.raw`(your\s*)?(dob|d\.o\.b\.?|date\s*of\s*birth|birth\s*date|fecha de nacimiento)`), '{{cliente_dob}}', 'Fecha de nacimiento'],
  [W(String.raw`(today'?s\s*)?date|fecha(\s*de hoy)?`), '{{fecha}}', 'Fecha'],
  [W(String.raw`(last\s*(4|four)\s*(digits\s*)?(of\s*)?(your\s*)?(ssn|social(\s*security)?(\s*number)?)|ssn\s*last\s*4|[uú]ltimos 4 del ssn)`), '{{cliente_ssn4}}', 'Últimos 4 del SSN'],
  [W(String.raw`(your\s*)?(ssn|social\s*security(\s*number)?|seguro social)`), '{{cliente_ssn}}', 'SSN'],
  [W(String.raw`(your\s*)?(phone(\s*number)?|tel[eé]fono)`), '{{cliente_telefono}}', 'Teléfono'],
  [W(String.raw`(your\s*)?(e-?mail(\s*address)?|correo)`), '{{cliente_email}}', 'Email'],
  [W(String.raw`(credit\s*)?(bureau|agency|creditor|collection\s*agency|collector|company|furnisher)('?s)?\s*address|direcci[oó]n del (bureau|acreedor)`), '{{destinatario_direccion}}', 'Dirección del destinatario'],
  [W(String.raw`(credit\s*)?(bureau|reporting\s*agency|cra)(\s*name)?|(creditor|collection\s*agency|collector|furnisher|company)(\s*name)?|equifax\s*/\s*experian\s*/\s*transunion|bureau|acreedor`), '{{destinatario_nombre}}', 'Nombre del destinatario'],
];
const ACCOUNT_LINE = new RegExp(B + String.raw`(?:list\s*of\s*(?:the\s*)?|lista\s*de\s*)?(account|acct|creditor\s*account|collection|item|inquiry|inquiries|accounts|items|lista|cuenta)[^\]\}>)»]{0,40}` + E, 'i');

export function autoPlaceholders(text) {
  const changes = [];
  let listDone = /\{\{\s*lista_items\s*\}\}/.test(text);
  // 1) líneas con cuentas => una sola {{lista_items}}
  const lines = text.split('\n');
  const outLines = [];
  for (const line of lines) {
    if (ACCOUNT_LINE.test(line)) {
      if (!listDone) { outLines.push('{{lista_items}}'); listDone = true; changes.push('Lista de cuentas/items → {{lista_items}}'); }
      continue;
    }
    outLines.push(line);
  }
  let out = outLines.join('\n');
  // 2) resto de campos
  for (const [re, ph, label] of RULES) {
    let n = 0;
    out = out.replace(re, () => { n++; return ph; });
    if (n) changes.push(`${label} → ${ph}${n > 1 ? ` (${n})` : ''}`);
  }
  // 3) líneas en blanco tipo "________" para firma se quedan
  if (!listDone) changes.push('⚠ No se encontró dónde van las cuentas: agrega {{lista_items}} donde quieras la lista.');
  return { text: out, changes };
}

// ------------------------------------------------------------------ adivinar tipo
export function guessMeta(t) {
  const s = `${t.name} ${t.body} ${t.typeHint || ''}`.toLowerCase();
  const rec = (t.recipientHint || '').toLowerCase();
  let purpose = 'disputa_cuentas';
  if (/goodwill|buena voluntad/.test(s)) purpose = 'goodwill';
  else if (/validat|validaci[oó]n|1692g|fdcpa|debt collector/.test(s)) purpose = 'validacion';
  else if (/inquir/.test(s)) purpose = 'inquiries';
  else if (/personal information|informaci[oó]n personal|aka|also known as|former address|incorrect address|variations? of my name|name variation/.test(s)) purpose = 'personal';
  let recipient = ['validacion', 'goodwill'].includes(purpose) ? 'acreedor' : 'bureau';
  if (/acreedor|creditor|collector|cobr/.test(rec)) recipient = 'acreedor';
  if (/bureau|equifax|experian|transunion/.test(rec)) recipient = 'bureau';
  let round = parseInt((t.roundHint || '').replace(/\D/g, ''), 10);
  if (!round) {
    const m = s.match(/(?:round|ronda)\s*#?\s*(\d)/);
    if (m) round = +m[1];
    else if (/third|3rd|final notice|tercera/.test(s)) round = 3;
    else if (/second|2nd|method of verification|segunda|1681i\(a\)\(7\)/.test(s)) round = 2;
    else round = 1;
  }
  const applies_to = purpose === 'inquiries' ? 'inquiry' : purpose === 'personal' ? 'personal' : 'cuenta';
  const attach = recipient === 'bureau' ? { attach_id: true, attach_bill: true } : purpose === 'validacion' ? { attach_id: true, attach_bill: false } : { attach_id: false, attach_bill: false };
  return { purpose, recipient, round, applies_to, ...attach, attach_ssn: false };
}
