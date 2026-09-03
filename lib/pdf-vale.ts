import { PDFDocument, PDFFont, PDFImage, rgb } from "pdf-lib";
import { StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

/**
 * El vale de descuento de nómina, calcado del formato de papel.
 *
 * No usa el motor de las cartas responsivas porque no se parece en nada: el
 * vale no lleva tabla de equipo ni recuadros, sino renglones con espacios en
 * blanco que el empleado llena de su puño al firmar —el día, la semana, el
 * año— mezclados con datos que sí imprime el sistema —su nombre, su número,
 * el concepto y el precio—.
 *
 * Esa mezcla es la que manda en el diseño: lo impreso va en negritas y lo que
 * se llena a mano va como una raya. El texto sigue viniendo de la plantilla
 * editable, así que Recursos Humanos puede cambiar la redacción, alargar una
 * raya o mover el corte de un renglón sin tocar código.
 */

const W = 612; // Carta
const H = 792;
const M = 55;
const ANCHO = W - 2 * M;

const INK = rgb(0.1, 0.1, 0.11);
const LINEA = rgb(0.35, 0.35, 0.38);

/** Los datos impresos llegan envueltos en estas marcas para saber cuáles son. */
export const ABRE = "\u0001";
export const CIERRA = "\u0002";

/** Envuelve un valor para que el vale lo imprima en negritas. */
export function dato(valor: string): string {
  const v = (valor ?? "").trim();
  return v ? `${ABRE}${v}${CIERRA}` : "";
}

export interface DatosVale {
  /** Razón social del encabezado. */
  razonSocial: string;
  encabezado: string;
  /** La plantilla ya sustituida, con las marcas de los datos impresos. */
  cuerpo: string;
  folio: string;
  empresa: string;
  direccion: string;
  firmaEmpleado: string | null;
  firmaAutoridad: string | null;
  etiquetaEmpleado: string[];
  etiquetaAutoridad: string[];
}

function limpiar(t: string): string {
  return (t || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•●]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\u0001\u0002]/g, "")
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

// ------------------------------------------------------------------- trozos

/** Un pedazo de renglón: texto corrido, un dato impreso, o una raya en blanco. */
type Trozo =
  | { t: "txt"; s: string }
  | { t: "dato"; s: string }
  | { t: "raya"; guiones: number };

/**
 * Parte un renglón en sus pedazos.
 *
 * Lo que viene entre marcas es un dato que imprime el sistema; una corrida de
 * tres o más guiones bajos es un espacio que se llena a mano, y su largo lo
 * decide quien escribe la plantilla poniendo más o menos guiones.
 */
function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  const partes = linea.split(new RegExp(`(${ABRE}[^${CIERRA}]*${CIERRA}|_{3,})`));
  for (const parte of partes) {
    if (!parte) continue;
    if (parte.startsWith(ABRE)) {
      const s = parte.slice(1, -1).trim();
      if (s) salida.push({ t: "dato", s });
    } else if (/^_{3,}$/.test(parte)) {
      salida.push({ t: "raya", guiones: parte.length });
    } else {
      // Un trozo de puro espacio también cuenta: es el que separa el concepto
      // de la raya que lo sigue, y sin él se leen pegados.
      salida.push({ t: "txt", s: parte.replace(/\s+/g, " ") });
    }
  }
  return salida;
}

// ------------------------------------------------------------------- párrafo

/**
 * Parte la plantilla en sus tres bloques, separados por renglones en blanco:
 * la fecha de arriba, los renglones que se llenan, y la cláusula.
 */
function bloques(cuerpo: string): { fecha: string; campos: string[]; clausula: string[] } {
  const partes = cuerpo
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const fecha = partes.shift() ?? "";
  const campos = (partes.shift() ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const clausula = partes.join("\n").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  return { fecha, campos, clausula };
}

function cargarLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "sultana-logo.png"));
  } catch {
    return null;
  }
}

