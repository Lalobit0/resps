import Link from "next/link";
import { db, getConfig } from "../lib/db";
import type { MantenimientoConEquipo, ResponsivaLista } from "../lib/types";
import { diasPara, dinero, fechaCorta } from "../lib/helpers";
import { ETIQUETA_TIPO, TIPOS_EQUIPO } from "../lib/constants";
import { puede, usuarioActual } from "../lib/auth";
import { calcularCumplimiento, requisitosDe, sincronizarTodos } from "../lib/expedientes";
import { Badge, Card, Empty, PageHeader, btnGhost, btnPrimary } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * El panel de inicio.
 *
 * Cada quien ve lo suyo: quien lleva RH entra a los expedientes y no a un
 * tablero de inventario que no le toca, y al revés. Cuando alguien tiene las
 * dos cosas —como sistemas— ve las dos, con RH arriba porque es lo que tiene
 * fechas encima.
 */
export default async function PaginaInicio() {
  const u = await usuarioActual();
  const verTi = puede(u, "ti.ver");
  const verExp = puede(u, "exp.ver");
  const nombreApp = getConfig("app_nombre", "Control Sultana");

  const emp = db
    .prepare("SELECT COALESCE(SUM(activo = 1), 0) AS activos, COUNT(*) AS total FROM empleados")
    .get() as { activos: number; total: number };

  return (
    <>
      <PageHeader eyebrow="Panel general" title={nombreApp}>
        {verTi ? (
          <Link href="/responsivas/nueva" className={btnPrimary}>
            + Nueva responsiva
          </Link>
        ) : null}
      </PageHeader>

      {verExp ? <PanelExpedientes /> : null}
      {verTi ? <PanelTecnologia empleadosActivos={emp.activos} empleadosTotal={emp.total} /> : null}

      {!verTi && !verExp ? (
        <Empty>
          Tu cuenta todavía no tiene acceso a ningún apartado. Pídele a quien administra los usuarios que te asigne un
          rol.
        </Empty>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------- expedientes RH

async function PanelExpedientes() {
  const reglas = (db.prepare("SELECT COUNT(*) AS c FROM matriz_reglas WHERE activo = 1").get() as { c: number }).c;

  // Los requisitos de cada quien, al día, antes de sacar números.
  sincronizarTodos();

  const empleados = db.prepare("SELECT id, nombre, numero_empleado, departamento FROM empleados WHERE activo = 1").all() as {
    id: number;
    nombre: string;
    numero_empleado: string;
    departamento: string;
  }[];

  const conCumplimiento = empleados.map((e) => ({ ...e, c: calcularCumplimiento(requisitosDe(e.id)) }));
  const total = conCumplimiento.length;
  const completos = conCumplimiento.filter((e) => e.c.nivel === "COMPLETO").length;
  const criticos = conCumplimiento.filter((e) => e.c.nivel === "CRITICO");
  const suma = (campo: "faltantes" | "vencidos" | "porVencer" | "porValidar" | "rechazados") =>
    conCumplimiento.reduce((s, e) => s + e.c[campo], 0);

  const promedio = total
    ? Math.round(conCumplimiento.reduce((s, e) => s + e.c.porcentaje, 0) / total)
    : 100;

  if (reglas === 0) {
    return (
      <Card className="mb-6 border-amber-300 bg-amber-50">
        <h2 className="font-bold text-amber-900">Expedientes digitales: falta decir qué se le pide a quién</h2>
        <p className="mt-2 max-w-3xl text-sm text-amber-900">
          El módulo ya está listo y el catálogo documental viene cargado, pero la matriz de requisitos está vacía.
          Mientras siga así, el sistema no le pide ningún documento a nadie.
        </p>
        <Link
          href="/configuracion/matriz"
          className="mt-4 inline-flex rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
        >
          Configurar la matriz
        </Link>
      </Card>
    );
  }

  const tarjetas: { titulo: string; valor: number | string; sub: string; href: string; tono?: string }[] = [
    { titulo: "Cumplimiento", valor: `${promedio}%`, sub: "promedio del personal", href: "/expedientes" },
    { titulo: "Completos", valor: completos, sub: `de ${total} expedientes`, href: "/expedientes" },
    { titulo: "Por validar", valor: suma("porValidar"), sub: "documentos", href: "/expedientes", tono: "text-amber-700" },
    { titulo: "Vencidos", valor: suma("vencidos"), sub: "documentos", href: "/expedientes", tono: "text-red-700" },
  ];

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Expedientes de personal</h2>
        <Link href="/expedientes" className={btnGhost}>
          Ver todos
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link key={t.titulo} href={t.href}>
            <Card className="transition-colors hover:border-kraft/60">
              <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{t.titulo}</p>
              <p className={`mt-1 text-3xl font-bold ${t.tono ?? "text-ink"}`}>{t.valor}</p>
              <p className="text-xs text-soft">{t.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      {criticos.length > 0 ? (
        <Card className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-ink">
              Requiere atención <span className="text-sm font-normal text-soft">({criticos.length} en rojo)</span>
            </h3>
          </div>
          <ul className="space-y-2">
            {criticos.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 rounded-md border border-line bg-white px-3 py-2.5">
                <div>
                  <Link href={`/expedientes/${e.id}`} className="text-sm font-medium text-ink hover:underline">
                    {e.nombre}
                  </Link>
                  <p className="text-xs text-soft">
                    {e.numero_empleado} · {e.departamento}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {e.c.vencidos ? <Badge tono="rojo">{e.c.vencidos} vencidos</Badge> : null}
                  {e.c.criticosPendientes ? <Badge tono="rojo">{e.c.criticosPendientes} críticos</Badge> : null}
                  <span className="text-sm font-semibold tabular-nums text-soft">{e.c.porcentaje}%</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

// -------------------------------------------------------------- inventario TI

async function PanelTecnologia({
  empleadosActivos,
  empleadosTotal,
}: {
  empleadosActivos: number;
  empleadosTotal: number;
}) {
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
    { titulo: "Empleados activos", valor: empleadosActivos, sub: `de ${empleadosTotal}`, href: "/empleados" },
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
    <section>
      <h2 className="mb-3 text-base font-bold text-ink">Inventario y responsivas</h2>

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
            <h3 className="text-base font-bold text-ink">Mantenimientos por atender</h3>
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
            <h3 className="text-base font-bold text-ink">
              Responsivas recientes <span className="text-sm font-normal text-soft">({vigentes} vigentes)</span>
            </h3>
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
    </section>
  );
}
