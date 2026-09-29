// Convierte PDF / HTML / texto pegado en una lista de "filas" con celdas.
import { labelKey } from './parse.js';
// Fila: { cells: string[], xs?: number[], y?: number, page?: number, table?: boolean }

const clean = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// ------------------------------------------------------------------ HTML
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'UL', 'OL', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TR', 'TBODY', 'THEAD', 'MAIN', 'NAV', 'FORM', 'DL', 'DT', 'DD', 'BR', 'HR']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'HEAD', 'TEMPLATE', 'IFRAME', 'SELECT', 'OPTION', 'BUTTON']);

function cellText(el) {
  // Conserva saltos de línea de <br>, <div>, <p>
  let out = '';
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    if (SKIP_TAGS.has(n.tagName)) return;
    if (isHidden(n)) return;
    if (n.tagName === 'BR') { out += '\n'; return; }
    const block = BLOCK_TAGS.has(n.tagName);
    if (block) out += '\n';
    for (const c of n.childNodes) walk(c);
    if (block) out += '\n';
  };
  walk(el);
  return out.split('\n').map(clean).filter(Boolean).join('\n');
}

function isHidden(el) {
  const st = (el.getAttribute && el.getAttribute('style')) || '';
  return /display\s*:\s*none/i.test(st) || (el.hasAttribute && el.hasAttribute('hidden'));
}

function hasBlockDescendant(el) {
  return !!el.querySelector('div,p,h1,h2,h3,h4,h5,h6,table,ul,ol,li,section,tr,dl');
}

export function htmlToRows(html, DOMParserImpl) {
  const DP = DOMParserImpl || globalThis.DOMParser;
  const doc = new DP().parseFromString(html, 'text/html');
  const rows = [];
  const emitText = (t) => {
    t.split('\n').map(clean).filter(Boolean).forEach((line) => rows.push({ cells: [line], table: false }));
  };
  const walk = (el) => {
    if (el.nodeType === 3) { const t = clean(el.nodeValue); if (t) rows.push({ cells: [t], table: false }); return; }
    if (el.nodeType !== 1 || SKIP_TAGS.has(el.tagName) || isHidden(el)) return;
    if (el.tagName === 'TR') {
      const tds = [...el.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
      if (tds.some((td) => td.querySelector('table'))) { tds.forEach((td) => [...td.childNodes].forEach(walk)); return; }
      const cells = tds.map(cellText);
      if (cells.some(Boolean)) rows.push({ cells, table: true });
      return;
    }
    if (['TABLE', 'TBODY', 'THEAD', 'TFOOT'].includes(el.tagName)) { [...el.children].forEach(walk); return; }
    if (hasBlockDescendant(el)) { [...el.childNodes].forEach(walk); return; }
    emitText(cellText(el));
  };
  walk(doc.body || doc.documentElement);
  return rows;
}

// ------------------------------------------------------------------ Texto pegado
export function textToRows(text) {
  return text.split(/\r?\n/).map((line) => {
    const hasTabs = line.includes('\t');
    const cells = (hasTabs ? line.split('\t') : line.split(/\s{3,}/)).map(clean);
    // quitar celdas vacías al final
    while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
    return { cells, table: cells.length > 1 };
  }).filter((r) => r.cells.some(Boolean));
}

// ------------------------------------------------------------------ PDF
// pages: [{ items: [{ str, x, y, w, h }] }]  (y crece hacia abajo)
export function pdfItemsToRows(pages) {
  const rows = [];
  pages.forEach((page, pi) => {
    const items = page.items.filter((it) => clean(it.str));
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    // agrupar por línea (misma y con tolerancia)
    const lines = [];
    for (const it of items) {
      const tol = Math.max(2, (it.h || 8) * 0.45);
      let line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
      if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
      line.items.push(it);
    }
    lines.sort((a, b) => a.y - b.y);
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      const cells = []; const xs = [];
      let cur = null;
      for (const it of line.items) {
        const h = it.h || 8;
        const gap = cur ? it.x - (cur.x + cur.w) : Infinity;
        if (cur && gap <= Math.max(3.5, h * 0.55)) {
          cur.text += (gap > h * 0.15 ? ' ' : '') + it.str;
          cur.w = it.x + it.w - cur.x;
        } else {
          cur = { text: it.str, x: it.x, w: it.w };
          cells.push(cur);
        }
      }
      const texts = cells.map((c) => clean(c.text));
      const parts = line.items.map((it) => ({ text: clean(it.str), x: it.x, w: it.w, ln: 0 })).filter((q) => q.text);
      rows.push({ cells: texts, xs: cells.map((c) => c.x), ws: cells.map((c) => c.w), parts, y: line.y, page: pi, table: texts.length > 1 });
    }
  });
  return mergePdfRows(rows);
}

