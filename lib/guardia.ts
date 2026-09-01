import { redirect } from "next/navigation";
import { puede, usuarioActual, type UsuarioSesion } from "./auth";
import type { Permiso } from "./permisos";

/**
 * Guardia de pantalla.
 *
 * El menú ya esconde lo que no toca, pero alguien puede escribir la dirección
 * a mano o traer un enlace guardado. Esto se pone hasta arriba de cada página
 * y manda a una explicación en vez de enseñar lo que no debe.
 *
 * Las acciones del servidor NO se protegen con esto: ellas usan `exigir` o
 * `comprobar`, que devuelven el error sin redirigir.
 */
export async function exigirPagina(permiso: Permiso | string): Promise<UsuarioSesion> {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  if (!puede(u, permiso)) redirect(`/sin-permiso?p=${encodeURIComponent(permiso)}`);
  return u;
}

/** Cuando la pantalla sirve si se tiene cualquiera de varios permisos. */
export async function exigirPaginaAlguno(...permisos: string[]): Promise<UsuarioSesion> {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  if (!permisos.some((p) => puede(u, p))) redirect(`/sin-permiso?p=${encodeURIComponent(permisos[0])}`);
  return u;
}
