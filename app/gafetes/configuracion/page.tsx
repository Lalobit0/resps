import Link from "next/link";
import { exigirPagina } from "../../../lib/guardia";
import { perfiles, puertas } from "../../../lib/gafetes";
import ConfigGafetesClient from "../../../components/ConfigGafetesClient";
import { PageHeader, btnGhost } from "../../../components/ui";

export const dynamic = "force-dynamic";

/** Las puertas del edificio y los perfiles que las agrupan. */
export default async function PaginaConfigGafetes() {
  await exigirPagina("gafetes.editar");

  return (
    <>
      <PageHeader eyebrow="Matriz de gafetes" title="Puertas y perfiles">
        <Link href="/gafetes" className={btnGhost}>
          ← Volver a la matriz
        </Link>
      </PageHeader>

      <div className="mb-5 max-w-3xl rounded-lg border border-line bg-card p-5 text-sm text-ink">
        <p>
          Un <b>perfil</b> es un grupo de puertas con nombre: en vez de marcar cinco casillas a cada quien, se le pone
          la letra. Al asignar un gafete el perfil prende sus puertas, y de ahí se pueden ajustar.
        </p>
        <p className="mt-2 text-soft">
          Cambiar un perfil <b>no</b> toca los gafetes que ya lo tienen. Lo que abre una tarjeta que ya está en la
          calle se cambia en el lector, así que aquí se ajusta uno por uno y a propósito.
        </p>
      </div>

      <ConfigGafetesClient puertas={puertas()} perfiles={perfiles()} />
    </>
  );
}
