import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { getConfig } from "../db";

/**
 * Motor de hojas de formato. Los documentos del sistema de calidad (FSI-03,
 * FSI-04, FSI-05…) comparten la misma anatomía: encabezado con el código y la
 * revisión, secciones en barra, renglones de campos —unos precargados con lo
 * que ya sabe el sistema y otros en blanco para llenar a mano—, listas de
 * puntos con casillas, bloques para escribir y la línea de firma.
 *
 * Cada formato se describe con estos bloques y el motor lo dibuja, así que
 * añadir uno nuevo es describirlo, no volver a programar el dibujo.
 */

export const W = 612; // Carta
export const H = 792;
export const M = 40;
export const ANCHO = W - 2 * M;

export const NAVY = rgb(0, 0.216, 0.392);
export const RED = rgb(0.918, 0, 0.161);
export const INK = rgb(0.12, 0.12, 0.13);
export const GRIS = rgb(0.42, 0.42, 0.45);
export const LINEA = rgb(0.72, 0.74, 0.78);
export const RELLENO = rgb(0.93, 0.95, 0.97);

/** Un campo del formato: con valor sale impreso, sin él queda la línea. */
export type Campo = { etiqueta: string; valor?: string | null; ancho: number };

export type Bloque =
  | { tipo: "seccion"; texto: string }
  | { tipo: "campos"; campos: Campo[] }
  /** `marcas` dice qué opción quedó elegida en cada punto al capturar la revisión. */
  | { tipo: "puntos"; puntos: string[]; columnas?: number; opciones?: string[]; marcas?: Record<string, string> }
  | { tipo: "casillas"; campos: { etiqueta: string; ancho: number; opciones?: string[]; marcada?: string; valor?: string }[] }
  | { tipo: "texto"; etiqueta: string; alto: number; contenido?: string }
  | { tipo: "tabla"; encabezados: string[]; anchos: number[]; filas: string[][]; filasVacias?: number }
  | { tipo: "espacio"; alto: number };

export type Hoja = {
  /** Código del documento controlado, p. ej. "FSI-04 Rev.00". */
  codigo: string;
  titulo: string;
  bloques: Bloque[];
  /**
   * Pie de trazabilidad. Estos formatos no se firman en papel: quedan
   * registrados en el sistema y el pie dice quién los capturó y cuándo.
   */
  registro?: string;
};

function limpiar(t: string): string {
  return (t || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function cargarLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "sultana-logo.png"));
  } catch {
    return null;
  }
}

