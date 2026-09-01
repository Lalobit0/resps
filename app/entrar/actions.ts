"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_SESION,
  agenteDeLaPeticion,
  iniciarSesion,
  ipDeLaPeticion,
} from "../../lib/auth";
import { anotar } from "../../lib/bitacora";

/** Solo rutas de esta misma aplicación: nadie manda a la gente fuera con ?volver=. */
function destinoSeguro(volver: string): string {
  if (!volver.startsWith("/") || volver.startsWith("//")) return "/";
  return volver;
}

export async function entrar(_prev: { error?: string } | null, datos: FormData) {
  const usuario = String(datos.get("usuario") ?? "");
  const clave = String(datos.get("clave") ?? "");
  const volver = destinoSeguro(String(datos.get("volver") ?? "/"));

  const res = iniciarSesion(usuario, clave, await ipDeLaPeticion(), await agenteDeLaPeticion());

  if (!res.ok) {
    await anotar({
      accion: "ACCESO_FALLIDO",
      descripcion: `Intento de acceso con el usuario "${usuario.trim().toLowerCase()}"`,
      entidad: "USUARIO",
      resultado: "DENEGADO",
    });
    return { error: res.error };
  }

  const bolsa = await cookies();
  bolsa.set(COOKIE_SESION, res.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // El servidor de la empresa corre en la red interna sin certificado; si
    // algún día se pone detrás de HTTPS, basta con la variable de entorno.
    secure: process.env.APP_HTTPS === "1",
    maxAge: 60 * 60 * 12,
  });

  await anotar({ accion: "ACCESO", descripcion: `Entró al sistema`, entidad: "USUARIO" });
  redirect(volver);
}
