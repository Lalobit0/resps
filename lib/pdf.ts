import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const W = 612; // Carta
const H = 792;
const M = 45;
const ANCHO = W - 2 * M;

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
  titulo: string; // subtítulo bajo "CARTA RESPONSIVA"
  fecha: string; // ya formateada dd/mm/yyyy
  folio: string;
  empresa: string;
  direccion: string;
  filasUsuario: FilaCarta[];
  intro: string;
  filasEquipo: FilaCarta[]; // vacío = sin tabla de equipo (Wi-Fi)
  cuerpo: string; // normas / condiciones (texto con saltos de línea)
  firma: string | null; // dataURL PNG del empleado
  etiquetaIzq: string;
  etiquetaDer: string;
  sustituye?: boolean;
}

/** Sustituye caracteres fuera de Latin-1 para que Helvetica (WinAnsi) no truene */
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

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const nuevaPagina = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const asegurar = (alto: number) => {
    if (y - alto < 64) nuevaPagina();
  };

  // ---------- Encabezado (primera página) ----------
  const logoW = 168;
  const logoH = logo ? (logo.height / logo.width) * logoW : 0;
  if (logo) page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });

  const fLbl = "Fecha: ";
  const fVal = limpiar(datos.fecha);
  const wLbl = bold.widthOfTextAtSize(fLbl, 10);
  const wVal = font.widthOfTextAtSize(fVal, 10);
  page.drawText(fLbl, { x: W - M - wLbl - wVal, y: y - 14, size: 10, font: bold, color: INK });
  page.drawText(fVal, { x: W - M - wVal, y: y - 14, size: 10, font, color: INK });

  y -= Math.max(logoH, 20) + 12;

  page.drawText("CARTA RESPONSIVA", { x: M, y: y - 12, size: 13, font: bold, color: NAVY });
  y -= 16;
  for (const l of envolver(datos.titulo, bold, 13, ANCHO)) {
    page.drawText(l, { x: M, y: y - 12, size: 13, font: bold, color: NAVY });
    y -= 16;
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: RED });
  y -= 16;

  // ---------- Tabla etiqueta/valor ----------
  const labelW = 150;
  const filaTabla = (label: string, valor: string) => {
    const size = 9;
    const valLines = envolver(valor || "", font, size, ANCHO - labelW - 16);
    const alto = Math.max(18, valLines.length * 12 + 6);
    asegurar(alto);
    page.drawRectangle({ x: M, y: y - alto, width: labelW, height: alto, color: RELLENO, borderColor: LINEA, borderWidth: 0.7 });
    page.drawRectangle({ x: M + labelW, y: y - alto, width: ANCHO - labelW, height: alto, borderColor: LINEA, borderWidth: 0.7 });
    page.drawText(limpiar(label), { x: M + 7, y: y - 13, size, font: bold, color: INK });
    valLines.forEach((l, i) => {
      page.drawText(l, { x: M + labelW + 8, y: y - 13 - i * 12, size, font, color: INK });
    });
    y -= alto;
  };

  for (const f of datos.filasUsuario) filaTabla(f.etiqueta, f.valor);
  y -= 12;

  // ---------- Intro ----------
  if (datos.intro.trim()) {
    for (const l of envolver(datos.intro, font, 9, ANCHO)) {
      asegurar(12.5);
      page.drawText(l, { x: M, y: y - 11, size: 9, font, color: INK });
      y -= 12.5;
    }
    y -= 6;
  }

  // ---------- Tabla de equipo ----------
  if (datos.filasEquipo.length) {
    for (const f of datos.filasEquipo) filaTabla(f.etiqueta, f.valor);
    y -= 12;
  }

  // ---------- Cuerpo (normas / condiciones) ----------
  const numSize = 7.8;
  for (const cruda of datos.cuerpo.split("\n")) {
    const linea = cruda.trim();
    if (!linea) {
      y -= 5;
      continue;
    }
    const numerada = /^\d+[.)]/.test(linea);
    const f = numerada ? font : bold;
    for (const l of envolver(linea, f, numSize, ANCHO)) {
      asegurar(9.8);
      page.drawText(l, { x: M, y: y - 9, size: numSize, font: f, color: INK });
      y -= 9.8;
    }
    y -= 2;
  }

  // ---------- Firmas ----------
  y -= 14;
  if (y < 150) nuevaPagina();
  const anchoBloque = 224;
  const xIzq = M + 4;
  const xDer = W - M - anchoBloque - 4;
  const yLinea = y - 40;

  if (datos.firma) {
    try {
      const img = await doc.embedPng(datos.firma);
      const escala = Math.min(180 / img.width, 52 / img.height, 1);
      const fw = img.width * escala;
      const fh = img.height * escala;
      page.drawImage(img, { x: xIzq + (anchoBloque - fw) / 2, y: yLinea + 4, width: fw, height: fh });
    } catch {
      /* firma en papel */
    }
  }

  for (const x of [xIzq, xDer]) {
    page.drawLine({ start: { x, y: yLinea }, end: { x: x + anchoBloque, y: yLinea }, thickness: 0.9, color: INK });
  }
  const etiqueta = (txt: string, xIni: number) => {
    envolver(txt, font, 8, anchoBloque).forEach((l, i) => {
      const w = font.widthOfTextAtSize(l, 8);
      page.drawText(l, { x: xIni + (anchoBloque - w) / 2, y: yLinea - 12 - i * 10, size: 8, font, color: INK });
    });
  };
  etiqueta(datos.etiquetaIzq, xIzq);
  etiqueta(datos.etiquetaDer, xDer);
  y = yLinea - 34;

  if (datos.sustituye) {
    asegurar(12);
    page.drawText("Esta carta responsiva sustituye a anteriores.", { x: M, y: y - 8, size: 8, font: bold, color: INK });
  }

  // ---------- Pie en todas las páginas ----------
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 0.8, color: LINEA });
    const emp = limpiar(datos.empresa).toUpperCase();
    const empW = bold.widthOfTextAtSize(emp, 8);
    p.drawText(emp, { x: (W - empW) / 2, y: 40, size: 8, font: bold, color: NAVY });
    const dir = limpiar(datos.direccion);
    const dirW = font.widthOfTextAtSize(dir, 6.5);
    p.drawText(dir, { x: Math.max(M, (W - dirW) / 2), y: 30, size: 6.5, font, color: GRIS });
    p.drawText(limpiar(`Folio: ${datos.folio}`), { x: M, y: 19, size: 6.5, font, color: GRIS });
    if (paginas.length > 1) {
      const num = `Pág. ${i + 1}/${paginas.length}`;
      p.drawText(num, { x: W - M - font.widthOfTextAtSize(num, 6.5), y: 19, size: 6.5, font, color: GRIS });
    }
  });

  return doc.save();
}
