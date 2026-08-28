import { db } from "../../lib/db";
import type { Empleado } from "../../lib/types";
import { conceptosVale } from "../../lib/vales";
import ValesClient, { type ValeEnLista } from "../../components/ValesClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

/**
 * Vales de descuento de nómina.
 *
 * Su propio apartado porque no siempre acompañan a una entrega de equipo: se
 * hacen por uniforme, credencial, herramienta o por el radio. El concepto y su
 * precio salen del catálogo de Recursos Humanos.
 */
export default async function PaginaVales({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const nuevo = typeof sp.nuevo === "string" ? sp.nuevo : "";
  // ?empleado=<id> abre el formulario con esa persona ya elegida.
  const empleadoPre = typeof sp.empleado === "string" && Number(sp.empleado) > 0 ? Number(sp.empleado) : null;

  const condiciones = ["r.clase = 'VALE'", "r.estado != 'ELIMINADA'"];
  const valores: string[] = [];
  if (q) {
    condiciones.push("(r.folio LIKE ? OR r.concepto LIKE ? OR em.nombre LIKE ? OR em.numero_empleado LIKE ?)");
    valores.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const vales = db
    .prepare(
      `SELECT r.id, r.folio, r.fecha, r.concepto, r.monto, r.pdf_path, r.pdf_firmado, r.origen,
              em.id AS empleado_id, em.numero_empleado, em.nombre, em.departamento,
              (SELECT o.folio FROM responsivas o WHERE o.id = r.responsiva_origen_id) AS origen_folio
       FROM responsivas r JOIN empleados em ON em.id = r.empleado_id
       WHERE ${condiciones.join(" AND ")}
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all(...valores) as ValeEnLista[];

  const total = (db.prepare("SELECT COUNT(*) AS c FROM responsivas WHERE clase='VALE' AND estado!='ELIMINADA'").get() as {
    c: number;
  }).c;
  const suma = (db
    .prepare("SELECT COALESCE(SUM(monto),0) AS s FROM responsivas WHERE clase='VALE' AND estado!='ELIMINADA'")
    .get() as { s: number }).s;

  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];

  return (
    <>
      <PageHeader eyebrow="Recursos Humanos" title="Vales de descuento">
        <span className="text-sm text-soft">
          {vales.length} de {total} vales
        </span>
      </PageHeader>

      <ValesClient
        vales={vales}
        empleados={empleados}
        conceptos={conceptosVale(false)}
        busqueda={q}
        nuevo={nuevo}
        empleadoPre={empleadoPre}
        suma={suma}
      />
    </>
  );
}
