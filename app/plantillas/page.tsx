import { db, getConfig } from "../../lib/db";
import { ETIQ_EMPLEADO, ETIQ_RH, ETIQ_SISTEMAS } from "../../lib/constants";
import type { Plantilla } from "../../lib/types";
import PlantillasClient from "../../components/PlantillasClient";
import { PageHeader } from "../../components/ui";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

export default async function PaginaPlantillas() {
  await exigirPagina("config.administrar");
  const plantillas = db.prepare("SELECT * FROM plantillas ORDER BY id ASC").all() as Plantilla[];

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Plantillas y datos de la empresa" />
      <PlantillasClient
        plantillas={plantillas}
        config={{
          app_nombre: getConfig("app_nombre", "Control Sultana"),
          empresa: getConfig("empresa"),
          ciudad: getConfig("ciudad"),
          entrega_default: getConfig("entrega_default"),
          direccion: getConfig("direccion"),
          firma_empleado: getConfig("firma_empleado", ETIQ_EMPLEADO),
          firma_sistemas: getConfig("firma_sistemas", ETIQ_SISTEMAS),
          firma_rh: getConfig("firma_rh", ETIQ_RH),
        }}
      />
    </>
  );
}
