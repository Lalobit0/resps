import Link from "next/link";
import { db } from "../../../../lib/db";
import type { ItemConEquipo, Responsiva } from "../../../../lib/types";
import DevolucionClient from "../../../../components/DevolucionClient";
import { Empty, PageHeader, btnGhost } from "../../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaDevolucion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const responsiva = db.prepare("SELECT * FROM responsivas WHERE id = ?").get(Number(id)) as Responsiva | undefined;

  if (!responsiva || responsiva.tipo !== "ASIGNACION" || responsiva.estado !== "VIGENTE") {
    return (
      <>
        <PageHeader eyebrow="Devolución de equipo" title="Responsiva no disponible" />
        <Empty>
          Esta responsiva no existe o ya fue cerrada.
          <div className="mt-4">
            <Link href="/responsivas" className={btnGhost}>
              Volver al repositorio
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  const empleado = db.prepare("SELECT nombre FROM empleados WHERE id = ?").get(responsiva.empleado_id) as {
    nombre: string;
  };
  const items = db
    .prepare(
      `SELECT ri.*, e.codigo, e.categoria, e.numero_serie, e.estado AS estado_equipo
       FROM responsiva_items ri JOIN equipos e ON e.id = ri.equipo_id
       WHERE ri.responsiva_id = ?`
    )
    .all(responsiva.id) as ItemConEquipo[];

  return (
    <>
      <PageHeader eyebrow="Devolución de equipo" title={`Devolución de ${responsiva.folio}`} />
      <DevolucionClient responsiva={responsiva} empleadoNombre={empleado.nombre} items={items} />
    </>
  );
}
