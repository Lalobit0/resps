import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Nav from "../components/Nav";
import CampanaAvisos from "../components/CampanaAvisos";

export const metadata: Metadata = {
  title: "Control TI · Sultana Packaging",
  description: "Responsivas, inventario y mantenimiento de equipo de cómputo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="flutes shrink-0 bg-ink text-white md:sticky md:top-0 md:h-screen md:w-60">
            <div className="px-4 py-5 md:px-5 md:py-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sultana-logo-sidebar.png" alt="Sultana Packaging" className="w-40" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Control TI</p>
            </div>
            <Nav />
            <div className="mt-auto hidden px-5 pb-6 pt-8 text-[11px] text-white/40 md:block">
              Uso interno · v1.0
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
      </body>
    </html>
  );
}
