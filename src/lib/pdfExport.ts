// Turns a tall html2canvas capture into a multi-page A4 PDF.
// A single addImage() of the whole canvas overflows the first page and
// everything below it is cut off, so the capture is sliced into page-sized
// chunks. Cuts are moved up to the nearest blank row (pure background) so
// they fall between blocks instead of through a line of text.

import type { jsPDF as JsPDF } from 'jspdf';

const MARGIN_MM = 8;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Highest row ≤ idealY (and > minY) whose pixels all match the background. */
function findBlankRow(ctx: CanvasRenderingContext2D, width: number, idealY: number, minY: number, bg: [number, number, number]): number {
  const top = Math.max(minY, 0);
  const height = idealY - top;
  if (height <= 0) return idealY;
  const data = ctx.getImageData(0, top, width, height).data;
  const step = 4 * 2; // sample every other pixel: plenty for text detection
  for (let row = height - 1; row >= 0; row--) {
    const offset = row * width * 4;
    let blank = true;
    for (let i = 0; i < width * 4; i += step) {
      const p = offset + i;
      if (Math.abs(data[p] - bg[0]) > 12 || Math.abs(data[p + 1] - bg[1]) > 12 || Math.abs(data[p + 2] - bg[2]) > 12) {
        blank = false;
        break;
      }
    }
    if (blank) return top + row;
  }
  return idealY; // no gap found: hard cut
}

export function canvasToPagedPdf(canvas: HTMLCanvasElement, JsPDFCtor: typeof JsPDF, background: string): JsPDF {
  const pdf = new JsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN_MM * 2;
  const contentH = pageH - MARGIN_MM * 2;

  const pxPerMm = canvas.width / contentW;
  const pagePx = Math.floor(contentH * pxPerMm);
  const bg = hexToRgb(background);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    let end = Math.min(y + pagePx, canvas.height);
    // Don't search further back than a quarter page, or pages get too short
    if (end < canvas.height && ctx) end = findBlankRow(ctx, canvas.width, end, y + Math.floor(pagePx * 0.75), bg);
    const sliceH = end - y;

    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const sctx = slice.getContext('2d')!;
    sctx.fillStyle = background;
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!first) pdf.addPage();
    first = false;
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.addImage(slice.toDataURL('image/jpeg', 0.85), 'JPEG', MARGIN_MM, MARGIN_MM, contentW, sliceH / pxPerMm, undefined, 'FAST');

    y = end;
  }
  return pdf;
}
