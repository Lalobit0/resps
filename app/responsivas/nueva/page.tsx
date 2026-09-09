import { db } from "../../../lib/db";
import type { Empleado, Equipo, FirmaGuardada } from "../../../lib/types";
import NuevaResponsivaClient from "../../../components/NuevaResponsivaClient";
import { conceptosVale } from "../../../lib/vales";
import { PageHeader } from "../../../components/ui";
import { exigirPagina } from "../../../lib/guardia";
import { CLASES_CARTA } from "../../../lib/constants";

export const dynamic = "force-dynamic";

export default async function PaginaNuevaResponsiva({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("ti.editar");
  const sp = await searchParams;
  const equipoParam = typeof sp.equipo === "string" ? Number(sp.equipo) : NaN;
  const empleadoParam = typeof sp.empleado === "string" ? Number(sp.empleado) : NaN;
  // Para llegar desde la ficha del empleado con la carta ya escogida: la de
  // Wi-Fi no cuelga de ningún equipo, así que se pide por su clase.
  const claseParam = typeof sp.clase === "string" ? sp.clase.toUpperCase() : "";
  const empleados = db
    .prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC")
    .all() as Empleado[];
  const equipos = db
    .prepare("SELECT * FROM equipos WHERE estado = 'DISPONIBLE' ORDER BY tipo ASC, codigo ASC")
    .all() as Equipo[];

  // Equipo que llega desde "+ Responsiva" del inventario: ya está entregado y
  // solo le falta la carta, así que se agrega a la lista aunque no esté libre.
  let precargado: { equipoId: number | null; empleadoId: number | null; clase?: string } | null = null;
  if (Number.isFinite(equipoParam)) {
    const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoParam) as Equipo | undefined;
    if (eq) {
      if (!equipos.some((e) => e.id === eq.id)) equipos.unshift(eq);
      precargado = { equipoId: eq.id, empleadoId: eq.asignado_a };
    }
  } else if (Number.isFinite(empleadoParam) || claseParam) {
    const valida = CLASES_CARTA.includes(claseParam as (typeof CLASES_CARTA)[number]);
    precargado = {
      equipoId: null,
      empleadoId: empleados.some((e) => e.id === empleadoParam) ? empleadoParam : null,
      clase: valida ? claseParam : undefined,
    };
  }

  const firmas = db
    .prepare("SELECT * FROM firmas WHERE activo = 1 ORDER BY rol ASC, nombre ASC")
    .all() as FirmaGuardada[];

  return (
    <>
      <PageHeader eyebrow="Asignación" title="Nueva carta responsiva" />
      <NuevaResponsivaClient empleados={empleados} equipos={equipos} firmas={firmas}
      conceptos={conceptosVale()} precargado={precargado} />
    </>
  );
}
