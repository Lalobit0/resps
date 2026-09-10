"use client";

import { useMemo } from "react";
import type { Bitacora } from "../lib/types";
import { Badge, Card, Empty, tdCls } from "./ui";
import RevertirBtn from "./RevertirBtn";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";

/** Un movimiento, con lo que la consulta añade al registro base. */
export type MovimientoBitacora = Bitacora & {
  usuario: string | null;
  ip: string | null;
  entidad: string | null;
  entidad_id: number | null;
  antes: string | null;
  despues: string | null;
  resultado: string;
};

/** La responsiva que se borró en este movimiento, si la hubo. */
function responsivaDe(b: MovimientoBitacora): number | null {
  if (b.accion !== "ELIMINAR_RESPONSIVA" || !b.snapshot) return null;
  try {
    const s = JSON.parse(b.snapshot) as { responsivaId?: number };
    return s.responsivaId ?? null;
  } catch {
    return null;
  }
}

/** La bitácora: quién hizo qué y cuándo, con sus columnas ajustables. */
export default function BitacoraClient({
  entradas,
  etiquetaAccion,
}: {
  entradas: MovimientoBitacora[];
  /** Cómo se lee cada acción; el catálogo vive en la página. */
  etiquetaAccion: Record<string, string>;
}) {
  const columnas = useMemo<Columna<MovimientoBitacora>[]>(
    () => [
      {
        clave: "fecha",
        titulo: "Fecha",
        ancho: "12%",
        valor: (b) => b.fecha,
        claseCelda: `${tdCls} whitespace-nowrap text-xs text-soft`,
      },
      {
        clave: "quien",
        titulo: "Quién",
        ancho: "12%",
        valor: (b) => b.usuario ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (b) => (
          <>
            <span className="text-ink">{b.usuario ?? "—"}</span>
            {b.ip ? <div className="text-soft">{b.ip}</div> : null}
          </>
        ),
      },
      {
        clave: "accion",
        titulo: "Acción",
        ancho: "16%",
        valor: (b) => etiquetaAccion[b.accion] ?? b.accion,
        claseCelda: `${tdCls} text-xs`,
        celda: (b) => (
          <>
            {etiquetaAccion[b.accion] ?? b.accion}
            {b.entidad ? <div className="text-soft">{b.entidad.toLowerCase()}</div> : null}
          </>
        ),
      },
      {
        clave: "detalle",
        titulo: "Detalle",
        ancho: "45%",
        valor: (b) => b.descripcion,
        claseCelda: tdCls,
        celda: (b) => (
          <>
            {b.descripcion}
            {b.antes || b.despues ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-soft">Ver qué cambió</summary>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
                  {b.antes ? (
                    <pre className="overflow-x-auto rounded bg-paper p-2 text-[11px] text-soft">antes: {b.antes}</pre>
                  ) : null}
                  {b.despues ? (
                    <pre className="overflow-x-auto rounded bg-paper p-2 text-[11px] text-soft">
                      después: {b.despues}
                    </pre>
                  ) : null}
                </div>
              </details>
            ) : null}
          </>
        ),
      },
      {
        clave: "estado",
        titulo: "Estado",
        ancho: "15%",
        valor: (b) =>
          b.resultado === "DENEGADO" ? "Rechazado" : b.revertida ? "Revertida" : b.revertible ? "Se puede revertir" : "",
        claseCelda: tdCls,
        celda: (b) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {b.resultado === "DENEGADO" ? <Badge tono="rojo">Rechazado</Badge> : null}
            {responsivaDe(b) && !b.revertida ? (
              <a
                href={`/api/pdf/${responsivaDe(b)}`}
                target="_blank"
                className="rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper"
              >
                Ver PDF
              </a>
            ) : null}
            {b.revertible && !b.revertida ? (
              <RevertirBtn id={b.id} />
            ) : b.revertida ? (
              <Badge tono="gris">Revertida</Badge>
            ) : b.resultado === "DENEGADO" ? null : (
              <span className="text-soft">—</span>
            )}
          </div>
        ),
      },
    ],
    [etiquetaAccion]
  );

  const tabla = useTabla({ id: "bitacora", columnas, filas: entradas });

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {tabla.filas.length} de {entradas.length} movimientos · haz clic en el título de una columna para ordenarla y
          filtrarla.
        </p>
        <AvisoTabla estado={tabla} />
      </div>
      <Card className="p-0">
        <Tabla
          estado={tabla}
          claveFila={(b) => b.id}
          claseFila={() => "align-top"}
          minAncho={1000}
          vacio={<Empty>No hay movimientos que coincidan con eso.</Empty>}
        />
      </Card>
    </>
  );
}
