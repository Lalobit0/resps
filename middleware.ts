import { NextResponse, type NextRequest } from "next/server";

/**
 * Primer filtro: sin cookie de sesión no se llega a ninguna pantalla.
 *
 * Aquí solo se mira que la cookie exista, porque este código corre antes de
 * tocar la base de datos. La comprobación de verdad —que el token siga vivo y
 * que la persona tenga permiso— se hace en el servidor, en cada pantalla y en
 * cada acción. Este filtro es para no renderizar de más, no es la cerradura.
 */

const COOKIE = "sesion";

// Lo único que se puede ver sin haber entrado.
const ABIERTO = ["/entrar", "/salir"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (ABIERTO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();

  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  // Para regresar a donde iba en cuanto entre.
  if (pathname !== "/") destino.searchParams.set("volver", pathname + req.nextUrl.search);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: [
    // Todo menos los archivos estáticos y el logotipo de la pantalla de acceso.
    "/((?!_next/static|_next/image|favicon.ico|sultana-logo-sidebar.png|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
