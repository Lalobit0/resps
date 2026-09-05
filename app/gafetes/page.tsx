import { exigirPagina } from "../../lib/guardia";
import { db } from "../../lib/db";
import { gafetes, perfiles, puertas, resumenGafetes } from "../../lib/gafetes";
import GafetesClient from "../../components/GafetesClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

/**
 * Matriz de gafetes de acceso (FRH-14).
 *
 * El control de accesos vive en la consola del lector de tarjetas, que no
 * habla con nadie. Esto es la constancia de a quién se le dio qué puerta, y
 * lo que el Excel no podía hacer: cruzarla con la plantilla, para que un
 * gafete no siga abriendo cuando su dueño ya se fue.
 */
export default async function PaginaGafetes() {
  await exigirPagina("gafetes.ver");

  const lista = gafetes();
  const listaPuertas = puertas();
  const listaPerfiles = perfiles();
  const resumen = resumenGafetes();

  const personas = db
    .prepare(
      `SELECT id, numero_empleado, nombre, puesto, departamento FROM empleados
       WHERE activo = 1 ORDER BY nombre`
    )
    .all() as { id: number; numero_empleado: string; nombre: string; puesto: string | null; departamento: string | null }[];

  return (
    <>
      <PageHeader eyebrow="Recursos Humanos" title="Matriz de gafetes de acceso">
        <span className="text-sm text-soft">
          {resumen.total} gafetes · {resumen.activos} activos
          {resumen.porRecoger ? ` · ${resumen.porRecoger} por recoger` : ""}
          {resumen.sinEmpleado ? ` · ${resumen.sinEmpleado} sin asignar` : ""}
        </span>
      </PageHeader>

      <div className="mb-5 max-w-3xl rounded-lg border border-line bg-card p-5 text-sm text-ink">
        <p>
          Aquí se registra <b>a quién se le dio qué gafete y qué puertas abre</b>. El perfil propone las puertas y se
          pueden ajustar: en el formato de papel hay gafetes que abren una de más, y eso también es un hecho que
          conviene tener anotado.
        </p>
        <p className="mt-2 text-soft">
          Lo que el Excel no podía hacer es cruzarlo con la plantilla: cuando alguien se da de baja, su gafete queda
          marcado <b>por recoger</b> en vez de quedarse activo en silencio.
        </p>
      </div>

      <GafetesClient lista={lista} puertas={listaPuertas} perfiles={listaPerfiles} personas={personas} />
    </>
  );
}
