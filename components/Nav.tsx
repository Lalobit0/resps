"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/empleados", etiqueta: "Empleados" },
  { href: "/inventario", etiqueta: "Inventario" },
  { href: "/responsivas", etiqueta: "Responsivas" },
  { href: "/mantenimientos", etiqueta: "Mantenimientos" },
  { href: "/plantillas", etiqueta: "Plantillas y datos" },
];

export default function Nav() {
  const pathname = usePathname();

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-4">
      <Link
        href="/responsivas/nueva"
        className="mb-0 mr-2 inline-flex shrink-0 items-center justify-center rounded-md bg-kraft px-3 py-2 text-sm font-semibold text-white hover:bg-kraft-dark md:mb-4 md:mr-0"
      >
        + Nueva responsiva
      </Link>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            activo(l.href)
              ? "bg-white/10 text-white"
              : "text-white/65 hover:bg-white/5 hover:text-white"
          }`}
        >
          {l.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
