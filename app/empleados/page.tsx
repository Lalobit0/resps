import { db } from "../../lib/db";
import type { EmpleadoConEquipos } from "../../lib/types";
import EmpleadosClient from "../../components/EmpleadosClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaEmpleados() {
  const empleados = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id) AS equipos_asignados,
         (SELECT COUNT(*) FROM equipos q2
            WHERE q2.asignado_a = e.id AND q2.estado = 'ASIGNADO'
              AND NOT EXISTS (
                SELECT 1 FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                WHERE ri.equipo_id = q2.id AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'
                  AND r.empleado_id = e.id)) AS sin_responsiva
       FROM empleados e
       ORDER BY CAST(e.numero_empleado AS INTEGER) ASC, e.numero_empleado ASC`
    )
    .all() as EmpleadoConEquipos[];

  return (
    <>
      <PageHeader eyebrow="Base de datos" title="Empleados" />
      <EmpleadosClient empleados={empleados} />
    </>
  );
}
