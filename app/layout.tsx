import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Nav from "../components/Nav";
import CampanaAvisos from "../components/CampanaAvisos";
import CambiarClave from "../components/CambiarClave";
import { usuarioActual } from "../lib/auth";
import { getConfig } from "../lib/db";

export const metadata: Metadata = {
  title: "Control Sultana",
  description: "Inventario de TI, responsivas y expedientes digitales de personal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  const nombreApp = getConfig("app_nombre", "Control Sultana");

  const marco = (contenido: React.ReactNode) => (
    <html lang="es">
      <body className="min-h-screen bg-paper text-ink antialiased">{contenido}</body>
    </html>
  );

  // Sin sesión solo se llega a la pantalla de acceso (del resto se encarga el
  // middleware), y esa pantalla se pinta sola, sin menú alrededor.
  if (!usuario) return marco(children);

  // Contraseña temporal: hasta que la cambie no ve nada del sistema. Es la
  // única forma de que la cuenta de primer arranque no se quede así para
  // siempre.
  if (usuario.debe_cambiar) {
    return marco(
      <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
          <h1 className="text-lg font-bold text-ink">Cambia tu contraseña</h1>
          <p className="mt-1 text-sm text-soft">
            Entraste con una contraseña temporal. Ponle una tuya para poder continuar.
          </p>
          <div className="mt-5">
            <CambiarClave />
          </div>
          <a href="/salir" className="mt-4 block text-center text-xs text-soft underline">
            Salir
          </a>
        </div>
      </div>
    );
  }

  return marco(
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flutes shrink-0 bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col">
        <div className="px-4 py-5 md:px-5 md:py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sultana-logo-sidebar.png" alt="Sultana Packaging" className="w-40" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{nombreApp}</p>
        </div>
        <Nav permisos={usuario.todo ? "todo" : [...usuario.permisos]} />
        <div className="mt-auto px-4 pb-5 pt-6 md:px-5">
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-white">{usuario.nombre}</p>
            <p className="truncate text-[11px] text-white/50">{usuario.rol_nombre}</p>
            <div className="mt-2 flex gap-3 text-[11px]">
              <a href="/cuenta" className="text-white/70 underline hover:text-white">
                Mi cuenta
              </a>
              <a href="/salir" className="text-white/70 underline hover:text-white">
                Salir
              </a>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-10">
        {/* La campana vive arriba a la derecha, sobre el contenido. */}
        <div className="mb-2 flex justify-end">
          <Suspense fallback={null}>
            <CampanaAvisos />
          </Suspense>
        </div>
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
