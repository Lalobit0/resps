import { db } from "../../lib/db";
import type { EmpleadoConEquipos } from "../../lib/types";
import EmpleadosClient from "../../components/EmpleadosClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaEmpleados() {
  const empleados = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id) AS equipos_asignados
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
