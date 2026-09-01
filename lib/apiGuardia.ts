import { puede, usuarioActual } from "./auth";
import type { Permiso } from "./permisos";

/**
 * Guardia para las rutas que entregan archivos.
 *
 * Son la puerta de atrás: un PDF, un respaldo o una exportación se piden por
 * dirección directa, sin pasar por ninguna pantalla. Si aquí no se revisa el
 * permiso, esconder el botón no sirve de nada.
 *
 * Devuelve la respuesta de rechazo cuando no se puede, o null cuando sí.
 */
export async function puedeApi(permiso: Permiso | string): Promise<Response | null> {
  const u = await usuarioActual();
  if (!u) {
    return new Response("Tu sesión expiró. Vuelve a entrar.", { status: 401 });
  }
  if (!puede(u, permiso)) {
    return new Response("No tienes permiso para abrir esto.", { status: 403 });
  }
  return null;
}
