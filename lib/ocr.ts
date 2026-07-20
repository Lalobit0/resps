// OCR de responsivas escaneadas. Corre en el navegador (cliente):
// pdf.js dibuja la primera página en un lienzo y tesseract.js lee el texto.
// Es una AYUDA: si algo falla o se equivoca, la captura manual sigue funcionando.

export type ResultadoOcr = {
  texto: string;
  clase: string | null; // COMPUTO | CELULAR | OTROS | WIFI
  numeroEmpleado: string | null;
  equipo: Record<string, string>; // marca, modelo, serie, imei, numero, plan, condicion, ...
  seleccion: LecturaSeleccionable | null; // solo en escaneos: imagen + palabras para seleccionar/copiar
};

// Una palabra reconocida con su posición (en píxeles de la imagen).
// fin marca la última palabra de un renglón (para el salto de línea al copiar).
export type PalabraOcr = { texto: string; x: number; y: number; w: number; h: number; fin?: boolean };

// Imagen del escaneo + palabras posicionadas, para pintar una capa de texto
// seleccionable encima (como el "texto en vivo" del iPhone).
export type LecturaSeleccionable = {
  imagen: string; // dataURL de la página
  ancho: number; // px de la imagen
  alto: number;
  palabras: PalabraOcr[];
  texto: string; // texto plano completo
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

/** Escala de grises con contraste suave, del MISMO tamaño (no recorta): así las
 *  posiciones de las palabras que devuelve el OCR siguen coincidiendo con la imagen. */
function aGrises(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Corre Tesseract sobre un lienzo y devuelve el texto y cada palabra con su caja. */
async function ocrConCajas(lienzo: HTMLCanvasElement): Promise<{ texto: string; palabras: PalabraOcr[] }> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("spa");
  try {
    // PSM 4 (una sola columna): lee las tablas del formato renglón por renglón,
    // con etiqueta y valor juntos. El modo automático se comía la columna de
    // etiquetas (probado contra escaneos reales de Sultana).
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
    const { data } = await worker.recognize(lienzo, {}, { text: true, blocks: true });
    const palabras: PalabraOcr[] = [];
    for (const b of data.blocks ?? []) {
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) {
          const inicio = palabras.length;
          for (const w of l.words ?? []) {
            const t = (w.text ?? "").trim();
            if (!t) continue;
            const { x0, y0, x1, y1 } = w.bbox;
            palabras.push({ texto: t, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
          }
          if (palabras.length > inicio) palabras[palabras.length - 1].fin = true;
        }
      }
    }
    return { texto: data.text ?? "", palabras };
  } finally {
    await worker.terminate();
  }
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

/** Renglones del cuadro de características (entre "características" y las normas). */
function bloqueEquipo(texto: string): string[] {
  const lineas = texto.split(/\n/);
  const ini = lineas.findIndex((l) => /caracteristicas/.test(normLP(l)));
  if (ini < 0) return [];
  let fin = lineas.findIndex((l, i) => i > ini && /usuario es responsable|obliga a cumplir/.test(normLP(l)));
  if (fin < 0) fin = Math.min(lineas.length, ini + 14);
  return lineas
    .slice(ini + 1, fin)
    .map((l) => l.replace(/[|>_<\][¡!=—–"']+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Respaldo cuando el escaneo destroza las etiquetas del cuadro (Serie→"See",
 * o de plano se pierden): clasifica cada renglón del cuadro POR SU FORMA
 * (IMEI = 14-16 dígitos, teléfono = 10 dígitos, serie = token alfanumérico, …).
 * Solo llena campos que sigan vacíos; nunca pisa lo encontrado por etiqueta.
 */
function llenarPorForma(texto: string, equipo: Record<string, string>): void {
  const ETIQ = /^(marca|modelo|serie|imei|numero|plan|descripcion|condicion|accesorios)\b/;
  const pon = (f: string, v: string) => {
    if (!equipo[f] && v) equipo[f] = v;
  };
  for (const linea of bloqueEquipo(texto)) {
    if (ETIQ.test(normLP(linea))) continue; // ya la intentó el match por etiqueta
    const soloDigitos = linea.replace(/\D/g, "");
    const tokens = linea.split(/\s+/);
    if (/^[\d\s]+$/.test(linea) && soloDigitos.length >= 14 && soloDigitos.length <= 16) pon("imei", soloDigitos);
    else if (/^[\d\s-]+$/.test(linea) && soloDigitos.length === 10) pon("numero", linea.trim());
    else if (/\bplan\b/i.test(linea)) pon("plan", linea);
    else if (/\/|\bpin\b/i.test(linea)) pon("descripcion", linea);
    else if (/case|cargador|funda|mica|cable|audifono|estuche|protector/i.test(normLP(linea))) pon("accesorios", linea);
    else if (/sin detalles|nuevo|usado|reemplazo|golpeado|rayado/i.test(normLP(linea))) pon("condicion", linea);
    else if (tokens.length === 1 && /[A-Za-z]/.test(linea) && /\d/.test(linea) && linea.length >= 6 && linea.length <= 20)
      pon("serie", linea.toUpperCase());
    else if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ]+(\s[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?$/.test(linea) && !equipo.marca) pon("marca", linea);
    else if (/[A-Za-z]/.test(linea) && /\d/.test(linea)) {
      if (!equipo.modelo) pon("modelo", linea);
      else pon("descripcion", linea);
    }
  }
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

  // Respaldo cuando el escaneo destroza las etiquetas del cuadro: clasifica los
  // renglones del cuadro por su forma. Solo en celular, donde el cuadro es fijo
  // (en cómputo hay campos ambiguos, ahí no adivinamos).
  if (clase === "CELULAR") llenarPorForma(texto, equipo);
  return { clase, numeroEmpleado, equipo };
}

export async function leerResponsiva(file: File, onProgreso?: (msg: string) => void): Promise<ResultadoOcr> {
  const esPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";

  // 1) Si el PDF trae texto real (generado digitalmente), se lee exacto: sin OCR.
  //    Ahí el visor nativo del PDF ya permite seleccionar y copiar (seleccion = null).
  if (esPdf) {
    onProgreso?.("Leyendo el texto del PDF…");
    try {
      const texto = await textoDePdf(file);
      if (texto.replace(/\s/g, "").length >= 40) {
        const { clase, numeroEmpleado, equipo } = extraerCarta(texto);
        return { texto, clase, numeroEmpleado, equipo, seleccion: null };
      }
    } catch {
      // Sin capa de texto o error: seguimos con el OCR de imagen.
    }
  }

  // 2) Escaneo/foto (imagen sin texto): OCR con posiciones para poder
  //    seleccionar el texto directamente sobre la imagen (como el iPhone).
  onProgreso?.("Preparando la imagen…");
  const base = esPdf ? await pdfACanvas(file) : await imagenACanvas(file);
  const lienzo = aGrises(base);
  onProgreso?.("Leyendo el texto (la primera vez descarga el idioma, puede tardar)…");
  const { texto, palabras } = await ocrConCajas(lienzo);
  const { clase, numeroEmpleado, equipo } = extraerCarta(texto);
  const seleccion: LecturaSeleccionable = {
    imagen: base.toDataURL("image/jpeg", 0.82),
    ancho: base.width,
    alto: base.height,
    palabras,
    texto,
  };
  return { texto, clase, numeroEmpleado, equipo, seleccion };
}
