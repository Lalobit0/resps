// OCR de responsivas escaneadas. Corre en el navegador (cliente):
// pdf.js dibuja la primera página en un lienzo y tesseract.js lee el texto.
// Es una AYUDA: si algo falla o se equivoca, la captura manual sigue funcionando.

export type ResultadoOcr = {
  texto: string;
  clase: string | null; // COMPUTO | CELULAR | OTROS | WIFI
  numeroEmpleado: string | null;
  equipo: Record<string, string>; // marca, modelo, serie, imei, numero, plan, condicion, ...
};

async function pdfACanvas(file: File): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import("pdfjs-dist");
  // El worker se carga desde CDN con la misma versión instalada (requiere internet).
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  // Alta resolución para que el OCR distinga bien los valores de la tabla.
  const viewport = page.getViewport({ scale: 3.3 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Lee el texto REAL incrustado en el PDF (cuando fue generado digitalmente).
 * Devuelve "" si el PDF es una imagen escaneada (sin capa de texto), para
 * caer entonces al OCR. Es exacto: no inventa caracteres como Tesseract.
 */
async function textoDePdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const crudos = content.items as unknown as Array<{ str?: unknown; transform?: unknown }>;
  const items: { str: string; x: number; y: number }[] = [];
  for (const i of crudos) {
    if (typeof i.str === "string" && i.str.trim() && Array.isArray(i.transform)) {
      items.push({ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number });
    }
  }

  // Agrupa por renglón (misma Y, con tolerancia) y ordena cada renglón por X.
  const filas: { y: number; items: typeof items }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const fila = filas.find((f) => Math.abs(f.y - it.y) <= 3);
    if (fila) fila.items.push(it);
    else filas.push({ y: it.y, items: [it] });
  }
  return filas
    .map((f) =>
      f.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

/** Recorta la parte superior (donde están los datos) y pasa a escala de grises con contraste. */
function preprocesar(src: HTMLCanvasElement, fraccionAlto: number): HTMLCanvasElement {
  const alto = Math.max(1, Math.floor(src.height * fraccionAlto));
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = alto;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0, src.width, alto, 0, 0, src.width, alto);
  const img = ctx.getImageData(0, 0, out.width, alto);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = g < 140 ? Math.max(0, g - 45) : Math.min(255, g + 30);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

async function imagenACanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolver, rechazar) => {
      const i = new Image();
      i.onload = () => resolver(i);
      i.onerror = () => rechazar(new Error("No se pudo leer la imagen."));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Minúsculas + sin acentos, conservando la longitud (á→a, ñ→n, etc.). */
function normLP(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàäâ]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n");
}

/** Limpia la basura que el OCR mete alrededor de los valores (____, >>>>, |, etc.). */
function limpiarValor(v: string): string {
  return v
    .replace(/^[\s_>|:.\-[\]¡!]+/, "")
    .split(/\s{3,}|[_>|]{2,}/)[0]
    .replace(/[\s_>|.,;:\-]+$/, "")
    .trim();
}

/** Toma el valor que sigue a una etiqueta (misma línea). etiqueta es un patrón regex. */
function campo(texto: string, etiqueta: string): string {
  const re = new RegExp(`(?:^|\\n)[\\s\\[|¡!]*${etiqueta}\\s*[:.|\\]]?\\s*([^\\n]+)`, "i");
  const m = texto.match(re);
  return m ? limpiarValor(m[1]) : "";
}

/** Índice de la línea del "modelo" (donde empieza el cuadro de características). */
function lineaModelo(lineas: string[]): number {
  return lineas.findIndex((l) => /model[o0]/i.test(l));
}

/** Primer token con pinta de número de serie en una línea (deja fuera la etiqueta mal leída). */
function tokenSerie(linea: string): string {
  const limpia = linea.replace(/[|>_<\][¡!=.,;:—–]+/g, " ");
  for (const raw of limpia.split(/\s+/)) {
    const t = raw.replace(/[^A-Za-z0-9-]/g, "");
    if (t.length < 5 || t.length > 24) continue;
    if (/[A-Za-z]/.test(t) && /\d/.test(t)) return t.toUpperCase(); // letras + dígitos = serie típica
    if (/^\d{6,13}$/.test(t)) return t; // serie de solo dígitos (no llega a IMEI)
  }
  return "";
}

/**
 * La serie es la línea que sigue al modelo dentro del cuadro. El OCR suele
 * destrozar la etiqueta ("Serie" → "See"), así que la ubicamos por posición.
 */
function serieProbable(texto: string, equipo: Record<string, string>): string {
  const lineas = texto.split(/\n/);
  const idx = lineaModelo(lineas);
  if (idx < 0) return "";
  const imei = (equipo.imei ?? "").replace(/\D/g, "");
  const numero = (equipo.numero ?? "").replace(/\s/g, "");
  for (let i = idx + 1; i < Math.min(lineas.length, idx + 4); i++) {
    const t = tokenSerie(lineas[i]);
    if (!t) continue;
    if (/^\d{14,}$/.test(t)) continue; // es el IMEI
    if (imei && t.replace(/\D/g, "") === imei) continue;
    if (numero && t === numero) continue;
    return t;
  }
  return "";
}

/** El IMEI es una corrida de 14-16 dígitos (tolera O→0, l/I→1 del OCR). */
function imeiProbable(texto: string): string {
  const m = texto.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").match(/\d{14,16}/);
  return m ? m[0] : "";
}

/** Extrae clase (tipo de carta), número de empleado y datos del equipo del texto reconocido. */
export function extraerCarta(texto: string): {
  clase: string | null;
  numeroEmpleado: string | null;
  equipo: Record<string, string>;
} {
  const nl = normLP(texto);
  const sinEsp = nl.replace(/[^a-z0-9]/g, "");
  const plano = nl.replace(/\s+/g, " ");

  let clase: string | null = null;
  if (/equipocelular|celular|telefono/.test(sinEsp)) clase = "CELULAR";
  else if (/equipodecomputo|computo/.test(sinEsp)) clase = "COMPUTO";
  else if (/otrosequipos/.test(sinEsp)) clase = "OTROS";
  else if (/redwifi|wifi|wi-?fi/.test(sinEsp)) clase = "WIFI";

  const num = plano.match(/numero\s*de\s*empleado\D{0,6}(\d{2,6})/);
  const numeroEmpleado = num ? num[1] : null;

  const equipo: Record<string, string> = {};
  const set = (f: string, patron: string) => {
    if (equipo[f]) return;
    const v = campo(texto, patron);
    if (v) equipo[f] = v;
  };
  set("marca", "marca");
  set("modelo", "modelo");
  set("serie", "(?:no\\.?\\s*de\\s*serie|numero de serie|serie|s\\s*/\\s*n)");
  set("imei", "imei");
  set("numero", "numero(?!\\s*de\\s*empleado)");
  set("plan", "plan");
  set("descripcion", "descripci[oó]n");
  set("condicion", "condici[oó]n");
  set("accesorios", "accesorios");
  set("activo", "activo");
  set("procesador", "procesador");
  set("ram", "(?:memoria(?: ram)?|ram)");
  set("hd", "(?:disco(?: duro)?|hd)");
  set("sistema_operativo", "sistema operativo");
  set("nombre_computadora", "nombre de la computadora");
  set("nombre_equipo", "nombre del equipo");
  set("monitor", "monitor");

  // Respaldos por forma cuando el OCR destroza la etiqueta:
  // el IMEI (solo en celulares) es una corrida larga de dígitos…
  if (!equipo.imei && clase === "CELULAR") {
    const imei = imeiProbable(texto);
    if (imei) equipo.imei = imei;
  }
  // …y en el celular la serie es la línea que sigue al modelo dentro del cuadro
  // (en cómputo esa línea suele ser el procesador, así que ahí no adivinamos).
  if (!equipo.serie && clase === "CELULAR") {
    const serie = serieProbable(texto, equipo);
    if (serie) equipo.serie = serie;
  }
  return { clase, numeroEmpleado, equipo };
}

export async function leerResponsiva(file: File, onProgreso?: (msg: string) => void): Promise<ResultadoOcr> {
  const esPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";

  // 1) Si el PDF trae texto real (generado digitalmente), se lee exacto: sin OCR.
  if (esPdf) {
    onProgreso?.("Leyendo el texto del PDF…");
    try {
      const texto = await textoDePdf(file);
      if (texto.replace(/\s/g, "").length >= 40) {
        const { clase, numeroEmpleado, equipo } = extraerCarta(texto);
        return { texto, clase, numeroEmpleado, equipo };
      }
    } catch {
      // Sin capa de texto o error: seguimos con el OCR de imagen.
    }
  }

  // 2) Escaneo/foto (imagen sin texto): se reconoce con OCR (menos exacto).
  onProgreso?.("Preparando la imagen…");
  const base = esPdf ? await pdfACanvas(file) : await imagenACanvas(file);
  const lienzo = preprocesar(base, esPdf ? 0.6 : 1);
  onProgreso?.("Leyendo el texto (la primera vez descarga el idioma, puede tardar)…");
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(lienzo, "spa");
  const { clase, numeroEmpleado, equipo } = extraerCarta(data.text || "");
  return { texto: data.text || "", clase, numeroEmpleado, equipo };
}
