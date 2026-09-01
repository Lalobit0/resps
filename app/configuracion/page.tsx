import Link from "next/link";
import { db } from "../../lib/db";
import { puede } from "../../lib/auth";
import { exigirPaginaAlguno } from "../../lib/guardia";
import { Card, PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

/**
 * El índice de la configuración.
 *
 * Además de llevar a cada apartado, dice en qué estado está cada cosa: sin esto
 * es fácil configurar treinta tipos de documento y no darse cuenta de que la
 * matriz sigue vacía y por eso el sistema no le pide nada a nadie.
 */
export default async function PaginaConfiguracion() {
  const u = await exigirPaginaAlguno("exp.configurar", "usuarios.administrar", "config.administrar");

  const cuenta = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  const tipos = cuenta("SELECT COUNT(*) AS c FROM doc_tipos WHERE activo = 1");
  const categorias = cuenta("SELECT COUNT(*) AS c FROM doc_categorias WHERE activo = 1");
  const reglas = cuenta("SELECT COUNT(*) AS c FROM matriz_reglas WHERE activo = 1");
  const usuarios = cuenta("SELECT COUNT(*) AS c FROM usuarios WHERE activo = 1");
  const roles = cuenta("SELECT COUNT(*) AS c FROM roles WHERE activo = 1");
  const expedientes = cuenta("SELECT COUNT(*) AS c FROM expedientes");

  const apartados = [
    {
      href: "/configuracion/tipos",
      titulo: "Tipos de documento",
      texto: "Qué documentos existen, cuáles vencen y cada cuánto, quién los valida y quién puede verlos.",
      dato: `${tipos} tipos en ${categorias} categorías`,
      permiso: "exp.configurar",
    },
    {
      href: "/configuracion/matriz",
      titulo: "Matriz de requisitos",
      texto: "A quién se le pide cada documento: a todos, a un departamento o a un puesto.",
      dato: reglas ? `${reglas} reglas activas` : "Sin reglas todavía",
      alerta: reglas === 0,
      permiso: "exp.configurar",
    },
    {
      href: "/configuracion/usuarios",
      titulo: "Usuarios y roles",
      texto: "Quién entra al sistema y qué puede hacer cada quien.",
      dato: `${usuarios} personas · ${roles} roles`,
      permiso: "usuarios.administrar",
    },
    {
      href: "/plantillas",
      titulo: "Plantillas y datos de la empresa",
      texto: "Textos de las cartas responsivas, datos fiscales y nombre del sistema.",
      dato: "Cartas, vales y encabezados",
      permiso: "config.administrar",
    },
  ].filter((a) => puede(u, a.permiso));

  return (
    <>
      <PageHeader eyebrow="Administración" title="Configuración">
        <span className="text-sm text-soft">{expedientes} expedientes abiertos</span>
      </PageHeader>

      {reglas === 0 && puede(u, "exp.configurar") ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-900">El sistema todavía no le pide documentos a nadie</h2>
          <p className="mt-2 max-w-3xl text-sm text-amber-900">
            El catálogo ya trae {tipos} tipos de documento listos, pero la <b>matriz de requisitos</b> está vacía, y es
            ella la que decide a quién se le pide cada cosa. Mientras siga así, todos los expedientes aparecen al 100%
            porque no se les está pidiendo nada.
          </p>
          <Link
            href="/configuracion/matriz"
            className="mt-4 inline-flex rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
          >
            Definir qué se le pide a quién
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {apartados.map((a) => (
          <Link key={a.href} href={a.href} className="group block">
            <Card className="h-full transition-colors group-hover:border-kraft">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold text-ink group-hover:text-kraft-dark">{a.titulo}</h2>
                <span aria-hidden className="text-soft transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm text-soft">{a.texto}</p>
              <p className={`mt-3 text-xs font-semibold ${a.alerta ? "text-brand-red" : "text-soft"}`}>{a.dato}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
