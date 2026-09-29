import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfItemsToRows } from '../src/lib/parser/extract.js';
export async function pdfToRowsNode(buf) {
  const pdf = await getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = []; let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str !== undefined).map(i => ({ str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.hypot(i.transform[2], i.transform[3]) || 8 }));
    text += items.map(i => i.str).join(' ') + '\n'; pages.push({ items });
  }
  return { rows: pdfItemsToRows(pages), text };
}