const isLabelText = (t) => /[:：]\s*$/.test(t || '') || !!labelKey(t);
const BUREAU_WORDS = /^(transunion|experian|equifax|trans|union)$/i;

// Une las líneas de celdas de varias líneas (direcciones, nombres) con su fila de etiqueta.
// Funciona si la etiqueta está arriba o centrada verticalmente.
export function mergePdfRows(rows) {
  // x de las etiquetas por página
  const labelXs = {};
  rows.forEach((r) => {
    if (isLabelText(r.cells[0])) (labelXs[r.page] = labelXs[r.page] || []).push(r.xs[0]);
  });
  const labelX = {};
  Object.entries(labelXs).forEach(([p, xs]) => { xs.sort((a, b) => a - b); labelX[p] = xs[Math.floor(xs.length / 2)]; });

  const kindOf = (r) => {
    const lx = labelX[r.page];
    if (r.cells.join(' ').split(/\s+/).every((w) => BUREAU_WORDS.test(w))) return 'struct';
    if (isLabelText(r.cells[0])) return 'label';
    if (lx == null) return 'struct';
    return r.xs[0] > lx + 30 ? 'cont' : 'struct';
  };
  const kinds = rows.map(kindOf);
  const out = rows.map((r) => ({ ...r, cells: [...r.cells], xs: [...r.xs], parts: [...(r.parts || [])], lnMin: 0, lnMax: 0 }));
  const drop = new Set();

  const mergeInto = (target, src, prepend) => {
    const ln = prepend ? --target.lnMin : ++target.lnMax;
    (src.parts || []).forEach((q) => target.parts.push({ ...q, ln }));
    src.cells.forEach((c, i) => {
      const x = src.xs[i];
      let j = target.xs.findIndex((tx, k) => k > 0 && Math.abs(tx - x) <= 10);
      if (j < 0) {
        // insertar en orden de x
        let pos = target.xs.findIndex((tx) => tx > x);
        if (pos < 0) pos = target.xs.length;
        target.xs.splice(pos, 0, x); target.cells.splice(pos, 0, c);
      } else {
        target.cells[j] = prepend ? c + '\n' + target.cells[j] : target.cells[j] + '\n' + c;
      }
    });
  };

  let i = 0;
  while (i < rows.length) {
    if (kinds[i] !== 'cont') { i++; continue; }
    let j = i;
    while (j < rows.length && kinds[j] === 'cont' && rows[j].page === rows[i].page) j++;
    const above = i > 0 && kinds[i - 1] === 'label' && rows[i - 1].page === rows[i].page ? i - 1 : -1;
    const below = j < rows.length && kinds[j] === 'label' && rows[j].page === rows[i].page ? j : -1;
    // punto de corte: el mayor espacio vertical
    let split = j; // todo hacia arriba
    if (above < 0 && below >= 0) split = i;
    else if (above >= 0 && below >= 0) {
      const ys = [rows[above].y, ...rows.slice(i, j).map((r) => r.y), rows[below].y];
      let best = -1; let bestGap = -1;
      for (let k = 0; k < ys.length - 1; k++) {
        const gap = ys[k + 1] - ys[k];
        if (gap > bestGap + 0.5) { bestGap = gap; best = k; }
      }
      split = i + best; // filas [i, split) arriba; [split, j) abajo
    }
    if (above >= 0) for (let k = i; k < split; k++) { mergeInto(out[above], rows[k], false); drop.add(k); }
    if (below >= 0) for (let k = j - 1; k >= split; k--) { mergeInto(out[below], rows[k], true); drop.add(k); }
    i = j;
  }
  return out.filter((_, k) => !drop.has(k));
}

// Lee un PDF en el navegador con pdf.js
export async function pdfFileToRows(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str !== undefined).map((i) => {
      const h = Math.hypot(i.transform[2], i.transform[3]) || i.height || 8;
      return { str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h };
    });
    fullText += items.map((i) => i.str).join(' ') + '\n';
    pages.push({ items });
  }
  return { rows: pdfItemsToRows(pages), text: fullText, pages: pdf.numPages };
}

export async function fileToRows(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    const r = await pdfFileToRows(buf);
    return { ...r, format: 'pdf' };
  }
  const text = await file.text();
  if (name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.mhtml') || /<html|<table/i.test(text.slice(0, 5000))) {
    const html = name.endsWith('.mhtml') ? decodeMhtml(text) : text;
    return { rows: htmlToRows(html), text: html.replace(/<[^>]+>/g, ' '), format: 'html' };
  }
  return { rows: textToRows(text), text, format: 'texto' };
}

// MHTML (Guardar como "Página web, un solo archivo")
export function decodeMhtml(text) {
  const m = text.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(\r?\n------|$)/i);
  let body = m ? m[1] : text;
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(text)) {
    body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    try { body = decodeURIComponent(escape(body)); } catch { /* ignore */ }
  }
  return body;
}
