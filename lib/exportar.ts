// Construye archivos de reporte (Excel y PDF) a partir de columnas y filas.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Celda = string | number | null;

/** Limpia texto para las fuentes estándar de pdf-lib (WinAnsi). */
function limpiar(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•●]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

export async function construirXlsx(hoja: string, columnas: string[], filas: Celda[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja.slice(0, 31) || "Reporte");

  const encabezado = ws.addRow(columnas);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003764" } };
    c.alignment = { vertical: "middle" };
  });

  for (const f of filas) ws.addRow(f.map((v) => (v === null || v === undefined ? "" : v)));

  columnas.forEach((titulo, i) => {
    let max = titulo.length;
    for (const f of filas) {
      const v = f[i] === null || f[i] === undefined ? "" : String(f[i]);
      if (v.length > max) max = v.length;
    }
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, max + 2));
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** PDF horizontal tipo tabla. `pesos` = ancho relativo de cada columna. */
export async function construirPdf(
  titulo: string,
  columnas: string[],
  filas: Celda[][],
  pesos: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 792;
  const pageH = 612; // Carta horizontal
  const margin = 28;
  const usableW = pageW - margin * 2;
  const totalPeso = pesos.reduce((a, b) => a + b, 0) || columnas.length;
  const anchos = pesos.map((p) => (p / totalPeso) * usableW);
  const rowH = 15;
  const size = 8;
  const navy = rgb(0, 0.216, 0.392);

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const recorta = (texto: string, ancho: number, f = font): string => {
    let s = limpiar(texto);
    const maxW = ancho - 4;
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  const dibujarEncabezado = () => {
    page.drawText(limpiar(titulo), { x: margin, y: y - 4, size: 13, font: bold, color: navy });
    y -= 24;
    page.drawRectangle({ x: margin, y: y - rowH + 4, width: usableW, height: rowH, color: navy });
    let x = margin;
    columnas.forEach((c, i) => {
      page.drawText(recorta(c, anchos[i], bold), { x: x + 2, y: y - rowH + 8, size, font: bold, color: rgb(1, 1, 1) });
      x += anchos[i];
    });
    y -= rowH;
  };

  dibujarEncabezado();

  filas.forEach((fila, idx) => {
    if (y - rowH < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
      dibujarEncabezado();
    }
    if (idx % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - rowH + 3, width: usableW, height: rowH, color: rgb(0.96, 0.96, 0.97) });
    }
    let x = margin;
    fila.forEach((v, i) => {
      const texto = v === null || v === undefined ? "" : String(v);
      page.drawText(recorta(texto, anchos[i]), { x: x + 2, y: y - rowH + 7, size, font, color: rgb(0.1, 0.1, 0.12) });
      x += anchos[i];
    });
    y -= rowH;
  });

  return doc.save();
}
