import { PDFDocument } from "pdf-lib";

/**
 * Carga masiva de responsivas: un PDF con muchas cartas se parte en una por
 * página y de cada una se lee lo que trae escrito para saber de quién es.
 *
 * Todo corre en el servidor: pdf-lib separa las páginas y pdf.js lee su texto.
 * Si la página es un escaneo sin capa de texto no se adivina nada: se separa
 * igual y el usuario elige el empleado a mano, que es lo que se necesita.
 */

export type PaginaLote = {
  /** 1..n dentro del archivo original. */
  pagina: number;
  archivo: string;
  /** PDF de esa sola página, en base64, para guardarlo al confirmar. */
  pdfBase64: string;
  texto: string;
  folio: string | null;
  numeroEmpleado: string | null;
  nombre: string | null;
  fecha: string | null;
  clase: string | null;
  series: string[];
};

const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

/** Texto de cada página del PDF. Vacío donde la página es una imagen escaneada. */
async function textoPorPagina(datos: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: datos, isEvalSupported: false, useSystemFonts: true }).promise;
  const salida: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const contenido = await page.getTextContent();
    salida.push(limpio(contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ")));
  }
  await doc.destroy();
  return salida;
}

/** Valor que sigue a una etiqueta de la carta ("Numero de empleado 2437"). */
function tras(texto: string, etiqueta: RegExp, largo = 60): string | null {
  const m = texto.match(etiqueta);
  if (!m || m.index === undefined) return null;
  return limpio(texto.slice(m.index + m[0].length, m.index + m[0].length + largo));
}

/** Clase de carta según las palabras del encabezado. */
function claseDe(texto: string): string | null {
  const t = texto.toUpperCase();
  if (/WI-?FI/.test(t)) return "WIFI";
  if (/DESCUENTO DE N[OÓ]MINA|VALE/.test(t)) return "VALE";
  if (/EQUIPO CELULAR|CELULAR/.test(t)) return "CELULAR";
  if (/EQUIPO DE C[OÓ]MPUTO|C[OÓ]MPUTO/.test(t)) return "COMPUTO";
  if (/OTROS EQUIPOS/.test(t)) return "OTROS";
  return null;
}

/** Lo que se puede deducir del texto de una carta. */
export function leerPagina(texto: string): Omit<PaginaLote, "pagina" | "archivo" | "pdfBase64" | "texto"> {
  const folio = texto.match(/\b((?:RESP|VALE|HIST)-\d{4}-\d{3,})\b/i)?.[1]?.toUpperCase() ?? null;

  // El número de empleado va justo después de su etiqueta en la tabla.
  let numeroEmpleado: string | null = null;
  const trasEtiqueta = tras(texto, /N[uú]mero de empleado|Numero de empleado|No\.? de empleado/i, 24);
  if (trasEtiqueta) numeroEmpleado = trasEtiqueta.match(/\d{1,6}/)?.[0] ?? null;

  const nombreCrudo = tras(texto, /Nombre del Usuario/i, 70);
  // El nombre termina donde empieza la siguiente etiqueta de la tabla.
  const nombre = nombreCrudo
    ? limpio(nombreCrudo.split(/N[uú]mero de empleado|Numero de empleado|No\.? de empleado|[ÁA]rea/i)[0]).replace(/[:.]+$/, "") ||
      null
    : null;

  const f = texto.match(/Fecha:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const fecha = f ? `${f[3]}-${f[2]}-${f[1]}` : null;

  // Series y IMEI: sirven para amarrar la carta con el equipo del inventario.
  const series: string[] = [];
  const serie = tras(texto, /\bSerie\b\s*:?/i, 26);
  if (serie) {
    const v = serie.match(/[A-Z0-9-]{5,}/i)?.[0];
    if (v) series.push(v.toUpperCase());
  }
  const imei = texto.match(/\bIMEI\b\s*:?\s*(\d{14,16})/i)?.[1];
  if (imei) series.push(imei);

  return { folio, numeroEmpleado, nombre: nombre || null, fecha, clase: claseDe(texto), series };
}

/** Parte el PDF en páginas y lee cada una. */
export async function partirLote(datos: Uint8Array, nombreArchivo: string): Promise<PaginaLote[]> {
  const original = await PDFDocument.load(datos, { ignoreEncryption: true });
  const total = original.getPageCount();
  const textos = await textoPorPagina(datos).catch((e) => {
    // Si no se puede leer el texto se sigue: las páginas se separan igual y el
    // empleado se elige a mano. Queda constancia en la consola del servidor.
    console.error("No se pudo leer el texto del PDF del lote:", e);
    return [] as string[];
  });

  const salida: PaginaLote[] = [];
  for (let i = 0; i < total; i += 1) {
    const suelta = await PDFDocument.create();
    const [copia] = await suelta.copyPages(original, [i]);
    suelta.addPage(copia);
    const bytes = await suelta.save();
    const texto = textos[i] ?? "";
    salida.push({
      pagina: i + 1,
      archivo: nombreArchivo,
      pdfBase64: Buffer.from(bytes).toString("base64"),
      texto,
      ...leerPagina(texto),
    });
  }
  return salida;
}
