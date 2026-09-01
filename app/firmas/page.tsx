import { db } from "../../lib/db";
import type { FirmaGuardada } from "../../lib/types";
import FirmasClient from "../../components/FirmasClient";
import { PageHeader } from "../../components/ui";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

export default async function PaginaFirmas() {
  await exigirPagina("config.administrar");
  const firmas = db
    .prepare("SELECT * FROM firmas WHERE activo = 1 ORDER BY rol ASC, nombre ASC")
    .all() as FirmaGuardada[];

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Firmas de la empresa" />
      <FirmasClient firmas={firmas} />
    </>
  );
}
