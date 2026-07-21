"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/empleados", etiqueta: "Empleados" },
  { href: "/inventario", etiqueta: "Inventario" },
  { href: "/lineas", etiqueta: "Líneas telefónicas" },
  { href: "/responsivas", etiqueta: "Responsivas" },
  { href: "/mantenimientos", etiqueta: "Mantenimientos" },
  { href: "/plantillas", etiqueta: "Plantillas y datos" },
  { href: "/respaldos", etiqueta: "Respaldos" },
];

export default function Nav() {
  const pathname = usePathname();

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-4">
      <Link
        href="/responsivas/nueva"
        className="mb-0 mr-2 inline-flex shrink-0 items-center justify-center rounded-md bg-brand-red px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-red-dark md:mb-4 md:mr-0"
      >
        + Nueva responsiva
      </Link>
      <form action="/buscar" method="get" className="mr-2 shrink-0 md:mb-3 md:mr-0">
        <input
          name="q"
          placeholder="🔍 Buscar IMEI, serie, empleado…"
          className="w-44 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/40 md:w-full"
        />
      </form>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`shrink-0 rounded-md border-l-[3px] px-3 py-2 text-sm font-medium transition-colors ${
            activo(l.href)
              ? "border-brand-red bg-white/10 text-white"
              : "border-transparent text-white/65 hover:bg-white/5 hover:text-white"
          }`}
        >
          {l.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
