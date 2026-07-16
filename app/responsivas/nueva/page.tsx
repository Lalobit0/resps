import { db, getConfig } from "../../../lib/db";
import type { Empleado, Equipo } from "../../../lib/types";
import NuevaResponsivaClient from "../../../components/NuevaResponsivaClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaNuevaResponsiva() {
  const empleados = db
    .prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC")
    .all() as Empleado[];
  const equipos = db
    .prepare("SELECT * FROM equipos WHERE estado = 'DISPONIBLE' ORDER BY codigo ASC")
    .all() as Equipo[];

  return (
    <>
      <PageHeader eyebrow="Asignación de equipo" title="Nueva carta responsiva" />
      <NuevaResponsivaClient
        empleados={empleados}
        equipos={equipos}
        entregaDefault={getConfig("entrega_default", "Departamento de TI")}
      />
    </>
  );
}
