import Link from "next/link";
import { exigirPagina } from "../../../lib/guardia";
import {
  equiposDeImportacion,
  importacion,
  importaciones,
  omitidosDe,
  ultimaImportacion,
} from "../../../lib/importaciones";
import ImportacionesClient from "../../../components/ImportacionesClient";
import { Empty, PageHeader, btnGhost } from "../../../components/ui";

export const dynamic = "force-dynamic";

/**
 * Lo que se subió por Excel.
 *
 * Después de importar sesenta renglones no hay manera de acordarse de cuáles
 * eran entre ciento sesenta y cinco equipos, y el resumen se va de la pantalla
 * en cuanto se recarga. Aquí queda la carga completa, con lo que le falta a
 * cada equipo y los renglones que no entraron.
 */
export default async function PaginaImportaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("ti.ver");
  const sp = await searchParams;
  const pedido = typeof sp.id === "string" ? Number(sp.id) : 0;

  const lista = importaciones();
  const elegida = (pedido ? importacion(pedido) : null) ?? ultimaImportacion();

  if (!elegida) {
    return (
      <>
        <PageHeader eyebrow="Activos de TI" title="Lo que subí">
          <Link href="/inventario" className={btnGhost}>
            ← Volver al inventario
          </Link>
        </PageHeader>
        <Empty>
          Todavía no se ha importado ningún Excel. En cuanto subas uno, aquí queda la carga completa para revisar qué
          le falta a cada equipo.
        </Empty>
      </>
    );
  }

  const equipos = equiposDeImportacion(elegida.id);

  return (
    <>
      <PageHeader eyebrow="Activos de TI" title="Lo que subí">
        <Link href="/inventario" className={btnGhost}>
          ← Volver al inventario
        </Link>
      </PageHeader>

      <ImportacionesClient
        lista={lista}
        elegida={elegida}
        equipos={equipos}
        omitidos={omitidosDe(elegida)}
      />
    </>
  );
}
