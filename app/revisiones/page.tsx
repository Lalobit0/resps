import { db } from "../../lib/db";
import type { Empleado } from "../../lib/types";
import { hoyISO } from "../../lib/helpers";
import { TIPOS_REVISION } from "../../lib/formatos/tipos";
import { listarRevisiones } from "../../lib/revisiones";
import RevisionesClient from "../../components/RevisionesClient";
import { PageHeader } from "../../components/ui";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

export default async function PaginaRevisiones() {
  await exigirPagina("ti.ver");
  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];

  return (
    <>
      <PageHeader eyebrow="Documentos de sistemas" title="Revisiones-IT" />
      <p className="mb-5 max-w-3xl text-sm text-soft">
        Aquí se registran las revisiones y de cada una sale su documento con los datos del usuario y de su equipo
        puestos por el sistema. No se llenan a mano ni se firman en papel: lo que respalda el formato es el registro,
        con su folio y su fecha.
      </p>
      <RevisionesClient
        tipos={TIPOS_REVISION}
        empleados={empleados}
        revisiones={listarRevisiones()}
        hoy={hoyISO()}
      />
    </>
  );
}
