"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * El menú enseña únicamente lo que la persona puede abrir.
 *
 * Esconder un renglón no es seguridad —cada pantalla y cada acción vuelven a
 * revisar el permiso en el servidor—, pero sí es respeto: un validador de RH no
 * tiene por qué ver seis apartados de inventario que no le tocan.
 */

type Enlace = { href: string; etiqueta: string; permiso?: string };
type Seccion = { titulo?: string; enlaces: Enlace[] };

const SECCIONES: Seccion[] = [
  { enlaces: [{ href: "/", etiqueta: "Inicio" }] },
  {
    titulo: "Recursos Humanos",
    enlaces: [
      { href: "/expedientes", etiqueta: "Expedientes", permiso: "exp.ver" },
      { href: "/empleados", etiqueta: "Personal", permiso: "empleados.ver" },
      { href: "/empleados/bajas", etiqueta: "Bajas", permiso: "empleados.ver" },
      { href: "/gafetes", etiqueta: "Gafetes de acceso", permiso: "gafetes.ver" },
      { href: "/vales", etiqueta: "Vales de descuento", permiso: "ti.ver" },
    ],
  },
  {
    titulo: "Tecnología",
    enlaces: [
      { href: "/inventario", etiqueta: "Inventario", permiso: "ti.ver" },
      { href: "/lineas", etiqueta: "Líneas telefónicas", permiso: "ti.ver" },
      { href: "/responsivas", etiqueta: "Responsivas", permiso: "ti.ver" },
      { href: "/mantenimientos", etiqueta: "Mantenimientos", permiso: "ti.ver" },
      { href: "/revisiones", etiqueta: "Revisiones-IT", permiso: "ti.ver" },
    ],
  },
  {
    titulo: "Administración",
    enlaces: [
      { href: "/configuracion", etiqueta: "Configuración", permiso: "exp.configurar" },
      { href: "/configuracion/usuarios", etiqueta: "Usuarios y roles", permiso: "usuarios.administrar" },
      { href: "/bitacora", etiqueta: "Bitácora", permiso: "auditoria.ver" },
      { href: "/plantillas", etiqueta: "Plantillas y datos", permiso: "config.administrar" },
      { href: "/respaldos", etiqueta: "Respaldos", permiso: "config.administrar" },
    ],
  },
];

export default function Nav({ permisos }: { permisos: "todo" | string[] }) {
  const pathname = usePathname();
  const puede = (p?: string) => !p || permisos === "todo" || permisos.includes(p);

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const secciones = SECCIONES.map((s) => ({ ...s, enlaces: s.enlaces.filter((e) => puede(e.permiso)) })).filter(
    (s) => s.enlaces.length > 0
  );

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-4">
      {puede("ti.editar") ? (
        <Link
          href="/responsivas/nueva"
          className="mb-0 mr-2 inline-flex shrink-0 items-center justify-center rounded-md bg-brand-red px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-red-dark md:mb-4 md:mr-0"
        >
          + Nueva responsiva
        </Link>
      ) : null}

      <form action="/buscar" method="get" className="mr-2 shrink-0 md:mb-3 md:mr-0">
        <input
          name="q"
          placeholder="🔍 Empleado, serie, IMEI, equipo…"
          className="w-44 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/40 md:w-full"
        />
      </form>

      {secciones.map((seccion, i) => (
        <div key={seccion.titulo ?? i} className="contents md:block">
          {seccion.titulo ? (
            <p className="mt-4 hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 md:block">
              {seccion.titulo}
            </p>
          ) : null}
          {seccion.enlaces.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`block shrink-0 rounded-md border-l-[3px] px-3 py-2 text-sm font-medium transition-colors ${
                activo(l.href)
                  ? "border-brand-red bg-white/10 text-white"
                  : "border-transparent text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {l.etiqueta}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
