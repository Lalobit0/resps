/**
 * Utilidades de imagen para las firmas cargadas desde un archivo.
 * Se ejecutan en el navegador: normalizan cualquier formato a PNG para que el
 * PDF siempre reciba lo mismo y el archivo no pese de más.
 */

const MAX_ANCHO = 600;

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = url;
  });
}

/** Vuelve transparentes los píxeles casi blancos (firmas escaneadas en papel). */
function quitarFondoBlanco(ctx: CanvasRenderingContext2D, ancho: number, alto: number) {
  const datos = ctx.getImageData(0, 0, ancho, alto);
  const px = datos.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) px[i + 3] = 0;
  }
  ctx.putImageData(datos, 0, 0);
}

/** Convierte el archivo de firma a un PNG (data URL) listo para el documento. */
export async function archivoAFirmaPng(archivo: File, recortarFondo = true): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    if (!img.width || !img.height) throw new Error("La imagen está vacía.");

    const escala = Math.min(1, MAX_ANCHO / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (recortarFondo) quitarFondoBlanco(ctx, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