/** Dibuja las hojas indicadas, una por página, en un solo PDF. */
export async function generarFormato(hojas: Hoja[], titulo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = cargarLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  const empresa = getConfig("empresa");
  const direccion = getConfig("direccion");

  for (const hoja of hojas) {
    const page: PDFPage = doc.addPage([W, H]);
    let y = H - M;

    const texto = (s: string, x: number, yy: number, size: number, ft: PDFFont = font, color = INK) =>
      page.drawText(limpiar(s), { x, y: yy, size, font: ft, color });

    /** Encoge el texto antes que dejarlo salirse de su celda. */
    const ajustar = (s: string, ancho: number, base = 8.5, min = 5.5) => {
      let size = base;
      while (size > min && font.widthOfTextAtSize(limpiar(s), size) > ancho) size -= 0.5;
      return size;
    };

    // ---- Encabezado ----
    const logoW = 130;
    const logoH = logo ? (logo.height / logo.width) * logoW : 0;
    if (logo) page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
    texto(hoja.codigo, W - M - font.widthOfTextAtSize(hoja.codigo, 9), y - 10, 9, font, GRIS);
    const sizeTitulo = ajustar(hoja.titulo, ANCHO - logoW - 20, 12, 8);
    texto(hoja.titulo, W - M - bold.widthOfTextAtSize(limpiar(hoja.titulo), sizeTitulo), y - 26, sizeTitulo, bold, NAVY);
    y -= Math.max(logoH, 34) + 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: RED });
    y -= 16;

    for (const b of hoja.bloques) {
      if (b.tipo === "espacio") {
        y -= b.alto;
        continue;
      }

      if (b.tipo === "seccion") {
        page.drawRectangle({ x: M, y: y - 15, width: ANCHO, height: 15, color: NAVY });
        texto(b.texto, M + 6, y - 11, 8.5, bold, rgb(1, 1, 1));
        y -= 15;
        continue;
      }

      if (b.tipo === "campos") {
        const alto = 26;
        let x = M;
        for (const c of b.campos) {
          const w = ANCHO * c.ancho;
          page.drawRectangle({ x, y: y - alto, width: w, height: alto, borderColor: LINEA, borderWidth: 0.7 });
          texto(c.etiqueta, x + 5, y - 9, 6.5, bold, GRIS);
          const v = (c.valor ?? "").trim();
          if (v) texto(v, x + 5, y - 20, ajustar(v, w - 10), font);
          else page.drawLine({ start: { x: x + 5, y: y - 21 }, end: { x: x + w - 5, y: y - 21 }, thickness: 0.5, color: LINEA });
          x += w;
        }
        y -= alto;
        continue;
      }

      if (b.tipo === "puntos") {
        const cols = b.columnas ?? 2;
        const opciones = b.opciones ?? ["Si", "No"];
        const filaAlto = 18;
        const colW = ANCHO / cols;
        const casillaW = 24;
        for (let i = 0; i < b.puntos.length; i += cols) {
          for (let j = 0; j < cols; j += 1) {
            const punto = b.puntos[i + j];
            if (!punto) continue;
            const x = M + j * colW;
            page.drawRectangle({ x, y: y - filaAlto, width: colW, height: filaAlto, borderColor: LINEA, borderWidth: 0.7 });
            texto(punto, x + 6, y - 12.5, ajustar(punto, colW - casillaW * opciones.length - 20, 8, 6), font);
            const elegida = b.marcas?.[punto];
            for (const [k, cual] of opciones.entries()) {
              const cx = x + colW - casillaW * opciones.length - 8 + k * casillaW;
              page.drawRectangle({ x: cx, y: y - 14, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
              if (elegida === cual) texto("X", cx + 2.2, y - 12.2, 8, bold);
              texto(cual, cx + 11, y - 12.5, 6.5, font, GRIS);
            }
          }
          y -= filaAlto;
        }
        continue;
      }

      if (b.tipo === "casillas") {
        const alto = 24;
        let x = M;
        for (const c of b.campos) {
          const w = ANCHO * c.ancho;
          const opciones = c.opciones ?? [];
          page.drawRectangle({ x, y: y - alto, width: w, height: alto, borderColor: LINEA, borderWidth: 0.7 });
          texto(c.etiqueta, x + 5, y - 9, 6.5, bold, GRIS);
          if (opciones.length) {
            for (const [k, cual] of opciones.entries()) {
              const cx = x + w - 30 * opciones.length - 4 + k * 30;
              page.drawRectangle({ x: cx, y: y - 20, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
              if (c.marcada === cual) texto("X", cx + 2.2, y - 18.2, 8, bold);
              texto(cual, cx + 11, y - 18.5, 7, font, GRIS);
            }
          } else if ((c.valor ?? "").trim()) {
            const v = (c.valor ?? "").trim();
            texto(v, x + 5, y - 18, ajustar(v, w - 10, 8, 5.5), font);
          } else {
            page.drawLine({ start: { x: x + 5, y: y - 19 }, end: { x: x + w - 5, y: y - 19 }, thickness: 0.5, color: LINEA });
          }
          x += w;
        }
        y -= alto;
        continue;
      }

      if (b.tipo === "texto") {
        const contenido = (b.contenido ?? "").trim();
        page.drawRectangle({ x: M, y: y - b.alto, width: ANCHO, height: b.alto, borderColor: LINEA, borderWidth: 0.7, color: RELLENO });
        texto(b.etiqueta, M + 5, y - 10, 7, bold, GRIS);
        if (contenido) {
          // Se parte en renglones que quepan a lo ancho de la caja.
          const palabras = limpiar(contenido).split(/\s+/).filter(Boolean);
          const lineas: string[] = [];
          let actual = "";
          for (const p of palabras) {
            const prueba = actual ? `${actual} ${p}` : p;
            if (font.widthOfTextAtSize(prueba, 8) <= ANCHO - 16) actual = prueba;
            else {
              if (actual) lineas.push(actual);
              actual = p;
            }
          }
          if (actual) lineas.push(actual);
          lineas.slice(0, Math.floor((b.alto - 14) / 11)).forEach((l, i) => texto(l, M + 6, y - 22 - i * 11, 8, font));
        } else {
          for (let l = 1; l * 14 < b.alto - 12; l += 1) {
            page.drawLine({ start: { x: M + 6, y: y - 12 - l * 14 }, end: { x: W - M - 6, y: y - 12 - l * 14 }, thickness: 0.4, color: LINEA });
          }
        }
        y -= b.alto;
        continue;
      }

      if (b.tipo === "tabla") {
        const altoFila = 17;
        // Encabezados
        let x = M;
        page.drawRectangle({ x: M, y: y - altoFila, width: ANCHO, height: altoFila, color: RELLENO, borderColor: LINEA, borderWidth: 0.7 });
        for (const [i, h] of b.encabezados.entries()) {
          const w = ANCHO * b.anchos[i];
          texto(h, x + 4, y - 11.5, 7, bold, GRIS);
          x += w;
        }
        y -= altoFila;
        // Filas con datos y, después, las que quedan en blanco para escribir.
        const total = b.filas.length + (b.filasVacias ?? 0);
        for (let f = 0; f < total; f += 1) {
          x = M;
          for (const [i, w0] of b.anchos.entries()) {
            const w = ANCHO * w0;
            page.drawRectangle({ x, y: y - altoFila, width: w, height: altoFila, borderColor: LINEA, borderWidth: 0.5 });
            const v = b.filas[f]?.[i] ?? "";
            if (v) texto(v, x + 4, y - 11.5, ajustar(v, w - 8, 7.5, 5.5), font);
            x += w;
          }
          y -= altoFila;
        }
        continue;
      }
    }

    // ---- Registro ----
    if (hoja.registro) {
      // Se parte en renglones: el pie de trazabilidad suele ser largo.
      const palabras = limpiar(hoja.registro).split(/\s+/).filter(Boolean);
      const lineas: string[] = [];
      let actual = "";
      for (const pal of palabras) {
        const prueba = actual ? `${actual} ${pal}` : pal;
        if (font.widthOfTextAtSize(prueba, 7.5) <= ANCHO - 14) actual = prueba;
        else {
          if (actual) lineas.push(actual);
          actual = pal;
        }
      }
      if (actual) lineas.push(actual);
      const alto = 12 + lineas.length * 10;
      y -= 18;
      page.drawRectangle({ x: M, y: y - alto, width: ANCHO, height: alto, color: RELLENO, borderColor: LINEA, borderWidth: 0.7 });
      lineas.forEach((l, i) => texto(l, M + 6, y - 12 - i * 10, 7.5, font, GRIS));
    }

    // ---- Pie ----
    page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.8, color: LINEA });
    const emp = limpiar(empresa).toUpperCase();
    texto(emp, (W - bold.widthOfTextAtSize(emp, 8)) / 2, 34, 8, bold, NAVY);
    const dir = limpiar(direccion);
    texto(dir, Math.max(M, (W - font.widthOfTextAtSize(dir, 6.5)) / 2), 24, 6.5, font, GRIS);
    texto(hoja.codigo, M, 14, 6.5, font, GRIS);
  }

  return doc.save();
}
