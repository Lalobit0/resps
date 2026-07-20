// OCR de responsivas escaneadas. Corre en el navegador (cliente):
// pdf.js dibuja la primera página en un lienzo y tesseract.js lee el texto.
// Es una AYUDA: si algo falla, la captura manual sigue funcionando.

export type ResultadoOcr = {
  texto: string;
  numeroEmpleado: string | null;
  series: string[];
};

async function pdfACanvas(file: File): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import("pdfjs-dist");
  // El worker se carga desde CDN con la misma versión instalada (requiere internet).
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.2 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
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

function sinAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Busca el número de empleado y los números de serie leyendo por líneas.
 * El valor puede estar en la misma línea que la etiqueta (tabla) o en la siguiente.
 */
export function extraerDatos(texto: string): { numeroEmpleado: string | null; series: string[] } {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let numeroEmpleado: string | null = null;
  const series: string[] = [];

  const numeroCerca = (i: number): string | null => {
    const aqui = lineas[i].match(/(\d{2,6})(?!\d)/);
    if (aqui) return aqui[1];
    const sig = lineas[i + 1]?.match(/^\D{0,6}(\d{2,6})(?!\d)/);
    return sig ? sig[1] : null;
  };

  const serieCerca = (i: number): string | null => {
    const n = sinAcentos(lineas[i]);
    const pos = n.indexOf("serie");
    const resto = pos >= 0 ? lineas[i].slice(pos + 5) : "";
    let m = resto.match(/[A-Za-z0-9][A-Za-z0-9-]{3,}/);
    if (!m && lineas[i + 1]) m = lineas[i + 1].match(/[A-Za-z0-9][A-Za-z0-9-]{3,}/);
    return m ? m[0].toUpperCase().replace(/[.,;:]+$/, "") : null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const n = sinAcentos(lineas[i]);
    if (
      numeroEmpleado === null &&
      n.includes("empleado") &&
      (n.includes("numero") || n.includes("num ") || n.includes("no ") || n.includes("no.")) &&
      !n.includes("quien recibe") &&
      !n.includes("firma")
    ) {
      const num = numeroCerca(i);
      if (num) numeroEmpleado = num;
    }
    if (n.includes("serie")) {
      const s = serieCerca(i);
      if (s && !series.includes(s)) series.push(s);
    }
  }
  return { numeroEmpleado, series };
}

export async function leerResponsiva(file: File, onProgreso?: (msg: string) => void): Promise<ResultadoOcr> {
  const esPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  onProgreso?.("Preparando la imagen…");
  const canvas = esPdf ? await pdfACanvas(file) : await imagenACanvas(file);
  onProgreso?.("Leyendo el texto (la primera vez descarga el idioma, puede tardar)…");
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(canvas, "spa");
  const { numeroEmpleado, series } = extraerDatos(data.text || "");
  return { texto: data.text || "", numeroEmpleado, series };
}
