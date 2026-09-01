"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "../../lib/db";
import {
  COOKIE_SESION,
  cerrarSesionesDe,
  hashClave,
  revisarClave,
  usuarioActual,
  verificarClave,
} from "../../lib/auth";
import { anotar } from "../../lib/bitacora";

/**
 * Cambiar la propia contraseña.
 *
 * Al cambiarla se cierran las demás sesiones de esa persona y se abre una
 * nueva para la que está usando el navegador: si alguien más se quedó dentro,
 * deja de estarlo.
 */
export async function cambiarMiClave(_prev: { error?: string; mensaje?: string } | null, datos: FormData) {
  const u = await usuarioActual();
  if (!u) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const actual = String(datos.get("actual") ?? "");
  const nueva = String(datos.get("nueva") ?? "");
  const repetida = String(datos.get("repetida") ?? "");

  const fila = db.prepare("SELECT clave_hash FROM usuarios WHERE id = ?").get(u.id) as { clave_hash: string };
  if (!verificarClave(actual, fila.clave_hash)) return { error: "Tu contraseña actual no es esa." };
  if (nueva !== repetida) return { error: "Las dos contraseñas nuevas no coinciden." };
  if (verificarClave(nueva, fila.clave_hash)) return { error: "La contraseña nueva tiene que ser distinta a la actual." };
  const problema = revisarClave(nueva);
  if (problema) return { error: problema };

  db.prepare("UPDATE usuarios SET clave_hash = ?, debe_cambiar = 0 WHERE id = ?").run(hashClave(nueva), u.id);
  await anotar({
    accion: "CAMBIO_CLAVE",
    descripcion: `${u.nombre} cambió su contraseña`,
    entidad: "USUARIO",
    entidadId: u.id,
  });

  // Fuera todas las sesiones —incluida esta— y adentro una limpia.
  cerrarSesionesDe(u.id);
  const token = (await import("crypto")).randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, datetime('now','localtime','+12 hours'))"
  ).run(token, u.id);
  const bolsa = await cookies();
  bolsa.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.APP_HTTPS === "1",
    maxAge: 60 * 60 * 12,
  });

  revalidatePath("/", "layout");
  return { mensaje: "Listo, tu contraseña quedó cambiada." };
}
