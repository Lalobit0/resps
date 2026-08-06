import Link from "next/link";
import { equiposSinResponsivaParaGenerar, lotesGenerados } from "../../../lib/pendientes";
import { hoyISO } from "../../../lib/helpers";
import GenerarLoteClient from "../../../components/GenerarLoteClient";
import { PageHeader, btnGhost } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaGenerarLote() {
  const equipos = equiposSinResponsivaParaGenerar();
  const lotes = lotesGenerados();

  return (
    <>
      <PageHeader eyebrow="Responsivas" title="Generar responsivas en lote">
        <Link href="/responsivas/nueva" className={btnGhost}>
          Hacer una sola
        </Link>
        <Link href="/responsivas/lote" className={btnGhost}>
          Subir firmadas
        </Link>
      </PageHeader>

      <p className="mb-5 max-w-3xl text-sm text-soft">
        Aquí está todo el equipo ya entregado que no tiene carta. Marca por sección o uno por uno, genera las cartas de
        un tirón y baja el PDF para imprimirlo. Quedan registradas como <b>pendientes de firma</b>: cuando regreses con
        las hojas firmadas, súbelas escaneadas y el sistema las reparte a cada empleado.
      </p>

      <GenerarLoteClient equipos={equipos} lotes={lotes} hoy={hoyISO()} />
    </>
  );
}
