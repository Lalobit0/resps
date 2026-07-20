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
    const v = campo(texto, patron);
    if (v) equipo[f] = v;
  };
  set("marca", "marca");
  set("modelo", "modelo");
  set("serie", "serie");
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
  return { clase, numeroEmpleado, equipo };
}

export async function leerResponsiva(file: File, onProgreso?: (msg: string) => void): Promise<ResultadoOcr> {
  const esPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  onProgreso?.("Preparando la imagen…");
  const base = esPdf ? await pdfACanvas(file) : await imagenACanvas(file);
  const lienzo = preprocesar(base, esPdf ? 0.6 : 1);
  onProgreso?.("Leyendo el texto (la primera vez descarga el idioma, puede tardar)…");
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(lienzo, "spa");
  const { clase, numeroEmpleado, equipo } = extraerCarta(data.text || "");
  return { texto: data.text || "", clase, numeroEmpleado, equipo };
}
