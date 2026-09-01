import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, cerrarSesionToken } from "../../lib/auth";
import { anotar } from "../../lib/bitacora";

/** Salir: se borra la sesión del servidor, no nada más la cookie del navegador. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_SESION)?.value;
  if (token) {
    await anotar({ accion: "SALIDA", descripcion: "Cerró su sesión", entidad: "USUARIO" });
    cerrarSesionToken(token);
  }
  const destino = new URL("/entrar", req.url);
  const res = NextResponse.redirect(destino);
  res.cookies.set(COOKIE_SESION, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
