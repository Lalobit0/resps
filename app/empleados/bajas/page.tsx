import Link from "next/link";
import { exigirPagina } from "../../../lib/guardia";
import { db } from "../../../lib/db";
import { ausentesPendientes, bajas } from "../../../lib/bajas";
import BajasClient from "../../../components/BajasClient";
import { PageHeader, btnGhost } from "../../../components/ui";
import { fechaCorta } from "../../../lib/helpers";

export const dynamic = "force-dynamic";

/**
 * Bajas de personal.
 *
 * El Excel de Recursos Humanos trae a los que siguen trabajando y nada más:
 * quien se fue simplemente deja de aparecer. Aquí salen esos, para revisarlos
 * antes de darlos por idos, y debajo los que ya se cerraron con lo que quedó
 * pendiente de cada uno —el equipo que no entregó, el vale que sigue vivo—.
 */
export default async function PaginaBajas() {
  await exigirPagina("empleados.ver");

  // La última carga de plantilla es la que manda: si se subió una más nueva,
  // los ausentes de la anterior ya no son la foto de hoy.
  const carga = db
    .prepare("SELECT id, fecha, archivo FROM importaciones WHERE tipo = 'EMPLEADOS' ORDER BY id DESC LIMIT 1")
    .get() as { id: number; fecha: string; archivo: string | null } | undefined;

  const pendientes = carga ? ausentesPendientes(carga.id) : [];
  const historial = bajas();

  return (
    <>
      <PageHeader eyebrow="Base de datos" title="Bajas de personal">
        <Link href="/empleados" className={btnGhost}>
          ← Volver a empleados
        </Link>
      </PageHeader>

      <BajasClient
        pendientes={pendientes}
        historial={historial}
        cargaFecha={carga ? fechaCorta(carga.fecha.slice(0, 10)) : null}
        cargaArchivo={carga?.archivo ?? null}
      />
    </>
  );
}