export async function generarVale(datos: DatosVale): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${datos.folio} - ${datos.empresa}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  const bytesLogo = cargarLogo();
  if (bytesLogo) {
    try {
      logo = await doc.embedPng(bytesLogo);
    } catch {
      logo = null;
    }
  }
  const embeberFirma = async (dataUrl: string | null): Promise<PDFImage | null> => {
    if (!dataUrl) return null;
    try {
      return /^data:image\/jpe?g/i.test(dataUrl) ? await doc.embedJpg(dataUrl) : await doc.embedPng(dataUrl);
    } catch {
      return null;
    }
  };
  const firmaEmp = await embeberFirma(datos.firmaEmpleado);
  const firmaAut = await embeberFirma(datos.firmaAutoridad);

  const { fecha, campos, clausula } = bloques(datos.cuerpo);
  const page = doc.addPage([W, H]);

  const escribir = (s: string, x: number, y: number, size: number, f: PDFFont, color = INK) =>
    page.drawText(limpiar(s), { x, y, size, font: f, color });

  const raya = (x: number, y: number, ancho: number) =>
    page.drawLine({ start: { x, y }, end: { x: x + ancho, y }, thickness: 0.9, color: LINEA });

  let y = H - M;

  // ---------------------------------------------------------- encabezado
  const anchoLogo = 96;
  const altoLogo = logo ? (logo.height / logo.width) * anchoLogo : 0;
  if (logo) page.drawImage(logo, { x: M, y: y - altoLogo, width: anchoLogo, height: altoLogo });

  const razon = limpiar(datos.razonSocial);
  escribir(razon, (W - bold.widthOfTextAtSize(razon, 14)) / 2, y - 16, 14, bold);
  const sub = limpiar(datos.encabezado);
  escribir(sub, (W - bold.widthOfTextAtSize(sub, 9)) / 2, y - 30, 9, bold);

  y -= Math.max(altoLogo, 40) + 34;

  // ------------------------------------------------------------- la fecha
  // Va suelta arriba a la derecha, como en el papel: la escribe quien firma.
  {
    const size = 9.5;
    let x = M + ANCHO * 0.47;
    for (const tr of trozos(fecha)) {
      if (tr.t === "raya") {
        const ancho = W - M - x;
        raya(x, y - 2, ancho);
        x += ancho;
      } else {
        const f = tr.t === "dato" ? bold : font;
        escribir(tr.s, x, y, size, f);
        x += f.widthOfTextAtSize(limpiar(tr.s), size);
      }
    }
  }
  y -= 72;

  // -------------------------------------------------- los renglones del vale
  // El renglón se parte en dos columnas con "||": así queda el corte del
  // formato de papel, con el texto de la derecha alineado en su propia columna.
  const SIZE = 9.5;
  const xIzq = M + 6;
  const xDer = M + ANCHO * 0.6;
  // Un dato impreso lleva aire a los lados: en el papel va escrito sobre una
  // raya larga, y pegado al texto de junto se lee como una sola palabra.
  const AIRE = 3;

  /** Lo que mide la columna con sus rayas al largo que pide la plantilla. */
  const anchoDe = (lista: Trozo[], size: number) => {
    const guion = font.widthOfTextAtSize("_", size);
    return lista.reduce((suma, tr) => {
      if (tr.t === "raya") return suma + tr.guiones * guion;
      const f = tr.t === "dato" ? bold : font;
      return suma + f.widthOfTextAtSize(limpiar(tr.s), size) + (tr.t === "dato" ? AIRE * 2 : 0);
    }, 0);
  };

  for (const linea of campos) {
    const [izq, der] = linea.split("||");

    const columna = (texto: string, xIni: number, xTope: number) => {
      const lista = trozos(texto);
      if (!lista.length) return;

      // Un concepto largo o un precio con muchas letras no puede invadir la
      // columna de junto: si no cabe, el renglón se achica hasta que quepa.
      const disponible = xTope - xIni;
      const natural = anchoDe(lista, SIZE);
      const size = natural > disponible ? Math.max(6.8, (SIZE * disponible) / natural) : SIZE;
      const guion = font.widthOfTextAtSize("_", size);

      let x = xIni;
      lista.forEach((tr, i) => {
        if (tr.t === "raya") {
          // La raya que cierra el renglón se estira hasta el tope: es el
          // espacio largo que el papel deja para escribir.
          const ultima = i === lista.length - 1;
          const ancho = ultima ? Math.max(30, xTope - x) : Math.min(tr.guiones * guion, xTope - x);
          raya(x, y - 2, ancho);
          x += ancho;
        } else {
          const f = tr.t === "dato" ? bold : font;
          const s = limpiar(tr.s);
          if (tr.t === "dato") x += AIRE;
          escribir(s, x, y, size, f);
          x += f.widthOfTextAtSize(s, size) + (tr.t === "dato" ? AIRE : 0);
        }
      });
    };

    columna(izq ?? "", xIzq, der != null ? xDer - 8 : W - M);
    if (der != null) columna(der, xDer, W - M);
    y -= 26;
  }

  // ------------------------------------------------------------- la cláusula
  y -= 30;
  for (const linea of clausula) {
    const encabezado = linea.trim().endsWith(":");
    const f = encabezado ? bold : font;
    const tam = encabezado ? 8.8 : 8.3;
    for (const l of envolver(linea, f, tam, ANCHO)) {
      escribir(l, M, y, tam, f);
      y -= 12;
    }
    y -= encabezado ? 3 : 1;
  }

  // -------------------------------------------------------------- las firmas
  // Las dos van una debajo de otra y a la izquierda, no enfrentadas: es la
  // estructura del formato, primero quien recibe y abajo Recursos Humanos.
  const anchoFirma = 170;
  const xFirma = M + 60;
  const bloqueFirma = (yLinea: number, img: PDFImage | null, etiquetas: string[]) => {
    if (img) {
      const escala = Math.min((anchoFirma - 20) / img.width, 42 / img.height, 1);
      const w = img.width * escala;
      const h = img.height * escala;
      page.drawImage(img, { x: xFirma + (anchoFirma - w) / 2, y: yLinea + 4, width: w, height: h });
    }
    page.drawLine({
      start: { x: xFirma, y: yLinea },
      end: { x: xFirma + anchoFirma, y: yLinea },
      thickness: 0.9,
      color: INK,
    });
    etiquetas.forEach((et, i) => {
      const s = limpiar(et);
      const w = font.widthOfTextAtSize(s, 7.5);
      escribir(s, xFirma + (anchoFirma - w) / 2, yLinea - 11 - i * 9, 7.5, font);
    });
  };

  // Van ancladas a la parte baja de la hoja, no colgando del texto: así el
  // vale llena la carta como el papel y las dos rayas caen siempre en el
  // mismo lugar, aunque la cláusula crezca o se acorte.
  const yEmpleado = Math.min(230, y - 46);
  const yRH = Math.max(95, yEmpleado - (20 + datos.etiquetaEmpleado.length * 9 + 85));
  bloqueFirma(yEmpleado, firmaEmp, datos.etiquetaEmpleado);
  bloqueFirma(yRH, firmaAut, datos.etiquetaAutoridad);

  // ------------------------------------------------------------------- pie
  const dir = limpiar(datos.direccion);
  const anchoDir = font.widthOfTextAtSize(dir, 6.5);
  page.drawText(dir, {
    x: Math.max(M, (W - anchoDir) / 2),
    y: 28,
    size: 6.5,
    font,
    color: rgb(0.45, 0.45, 0.48),
  });
  page.drawText(limpiar(`Folio: ${datos.folio}`), { x: M, y: 17, size: 6.5, font, color: rgb(0.45, 0.45, 0.48) });

  return doc.save();
}
