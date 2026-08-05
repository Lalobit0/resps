import { db } from "../../../lib/db";
import type { Empleado, Equipo } from "../../../lib/types";
import CargarResponsivaClient from "../../../components/CargarResponsivaClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaCargarResponsiva({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Se puede llegar desde la ficha del empleado con el equipo ya elegido.
  const empleadoInicial = typeof sp.empleado === "string" ? Number(sp.empleado) : null;
  const equipoInicial = typeof sp.equipo === "string" ? Number(sp.equipo) : null;

  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];
  // Normalmente solo se ofrecen los equipos libres, pero si vienes a cargar la
  // carta de un equipo ya entregado, ese también tiene que estar en la lista.
  const equipos = db
    .prepare("SELECT * FROM equipos WHERE estado = 'DISPONIBLE' OR id = ? ORDER BY tipo ASC, codigo ASC")
    .all(equipoInicial ?? -1) as Equipo[];

  return (
    <>
      <PageHeader eyebrow="Responsivas" title="Cargar responsiva firmada" />
      <CargarResponsivaClient
        empleados={empleados}
        equipos={equipos}
        empleadoInicial={Number.isFinite(empleadoInicial) ? empleadoInicial : null}
        equipoInicial={Number.isFinite(equipoInicial) ? equipoInicial : null}
      />
    </>
  );
}
