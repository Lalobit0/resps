import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

const W = 612; // Carta
const H = 792;
const M = 45;
const ANCHO = W - 2 * M;
const FOOTER = 56; // el contenido no debe bajar de aquí

const NAVY = rgb(0, 0.216, 0.392); // #003764
const RED = rgb(0.918, 0, 0.161); // #ea0029
const INK = rgb(0.12, 0.12, 0.13);
const GRIS = rgb(0.42, 0.42, 0.45);
const LINEA = rgb(0.72, 0.74, 0.78);
const RELLENO = rgb(0.93, 0.95, 0.97);

export interface FilaCarta {
  etiqueta: string;
  valor: string;
}

export interface DatosCarta {
  encabezado?: string; // por defecto "CARTA RESPONSIVA"
  titulo: string;
  fecha: string;
  folio: string;
  empresa: string;
  direccion: string;
  filasUsuario: FilaCarta[];
  intro: string;
  filasEquipo: FilaCarta[];
  cuerpo: string;
  firma: string | null;
  firmaDer?: string | null;
  etiquetaIzq: string;
  etiquetaDer: string;
  sustituye?: boolean;
}

function limpiar(t: string): string {
  return (t || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•●]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function envolver(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const palabras = limpiar(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) <= maxW) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

function cargarLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "sultana-logo.png"));
  } catch {
    return null;
  }
}

