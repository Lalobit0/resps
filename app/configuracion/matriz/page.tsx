import Link from "next/link";
import { exigirPagina } from "../../../lib/guardia";
import { db } from "../../../lib/db";
import { reglasMatriz, tiposDocumento } from "../../../lib/expedientes";
import MatrizClient from "../../../components/MatrizClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

/** Los valores que de verdad existen en la plantilla, para no escribirlos a mano. */
function valoresDe(columna: string): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT ${columna} AS v FROM empleados
         WHERE activo = 1 AND ${columna} IS NOT NULL AND TRIM(${columna}) != ''
         ORDER BY v`
      )
      .all() as { v: string }[]
  ).map((r) => r.v);
}

export default async function PaginaMatriz() {
  await exigirPagina("exp.configurar");

  const reglas = reglasMatriz();
  const tipos = tiposDocumento(true);

  const opciones = {
    DEPARTAMENTO: valoresDe("departamento"),
    AREA: valoresDe("area"),
    PUESTO: valoresDe("puesto"),
    CLASE: valoresDe("clase"),
  };

  const plantilla = (db.prepare("SELECT COUNT(*) AS c FROM empleados WHERE activo = 1").get() as { c: number }).c;

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Matriz de requisitos">
        <Link href="/configuracion" className="text-sm text-soft underline">
          Volver a configuración
        </Link>
      </PageHeader>

      <div className="mb-5 max-w-3xl rounded-lg border border-line bg-card p-5 text-sm text-ink">
        <p>
          Aquí se decide <b>a quién se le pide cada documento</b>. Las reglas se suman: si a todo el personal se le pide
          INE y a Producción además certificado médico, quien esté en Producción necesita los dos.
        </p>
        <p className="mt-2 text-soft">
          Los departamentos, áreas y puestos que aparecen en las listas salen de las {plantilla} personas activas que
          ya están capturadas, no de un catálogo aparte.
        </p>
      </div>

      <MatrizClient reglas={reglas} tipos={tipos} opciones={opciones} />
    </>
  );
}
