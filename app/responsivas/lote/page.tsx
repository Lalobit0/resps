import Link from "next/link";
import { db } from "../../../lib/db";
import type { Empleado } from "../../../lib/types";
import { lotesGenerados, responsivasDeLote } from "../../../lib/pendientes";
import CargaMasivaClient, { type CartaDeLote } from "../../../components/CargaMasivaClient";
import { PageHeader, btnGhost, inputCls } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaCargaMasiva({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const loteElegido = typeof sp.lote === "string" ? sp.lote : "";

  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];
  const lotes = lotesGenerados();

  const cartas: CartaDeLote[] = loteElegido
    ? responsivasDeLote(loteElegido).map((r) => ({
        id: r.id,
        folio: r.folio,
        clase: r.clase,
        firmada: r.firmada,
        empleado: `${r.empleado_numero} ${r.empleado_nombre}`,
      }))
    : [];

  return (
    <>
      <PageHeader eyebrow="Responsivas" title="Carga masiva de responsivas">
        <Link href="/responsivas/generar" className={btnGhost}>
          Generar en lote
        </Link>
        <Link href="/responsivas/cargar" className={btnGhost}>
          Cargar una sola
        </Link>
      </PageHeader>

      {lotes.length ? (
        <form method="get" className="mb-5 flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper/60 px-4 py-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
              ¿Es el escaneo de un lote que generaste aquí?
            </label>
            <select name="lote" defaultValue={loteElegido} className={`${inputCls} max-w-sm`}>
              <option value="">No — es un PDF de responsivas viejas</option>
              {lotes.map((l) => (
                <option key={l.lote} value={l.lote}>
                  {l.lote} · {l.total} carta(s){l.sin_firma ? ` · faltan ${l.sin_firma}` : " · todas firmadas"}
                </option>
              ))}
            </select>
          </div>
          <button className={btnGhost} type="submit">
            Usar este lote
          </button>
          <p className="text-xs text-soft">
            Con el lote elegido, las páginas se reparten solas por el orden en que se imprimieron.
          </p>
        </form>
      ) : null}

      <CargaMasivaClient
        empleados={empleados}
        lote={loteElegido && cartas.length ? { nombre: loteElegido, cartas } : null}
      />
    </>
  );
}
