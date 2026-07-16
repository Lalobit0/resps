import { db, getConfig } from "../../lib/db";
import type { Plantilla } from "../../lib/types";
import PlantillasClient from "../../components/PlantillasClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaPlantillas() {
  const plantillas = db.prepare("SELECT * FROM plantillas ORDER BY id ASC").all() as Plantilla[];

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Plantillas y datos de la empresa" />
      <PlantillasClient
        plantillas={plantillas}
        config={{
          empresa: getConfig("empresa"),
          ciudad: getConfig("ciudad"),
          entrega_default: getConfig("entrega_default"),
        }}
      />
    </>
  );
}
