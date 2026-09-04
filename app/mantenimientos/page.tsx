import Link from "next/link";
import { db } from "../../lib/db";
import type { MantenimientoConEquipo } from "../../lib/types";
import MantenimientosClient, { type EquipoOpcion } from "../../components/MantenimientosClient";
import { PageHeader, btnGhost, inputCls } from "../../components/ui";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

export default async function PaginaMantenimientos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("ti.ver");
  const sp = await searchParams;
  const equipoId = typeof sp.equipo === "string" ? Number(sp.equipo) : 0;
  const estado = typeof sp.estado === "string" ? sp.estado : "";

  const condiciones: string[] = [];
  const valores: (string | number)[] = [];
  if (equipoId) {
    condiciones.push("m.equipo_id = ?");
    valores.push(equipoId);
  }
  if (estado) {
    condiciones.push("m.estado = ?");
    valores.push(estado);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const mantenimientos = db
    .prepare(
      `SELECT m.*, e.codigo AS equipo_codigo, (e.marca || ' ' || e.modelo) AS equipo_desc, e.categoria AS equipo_categoria
       FROM mantenimientos m
       JOIN equipos e ON e.id = m.equipo_id
       ${where}
       ORDER BY CASE m.estado WHEN 'PROGRAMADO' THEN 0 ELSE 1 END, m.fecha_programada ASC, m.id DESC`
    )
    .all(...valores) as MantenimientoConEquipo[];

  // Los mantenimientos son de las computadoras. Se cuelan los equipos de otro
  // tipo que ya tengan uno registrado, porque si no, esos no se podrían editar.
  // Va también quién los trae, que es como RH y sistemas los identifican: se
  // pide el mantenimiento de "la compu de Ricardo", no la de la serie tal.
  const equipos = db
    .prepare(
      `SELECT e.id, e.codigo, e.marca, e.modelo, e.estado, e.tipo, e.numero_serie, e.area,
              em.nombre AS empleado, em.numero_empleado, em.departamento
       FROM equipos e
       LEFT JOIN empleados em ON em.id = e.asignado_a
       WHERE e.estado != 'BAJA'
         AND (e.tipo = 'COMPUTO' OR e.id IN (SELECT equipo_id FROM mantenimientos))
       ORDER BY e.codigo ASC`
    )
    .all() as EquipoOpcion[];

  const equipoFiltrado = equipoId ? equipos.find((e) => e.id === equipoId) : undefined;

  return (
    <>
      <PageHeader eyebrow="Control de mantenimiento" title="Mantenimientos">
        {equipoFiltrado ? (
          <Link href="/mantenimientos" className={btnGhost}>
            Quitar filtro: {equipoFiltrado.codigo} ✕
          </Link>
        ) : null}
      </PageHeader>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        {equipoId ? <input type="hidden" name="equipo" value={equipoId} /> : null}
        <select name="estado" defaultValue={estado} className={`${inputCls} max-w-[190px]`}>
          <option value="">Todos los estados</option>
          <option value="PROGRAMADO">Programados</option>
          <option value="COMPLETADO">Completados</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
        <button type="submit" className={btnGhost}>
          Filtrar
        </button>
      </form>

      <MantenimientosClient mantenimientos={mantenimientos} equipos={equipos} />
    </>
  );
}
