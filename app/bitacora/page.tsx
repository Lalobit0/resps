import { db } from "../../lib/db";
import type { Bitacora } from "../../lib/types";
import { Badge, Card, Empty, PageHeader, tdCls, thCls } from "../../components/ui";
import RevertirBtn from "../../components/RevertirBtn";

export const dynamic = "force-dynamic";

const ETIQUETA_ACCION: Record<string, string> = {
  ELIMINAR_RESPONSIVA: "Eliminación de responsiva",
  REVERTIR_ELIMINACION: "Restauración de responsiva",
};

function responsivaDe(b: Bitacora): number | null {
  if (b.accion !== "ELIMINAR_RESPONSIVA" || !b.snapshot) return null;
  try {
    const s = JSON.parse(b.snapshot) as { responsivaId?: number };
    return s.responsivaId ?? null;
  } catch {
    return null;
  }
}

export default function PaginaBitacora() {
  const entradas = db.prepare("SELECT * FROM bitacora ORDER BY id DESC LIMIT 500").all() as Bitacora[];

  return (
    <>
      <PageHeader eyebrow="Auditoría" title="Bitácora de movimientos" />
      <p className="mb-5 max-w-2xl text-sm text-soft">
        Registro de acciones importantes (eliminaciones y restauraciones). Las eliminaciones de responsivas se pueden
        <b> revertir</b>: se restaura el documento y su equipo vuelve al inventario tal como estaba.
      </p>

      {entradas.length === 0 ? (
        <Empty>Aún no hay movimientos registrados.</Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[44%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Acción</th>
                <th className={thCls}>Detalle</th>
                <th className={thCls}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((b) => (
                <tr key={b.id} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} whitespace-nowrap text-xs text-soft`}>{b.fecha}</td>
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_ACCION[b.accion] ?? b.accion}</td>
                  <td className={tdCls}>{b.descripcion}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {responsivaDe(b) && !b.revertida ? (
                        <a href={`/api/pdf/${responsivaDe(b)}`} target="_blank" className="rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper">
                          Ver PDF
                        </a>
                      ) : null}
                      {b.revertible && !b.revertida ? (
                        <RevertirBtn id={b.id} />
                      ) : b.revertida ? (
                        <Badge tono="gris">Revertida</Badge>
                      ) : (
                        <span className="text-soft">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