export async function generarCarta(datos: DatosCarta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${datos.folio} - ${datos.empresa}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  const logoBytes = cargarLogo();
  if (logoBytes) {
    try {
      logo = await doc.embedPng(logoBytes);
    } catch {
      logo = null;
    }
  }
  // Las firmas capturadas en pantalla son PNG; las cargadas pueden venir en JPG.
  const embeberFirma = async (dataUrl: string | null | undefined): Promise<PDFImage | null> => {
    if (!dataUrl) return null;
    try {
      return /^data:image\/jpe?g/i.test(dataUrl) ? await doc.embedJpg(dataUrl) : await doc.embedPng(dataUrl);
    } catch {
      return null;
    }
  };
  const firmaImg = await embeberFirma(datos.firma);
  const firmaDerImg = await embeberFirma(datos.firmaDer);

  // Recorre todo el contenido con un factor de escala k. Si page es null solo mide
  // (para saber si desborda); si no, dibuja.
  const layout = (k: number, page: PDFPage | null): { desbordo: boolean } => {
    let y = H - M;
    let desbordo = false;
    const check = (h: number) => {
      if (y - h < FOOTER) desbordo = true;
    };
    const texto = (s: string, x: number, yy: number, size: number, f: PDFFont, color = INK) => {
      if (page) page.drawText(limpiar(s), { x, y: yy, size, font: f, color });
    };

    // ---- Encabezado ----
    const logoW = Math.max(130, 168 * k);
    const logoH = logo ? (logo.height / logo.width) * logoW : 0;
    if (page && logo) page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
    if (page) {
      const fVal = limpiar(datos.fecha);
      const wLbl = bold.widthOfTextAtSize("Fecha: ", 10 * k);
      const wVal = font.widthOfTextAtSize(fVal, 10 * k);
      texto("Fecha: ", W - M - wLbl - wVal, y - 14 * k, 10 * k, bold);
      texto(fVal, W - M - wVal, y - 14 * k, 10 * k, font);
    }
    y -= Math.max(logoH, 22 * k) + 12 * k;

    texto(datos.encabezado ?? "CARTA RESPONSIVA", M, y - 12 * k, 13 * k, bold, NAVY);
    y -= 16 * k;
    if (datos.titulo.trim()) {
      for (const l of envolver(datos.titulo, bold, 13 * k, ANCHO)) {
        texto(l, M, y - 12 * k, 13 * k, bold, NAVY);
        y -= 16 * k;
      }
    }
    y -= 4 * k;
    if (page) page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: RED });
    y -= 15 * k;

    // ---- Tabla etiqueta/valor ----
    const labelW = 150 * k;
    const size = 9 * k;
    const filaTabla = (label: string, valor: string) => {
      const valLines = envolver(valor || "", font, size, ANCHO - labelW - 16 * k);
      const alto = Math.max(17 * k, valLines.length * 11.5 * k + 6 * k);
      check(alto);
      if (page) {
        page.drawRectangle({ x: M, y: y - alto, width: labelW, height: alto, color: RELLENO, borderColor: LINEA, borderWidth: 0.7 });
        page.drawRectangle({ x: M + labelW, y: y - alto, width: ANCHO - labelW, height: alto, borderColor: LINEA, borderWidth: 0.7 });
      }
      texto(label, M + 6 * k, y - 12.5 * k, size, bold);
      valLines.forEach((l, i) => texto(l, M + labelW + 7 * k, y - 12.5 * k - i * 11.5 * k, size, font));
      y -= alto;
    };

    for (const f of datos.filasUsuario) filaTabla(f.etiqueta, f.valor);
    y -= 9 * k;

    // ---- Intro ----
    if (datos.intro.trim()) {
      for (const l of envolver(datos.intro, font, 9 * k, ANCHO)) {
        check(11.5 * k);
        texto(l, M, y - 10 * k, 9 * k, font);
        y -= 11.5 * k;
      }
      y -= 4 * k;
    }

    // ---- Tabla de equipo ----
    if (datos.filasEquipo.length) {
      for (const f of datos.filasEquipo) filaTabla(f.etiqueta, f.valor);
      y -= 8 * k;
    }

    // ---- Cuerpo (normas / condiciones) ----
    const numSize = 7.8 * k;
    const lineH = 9.3 * k;
    for (const cruda of datos.cuerpo.split("\n")) {
      const linea = cruda.trim();
      if (!linea) {
        y -= 4 * k;
        continue;
      }
      const esEncabezado = linea.endsWith(":");
      const f = esEncabezado ? bold : font;
      for (const l of envolver(linea, f, numSize, ANCHO)) {
        check(lineH);
        texto(l, M, y - numSize - 0.8 * k, numSize, f);
        y -= lineH;
      }
      y -= 1.5 * k;
    }

    // ---- Firmas ----
    check(74 * k);
    y -= 12 * k;
    const anchoBloque = 220;
    const xIzq = M + 4;
    const xDer = W - M - anchoBloque - 4;
    const yLinea = y - 36 * k;
    if (page && firmaImg) {
      const escala = Math.min((175 * k) / firmaImg.width, (48 * k) / firmaImg.height, 1);
      const fw = firmaImg.width * escala;
      const fh = firmaImg.height * escala;
      page.drawImage(firmaImg, { x: xIzq + (anchoBloque - fw) / 2, y: yLinea + 4 * k, width: fw, height: fh });
    }
    if (page && firmaDerImg) {
      const escala = Math.min((175 * k) / firmaDerImg.width, (48 * k) / firmaDerImg.height, 1);
      const fw = firmaDerImg.width * escala;
      const fh = firmaDerImg.height * escala;
      page.drawImage(firmaDerImg, { x: xDer + (anchoBloque - fw) / 2, y: yLinea + 4 * k, width: fw, height: fh });
    }
    if (page) {
      for (const x of [xIzq, xDer]) {
        page.drawLine({ start: { x, y: yLinea }, end: { x: x + anchoBloque, y: yLinea }, thickness: 0.9, color: INK });
      }
    }
    const etSize = Math.max(7, 8 * k);
    const etiqueta = (txt: string, xIni: number) => {
      envolver(txt, font, etSize, anchoBloque).forEach((l, i) => {
        const wl = font.widthOfTextAtSize(limpiar(l), etSize);
        texto(l, xIni + (anchoBloque - wl) / 2, yLinea - 11 * k - i * 9.5 * k, etSize, font);
      });
    };
    etiqueta(datos.etiquetaIzq, xIzq);
    etiqueta(datos.etiquetaDer, xDer);
    // La leyenda "por ausencia" ocupa varios renglones: se reserva el alto real.
    const lineasEtiqueta = Math.max(
      envolver(datos.etiquetaIzq, font, etSize, anchoBloque).length,
      envolver(datos.etiquetaDer, font, etSize, anchoBloque).length,
      1
    );
    y = yLinea - (11 * k + lineasEtiqueta * 9.5 * k + 8 * k);

    if (datos.sustituye) {
      texto("Esta carta responsiva sustituye a anteriores.", M, y - 8 * k, 8 * k, bold);
      y -= 12 * k;
    }

    if (y < FOOTER) desbordo = true;
    return { desbordo };
  };

  // Busca el mayor factor de escala que quepa en una sola página
  let k = 1;
  for (; k >= 0.6; k -= 0.02) {
    if (!layout(k, null).desbordo) break;
  }
  k = Math.max(0.6, Math.min(1, k));

  const page = doc.addPage([W, H]);
  layout(k, page);

  // ---- Pie de página ----
  page.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.8, color: LINEA });
  const emp = limpiar(datos.empresa).toUpperCase();
  page.drawText(emp, { x: (W - bold.widthOfTextAtSize(emp, 8)) / 2, y: 38, size: 8, font: bold, color: NAVY });
  const dir = limpiar(datos.direccion);
  const dirW = font.widthOfTextAtSize(dir, 6.5);
  page.drawText(dir, { x: Math.max(M, (W - dirW) / 2), y: 28, size: 6.5, font, color: GRIS });
  page.drawText(limpiar(`Folio: ${datos.folio}`), { x: M, y: 17, size: 6.5, font, color: GRIS });

  return doc.save();
}
