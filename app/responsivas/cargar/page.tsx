import { db } from "../../../lib/db";
import type { Empleado, Equipo } from "../../../lib/types";
import CargarResponsivaClient from "../../../components/CargarResponsivaClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaCargarResponsiva() {
  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];
  const equipos = db
    .prepare("SELECT * FROM equipos WHERE estado = 'DISPONIBLE' ORDER BY tipo ASC, codigo ASC")
    .all() as Equipo[];

  return (
    <>
      <PageHeader eyebrow="Responsivas" title="Cargar responsiva firmada" />
      <CargarResponsivaClient empleados={empleados} equipos={equipos} />
    </>
  );
}
