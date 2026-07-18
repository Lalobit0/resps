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

/** Busca número de empleado y números de serie dentro del texto reconocido */
export function extraerDatos(texto: string): { numeroEmpleado: string | null; series: string[] } {
  const norm = texto.toLowerCase().replace(/\s+/g, " ");
  let numeroEmpleado: string | null = null;
  const m =
    norm.match(/n[uú]?mero de empleado\D{0,12}(\d{2,6})/) ||
    norm.match(/no\.?\s*de empleado\D{0,12}(\d{2,6})/) ||
    norm.match(/empleado\D{0,8}(\d{2,6})/);
  if (m) numeroEmpleado = m[1];

  const series: string[] = [];
  const re = /serie\W{0,8}([a-z0-9][a-z0-9-]{3,})/gi;
  let x: RegExpExecArray | null;
  while ((x = re.exec(texto)) !== null) {
    const s = x[1].toUpperCase().replace(/[.,;:]+$/, "");
    if (!series.includes(s)) series.push(s);
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
