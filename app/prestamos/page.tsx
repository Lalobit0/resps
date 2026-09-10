import { db } from "../../lib/db";
import type { Empleado } from "../../lib/types";
import { equiposPrestables, prestamos, resumenPrestamos } from "../../lib/prestamos";
import PrestamosClient from "../../components/PrestamosClient";
import { PageHeader } from "../../components/ui";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

/**
 * Pases de préstamo.
 *
 * Prestar no es entregar. Una responsiva dice "esto es tuyo mientras trabajes
 * aquí"; un préstamo dice "te lo llevas y lo traes el viernes". Antes eso no
 * tenía dónde anotarse: o se asignaba el equipo —y quedaba a nombre de
 * alguien que solo lo iba a tener dos días— o no se anotaba nada y el equipo
 * simplemente desaparecía del anaquel.
 */
export default async function PaginaPrestamos() {
  await exigirPagina("ti.ver");

  const lista = prestamos();
  const equipos = equiposPrestables();
  const resumen = resumenPrestamos();

  const empleados = db
    .prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre")
    .all() as Empleado[];

  return (
    <>
      <PageHeader eyebrow="Tecnología" title="Pases de préstamo">
        <span className="text-sm text-soft">
          {resumen.fuera} prestado(s) ahorita
          {resumen.vencidos ? ` · ${resumen.vencidos} vencido(s)` : ""}
          {resumen.hoy ? ` · ${resumen.hoy} se traen hoy` : ""}
          {resumen.sinFirmar ? ` · ${resumen.sinFirmar} sin firmar` : ""}
        </span>
      </PageHeader>

      <div className="mb-5 max-w-3xl rounded-lg border border-line bg-card p-5 text-sm text-ink">
        <p>
          Cuando un área necesita una laptop, un proyector o un cable por unos días, aquí se anota{" "}
          <b>quién se lo llevó y para cuándo lo trae</b>. El equipo sale del inventario como <b>Prestado</b>: no cambia
          de dueño, solo deja de estar en el anaquel.
        </p>
        <p className="mt-2 text-soft">
          Se puede prestar algo del inventario o <b>escribir a mano</b> lo que no esté dado de alta. El pase se imprime,
          se firma y se sube el escaneo, igual que las responsivas.
        </p>
      </div>

      <PrestamosClient lista={lista} empleados={empleados} equipos={equipos} />
    </>
  );
}
