import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const W = 612; // Carta
const H = 792;
const M = 60;
const ANCHO_UTIL = W - 2 * M;

const INK = rgb(0.13, 0.12, 0.1);
const GRIS = rgb(0.45, 0.44, 0.4);
const LINEA = rgb(0.78, 0.77, 0.72);
const RELLENO = rgb(0.952, 0.947, 0.928);

export interface ItemPDF {
  codigo: string;
  categoria: string;
  descripcion: string;
  serie: string;
  condiciones: string | null;
}

export interface DatosPDF {
  folio: string;
  tipo: "ASIGNACION" | "DEVOLUCION";
  empresa: string;
  /** Texto ya rellenado; puede contener el marcador {{tabla_equipos}} */
  cuerpo: string;
  items: ItemPDF[];
  /** Firma del empleado como data URL PNG */
  firma: string;
  nombreFirmante: string;
  nombreEntrega: string;
}

/** Sustituye caracteres fuera de Latin-1 para que Helvetica (WinAnsi) no truene */
function limpiar(t: string): string {
  return t
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u25CF]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function envolver(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) <= maxW) {
      actual = prueba;
    } else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

export async function generarPDF(datos: DatosPDF): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${datos.folio} - ${datos.empresa}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const nuevaPagina = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };

  const asegurar = (alto: number) => {
    if (y - alto < M + 14) nuevaPagina();
  };

  const parrafo = (texto: string, f: PDFFont = font, size = 10.5, interlinea = 15) => {
    for (const linea of envolver(limpiar(texto), f, size, ANCHO_UTIL)) {
      asegurar(interlinea);
      page.drawText(linea, { x: M, y: y - size, size, font: f, color: INK });
      y -= interlinea;
    }
  };

  const bloqueTexto = (texto: string) => {
    for (const cruda of texto.split("\n")) {
      const linea = cruda.trim();
      if (!linea) {
        y -= 7;
      } else {
        parrafo(linea);
      }
    }
  };

  // ---------- Encabezado ----------
  page.drawText(limpiar(datos.empresa).toUpperCase(), { x: M, y: y - 12, size: 12, font: bold, color: INK });
  const folioTxt = limpiar(`Folio: ${datos.folio}`);
  page.drawText(folioTxt, {
    x: W - M - mono.widthOfTextAtSize(folioTxt, 10),
    y: y - 12,
    size: 10,
    font: mono,
    color: GRIS,
  });
  y -= 30;
  const titulo = datos.tipo === "ASIGNACION" ? "CARTA RESPONSIVA DE EQUIPO" : "CARTA DE DEVOLUCIÓN DE EQUIPO";
  page.drawText(limpiar(titulo), { x: M, y: y - 14, size: 14, font: bold, color: INK });
  y -= 22;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: INK });
  y -= 22;

  // ---------- Tabla de equipos ----------
  const anchos = [72, 78, 212, 130]; // total 492 = ANCHO_UTIL
  const xCols = [M, M + anchos[0], M + anchos[0] + anchos[1], M + anchos[0] + anchos[1] + anchos[2]];
  const encabezados = ["CÓDIGO", "CATEGORÍA", "DESCRIPCIÓN", "NO. DE SERIE"];

  const dibujarEncabezadoTabla = () => {
    const alto = 20;
    asegurar(alto + 24);
    page.drawRectangle({
      x: M,
      y: y - alto,
      width: ANCHO_UTIL,
      height: alto,
      color: RELLENO,
      borderColor: LINEA,
      borderWidth: 0.8,
    });
    encabezados.forEach((t, i) => {
      page.drawText(t, { x: xCols[i] + 6, y: y - 14, size: 8, font: bold, color: INK });
    });
    y -= alto;
  };

  const dibujarTabla = () => {
    dibujarEncabezadoTabla();
    for (const item of datos.items) {
      const desc = item.condiciones
        ? `${item.descripcion} — Condición al devolver: ${item.condiciones}`
        : item.descripcion;
      const lineasDesc = envolver(limpiar(desc), font, 8.5, anchos[2] - 12);
      const lineasSerie = envolver(limpiar(item.serie || "-"), mono, 8, anchos[3] - 12);
      const lineasCat = envolver(limpiar(item.categoria), font, 8.5, anchos[1] - 12);
      const numLineas = Math.max(lineasDesc.length, lineasSerie.length, lineasCat.length, 1);
      const alto = numLineas * 11 + 9;

      if (y - alto < M + 14) {
        nuevaPagina();
        dibujarEncabezadoTabla();
      }

      page.drawRectangle({
        x: M,
        y: y - alto,
        width: ANCHO_UTIL,
        height: alto,
        borderColor: LINEA,
        borderWidth: 0.7,
      });
      for (let i = 1; i < xCols.length; i++) {
        page.drawLine({ start: { x: xCols[i], y }, end: { x: xCols[i], y: y - alto }, thickness: 0.7, color: LINEA });
      }

      page.drawText(limpiar(item.codigo), { x: xCols[0] + 6, y: y - 13, size: 8, font: mono, color: INK });
      lineasCat.forEach((l, i) => {
        page.drawText(l, { x: xCols[1] + 6, y: y - 13 - i * 11, size: 8.5, font, color: INK });
      });
      lineasDesc.forEach((l, i) => {
        page.drawText(l, { x: xCols[2] + 6, y: y - 13 - i * 11, size: 8.5, font, color: INK });
      });
      lineasSerie.forEach((l, i) => {
        page.drawText(l, { x: xCols[3] + 6, y: y - 13 - i * 11, size: 8, font: mono, color: INK });
      });

      y -= alto;
    }
    y -= 6;
  };

  // ---------- Cuerpo (con tabla intercalada donde esté el marcador) ----------
  const partes = datos.cuerpo.split("{{tabla_equipos}}");
  bloqueTexto(partes[0] ?? "");
  dibujarTabla();
  if (partes.length > 1) bloqueTexto(partes.slice(1).join("\n"));

  // ---------- Firmas ----------
  y -= 10;
  if (y < M + 150) nuevaPagina();

  const anchoBloque = 208;
  const xIzq = M + 6;
  const xDer = W - M - anchoBloque - 6;
  const yLinea = y - 78;

  try {
    const img = await doc.embedPng(datos.firma);
    const escala = Math.min(168 / img.width, 56 / img.height, 1);
    const fw = img.width * escala;
    const fh = img.height * escala;
    page.drawImage(img, { x: xIzq + (anchoBloque - fw) / 2, y: yLinea + 5, width: fw, height: fh });
  } catch {
    // si la firma no se pudo incrustar, se deja el espacio en blanco para firma en papel
  }

  const centrado = (texto: string, xInicio: number, yPos: number, size: number, f: PDFFont, color = INK) => {
    const t = limpiar(texto);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: xInicio + (anchoBloque - w) / 2, y: yPos, size, font: f, color });
  };

  for (const x of [xIzq, xDer]) {
    page.drawLine({ start: { x, y: yLinea }, end: { x: x + anchoBloque, y: yLinea }, thickness: 0.9, color: INK });
  }

  const etiquetaEmpleado =
    datos.tipo === "ASIGNACION" ? "Empleado — Recibe de conformidad" : "Empleado — Entrega el equipo";
  const etiquetaTI =
    datos.tipo === "ASIGNACION" ? "Departamento de TI — Entrega" : "Departamento de TI — Recibe de conformidad";

  centrado(datos.nombreFirmante, xIzq, yLinea - 14, 9.5, bold);
  centrado(etiquetaEmpleado, xIzq, yLinea - 27, 8, font, GRIS);
  centrado(datos.nombreEntrega, xDer, yLinea - 14, 9.5, bold);
  centrado(etiquetaTI, xDer, yLinea - 27, 8, font, GRIS);

  // ---------- Pie de página ----------
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    const pie = limpiar(`${datos.empresa} · ${datos.folio} · Generado con Control TI`);
    p.drawText(pie, { x: M, y: 32, size: 7, font, color: GRIS });
    const num = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(num, { x: W - M - font.widthOfTextAtSize(num, 7), y: 32, size: 7, font, color: GRIS });
  });

  return doc.save();
}
