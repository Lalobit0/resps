/**
 * Qué hacer cuando la pantalla truena.
 *
 * El caso de lejos más común no es un bug: es que el sistema se actualizó
 * mientras alguien lo tenía abierto. El navegador se quedó con la versión
 * vieja y pide archivos que ya no existen —"Loading chunk app/layout
 * failed"—. Con recargar se arregla, pero nadie tiene por qué saberlo: la
 * pantalla se recarga sola.
 *
 * Va aparte de las pantallas de error para que las dos —la del layout y la
 * de las páginas— decidan igual.
 */

/** Cuánto esperar antes de volver a intentar la recarga automática. */
const ESPERA_MS = 15000;

const LLAVE = "recargaPorVersion";

/**
 * El error es de un archivo que ya no existe, no de la lógica del sistema.
 *
 * Cada navegador lo nombra distinto, así que se revisan las tres formas en
 * que llega: el nombre de Next, el texto de Webpack y el de los módulos.
 */
export function esVersionVieja(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const m = error.message ?? "";
  return (
    /Loading chunk \S+ failed/i.test(m) ||
    /Loading CSS chunk/i.test(m) ||
    /Failed to fetch dynamically imported module/i.test(m) ||
    /error loading dynamically imported module/i.test(m) ||
    /Importing a module script failed/i.test(m)
  );
}

/**
 * Recarga una sola vez. Si vuelve a tronar enseguida no insiste: entrar en
 * un ciclo de recargas es peor que la pantalla de error, porque ya no deja
 * ni leer qué pasó.
 *
 * Devuelve si se va a recargar, para que la pantalla muestre "un momento" en
 * vez del mensaje de error.
 */
export function recargarUnaVez(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ultima = Number(sessionStorage.getItem(LLAVE) ?? 0);
    if (Date.now() - ultima < ESPERA_MS) return false;
    sessionStorage.setItem(LLAVE, String(Date.now()));
  } catch {
    // Sin memoria del navegador se recarga igual: una vez no hace daño, y el
    // caso de la versión vieja se resuelve en ese primer intento.
  }
  window.location.reload();
  return true;
}
