import Link from "next/link";
import { db } from "../lib/db";
import type { MantenimientoConEquipo, ResponsivaLista } from "../lib/types";
import { diasPara, dinero, fechaCorta } from "../lib/helpers";
import { ETIQUETA_TIPO, TIPOS_EQUIPO } from "../lib/constants";
import { totalSinResponsiva } from "../lib/pendientes";
import { Badge, Card, Empty, PageHeader, btnGhost, btnPrimary } from "../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaInicio() {
  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(estado = 'DISPONIBLE'), 0) AS disponibles,
         COALESCE(SUM(estado = 'ASIGNADO'), 0) AS asignados,
         COALESCE(SUM(estado = 'MANTENIMIENTO'), 0) AS mantenimiento
       FROM equipos WHERE estado != 'BAJA'`
    )
    .get() as { total: number; disponibles: number; asignados: number; mantenimiento: number };

  const emp = db
    .prepare("SELECT COALESCE(SUM(activo = 1), 0) AS activos, COUNT(*) AS total FROM empleados")
    .get() as { activos: number; total: number };

  const porTipoRows = db
    .prepare("SELECT tipo, COUNT(*) AS c FROM equipos WHERE estado != 'BAJA' GROUP BY tipo")
    .all() as { tipo: string; c: number }[];
  const porTipo: Record<string, number> = {};
  for (const r of porTipoRows) porTipo[r.tipo] = r.c;

  const lineas = db
    .prepare(
      "SELECT json_extract(detalles,'$.plan_precio') AS precio FROM equipos WHERE tipo='CELULAR' AND estado != 'BAJA'"
    )
    .all() as { precio: string | null }[];
  const costoLineas = lineas.reduce((s, l) => s + (Number((l.precio ?? "").replace(/[^\d.]/g, "")) || 0), 0);

  const faltanResponsiva = totalSinResponsiva();

  const vigentes = (db
    .prepare("SELECT COUNT(*) AS c FROM responsivas WHERE tipo='ASIGNACION' AND estado='VIGENTE'")
    .get() as { c: number }).c;

  const pendientes = db
    .prepare(
      `SELECT m.*, e.codigo AS equipo_codigo, (e.marca || ' ' || e.modelo) AS equipo_desc, e.categoria AS equipo_categoria
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
       WHERE m.estado = 'PROGRAMADO' AND m.fecha_programada <= date('now', '+30 day')
       ORDER BY m.fecha_programada ASC
       LIMIT 8`
    )
    .all() as MantenimientoConEquipo[];

  const recientes = db
    .prepare(
      `SELECT r.*, em.nombre AS empleado_nombre,
         (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r JOIN empleados em ON em.id = r.empleado_id
       WHERE r.estado != 'ELIMINADA'
       ORDER BY r.id DESC LIMIT 6`
    )
    .all() as ResponsivaLista[];

  const tarjetas = [
    { titulo: "Empleados activos", valor: emp.activos, sub: `de ${emp.total}`, href: "/empleados" },
    { titulo: "Equipos activos", valor: stats.total, sub: "en servicio", href: "/inventario" },
    { titulo: "Asignados", valor: stats.asignados, sub: "en uso", href: "/inventario?estado=ASIGNADO" },
    { titulo: "Disponibles", valor: stats.disponibles, sub: "libres", href: "/inventario?estado=DISPONIBLE" },
  ];

  const tipos = TIPOS_EQUIPO.map((t) => ({
    tipo: t,
    etiqueta: ETIQUETA_TIPO[t] ?? t,
    valor: porTipo[t] ?? 0,
    href: t === "CELULAR" ? "/lineas" : `/inventario?tipo=${t}`,
  }));

  return (
    <>
      <PageHeader eyebrow="Panel general" title="Control TI">
        <Link href="/responsivas/nueva" className={btnPrimary}>
          + Nueva responsiva
        </Link>
      </PageHeader>

      {faltanResponsiva > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <span>
            📄 <b>{faltanResponsiva}</b> equipo(s) entregados <b>sin carta responsiva</b>. Genéralas todas juntas e
            imprime el paquete para recoger las firmas.
          </span>
          <span className="flex flex-wrap gap-2">
            <Link href="/responsivas/generar" className={btnPrimary}>
              ✎ Generar en lote
            </Link>
            <Link href="/inventario?sinresp=1" className={btnGhost}>
              Ver cuáles
            </Link>
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link key={t.titulo} href={t.href}>
            <Card className="transition-colors hover:border-kraft/60">
              <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{t.titulo}</p>
              <p className="mt-1 text-3xl font-bold text-ink">{t.valor}</p>
              <p className="text-xs text-soft">{t.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-soft">Equipos por tipo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tipos.map((t) => (
              <Link key={t.tipo} href={t.href} className="rounded-md border border-line bg-white px-3 py-2 hover:border-kraft/60">
                <p className="text-2xl font-bold text-ink">{t.valor}</p>
                <p className="text-xs text-soft">{t.etiqueta}</p>
              </Link>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link href="/inventario?estado=MANTENIMIENTO">
            <Card className="transition-colors hover:border-kraft/60">
              <p className="text-[11px] font-bold uppercase tracking-wide text-soft">En mantenimiento</p>
              <p className="mt-1 text-2xl font-bold text-ink">{stats.mantenimiento}</p>
            </Card>
          </Link>
          <Link href="/lineas">
            <Card className="transition-colors hover:border-kraft/60">
              <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Costo líneas / mes</p>
              <p className="mt-1 text-2xl font-bold text-ink">{dinero(costoLineas)}</p>
            </Card>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Mantenimientos por atender</h2>
            <Link href="/mantenimientos" className={btnGhost}>
              Ver todos
            </Link>
          </div>
          {pendientes.length === 0 ? (
            <Empty>Sin mantenimientos programados en los próximos 30 días.</Empty>
          ) : (
            <ul className="space-y-2">
              {pendientes.map((m) => {
                const dias = diasPara(m.fecha_programada);
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 rounded-md border border-line bg-white px-3 py-2.5">
                    <div>
                      <p className="text-sm">
                        <span className="mono text-xs font-semibold text-kraft-dark">{m.equipo_codigo}</span>{" "}
                        <span className="font-medium">{m.equipo_desc}</span>
                      </p>
                      <p className="text-xs text-soft">
                        {m.descripcion} · {fechaCorta(m.fecha_programada)}
                      </p>
                    </div>
                    {dias < 0 ? (
                      <Badge tono="rojo">Vencido</Badge>
                    ) : dias <= 7 ? (
                      <Badge tono="ambar">En {dias} día(s)</Badge>
                    ) : (
                      <Badge tono="petrol">Próximo</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">
              Responsivas recientes <span className="text-sm font-normal text-soft">({vigentes} vigentes)</span>
            </h2>
            <Link href="/responsivas" className={btnGhost}>
              Ver repositorio
            </Link>
          </div>
          {recientes.length === 0 ? (
            <Empty>Aún no se genera ninguna responsiva.</Empty>
          ) : (
            <ul className="space-y-2">
              {recientes.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-line bg-white px-3 py-2.5">
                  <div>
                    <p className="text-sm">
                      <span className="mono text-xs font-semibold">{r.folio}</span>{" "}
                      <span className="font-medium">{r.empleado_nombre}</span>
                    </p>
                    <p className="mono text-xs text-soft">{r.equipos ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.tipo === "ASIGNACION" ? <Badge tono="petrol">Asignación</Badge> : <Badge tono="kraft">Devolución</Badge>}
                    {r.pdf_path ? (
                      <a href={`/api/pdf/${r.id}`} target="_blank" className={btnGhost}>
                        PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
