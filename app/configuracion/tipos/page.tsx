import Link from "next/link";
import { exigirPagina } from "../../../lib/guardia";
import { categorias, tiposDocumento } from "../../../lib/expedientes";
import { db } from "../../../lib/db";
import TiposDocumentoClient from "../../../components/TiposDocumentoClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaTipos() {
  await exigirPagina("exp.configurar");

  const tipos = tiposDocumento(false);
  const cats = categorias();

  // Cuántas veces se pide cada tipo y cuántos documentos hay cargados: sirve
  // para saber qué se puede desactivar sin dejar huecos.
  const enMatriz = new Map(
    (db.prepare("SELECT doc_tipo_id AS id, COUNT(*) AS c FROM matriz_reglas WHERE activo = 1 GROUP BY doc_tipo_id").all() as {
      id: number;
      c: number;
    }[]).map((r) => [r.id, r.c])
  );
  const cargados = new Map(
    (db.prepare("SELECT doc_tipo_id AS id, COUNT(*) AS c FROM documentos GROUP BY doc_tipo_id").all() as {
      id: number;
      c: number;
    }[]).map((r) => [r.id, r.c])
  );

  return (
    <>
      <PageHeader eyebrow="Configuración" title="Tipos de documento">
        <Link href="/configuracion" className="text-sm text-soft underline">
          Volver a configuración
        </Link>
      </PageHeader>

      <div className="mb-5 max-w-3xl rounded-lg border border-line bg-card p-5 text-sm text-ink">
        <p>
          Aquí se define <b>qué es</b> cada documento. Lo importante de cada uno es si es obligatorio, si vence y cada
          cuánto, y si hace falta que alguien lo valide: de eso depende que el expediente diga la verdad.
        </p>
        <p className="mt-2 text-soft">
          El catálogo arranca con los tipos del expediente de personal en México. La vigencia viene puesta solo en los
          que traen impresa su propia fecha de vencimiento (INE, pasaporte, licencias). En los que la empresa decide
          cada cuánto se renuevan —certificado médico, comprobante de domicilio, constancia fiscal— viene{" "}
          <b>sin vigencia</b> a propósito, para que tú pongas el plazo que de verdad usan en Sultana en vez de que el
          sistema invente uno.
        </p>
      </div>

      <TiposDocumentoClient
        tipos={tipos}
        categorias={cats}
        enMatriz={Object.fromEntries(enMatriz)}
        cargados={Object.fromEntries(cargados)}
      />
    </>
  );
}
