"use client";

import { useState, useTransition } from "react";
import { fechaCorta } from "../lib/helpers";
import { ETIQUETA_ESTADO_GAFETE, type EtapaGafete, type MovimientoGafete } from "../lib/gafetes-comun";
import { historialGafete } from "../app/gafetes/actions";
import { Badge, Card, btnGhost } from "./ui";

/**
 * Por dónde ha pasado una tarjeta.
 *
 * El gafete solo guarda a quién lo trae hoy, así que al reasignarlo se perdía
 * el dueño anterior. Esto contesta "¿quién abrió esa puerta en marzo?", que es
 * justo lo que pregunta una auditoría de accesos.
 */
export default function HistorialGafeteBtn({ id, numero, className }: { id: number; numero: string; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ movimientos: MovimientoGafete[]; duenos: EtapaGafete[] } | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const abrir = () => {
    setAbierto(true);
    setError("");
    iniciar(async () => {
      const r = await historialGafete(id);
      if (r.ok && r.datos) setDatos(r.datos);
      else setError(r.error ?? "No se pudo leer el histórico.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={abrir}
        title="Quién ha traído esta tarjeta y qué le ha pasado"
      >
        Historial
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-10 w-full max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">
                Histórico del gafete <span className="mono text-kraft-dark">{numero}</span>
              </h2>
              <button type="button" className={btnGhost} onClick={() => setAbierto(false)}>
                ✕ Cerrar
              </button>
            </div>

            {pendiente && !datos ? <p className="mt-4 text-sm text-soft">Buscando…</p> : null}
            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            {datos ? (
              <>
                <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-soft">Quién la ha traído</h3>
                {datos.duenos.length === 0 ? (
                  <p className="mt-1 text-sm text-soft">Nunca se le ha entregado a nadie.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {datos.duenos.map((d, i) => (
                      <li key={`${d.empleado_id}-${d.desde}`} className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-ink">{d.empleado}</span>
                        <span className="text-xs text-soft">
                          desde {fechaCorta(d.desde)} {d.hasta ? `hasta ${fechaCorta(d.hasta)}` : "— la trae ahora"}
                        </span>
                        {i === 0 && !d.hasta ? <Badge tono="verde">Actual</Badge> : null}
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-soft">Todo lo que le ha pasado</h3>
                {datos.movimientos.length === 0 ? (
                  <p className="mt-1 text-sm text-soft">Sin movimientos registrados.</p>
                ) : (
                  <ul className="mt-1">
                    {datos.movimientos.map((m) => (
                      <li key={m.id} className="flex gap-3 border-b border-line/60 py-2 last:border-0">
                        <span className="mono w-20 shrink-0 pt-0.5 text-xs text-soft">{fechaCorta(m.fecha)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tono={m.accion === "BAJA_EMPLEADO" ? "rojo" : "gris"}>{m.titulo}</Badge>
                            {m.empleado ? <span className="text-sm font-medium text-ink">{m.empleado}</span> : null}
                            {m.estado_antes && m.estado_despues && m.estado_antes !== m.estado_despues ? (
                              <span className="text-xs text-soft">
                                {ETIQUETA_ESTADO_GAFETE[m.estado_antes] ?? m.estado_antes} →{" "}
                                {ETIQUETA_ESTADO_GAFETE[m.estado_despues] ?? m.estado_despues}
                              </span>
                            ) : null}
                          </span>
                          {m.detalle ? <span className="mt-0.5 block text-xs text-soft">{m.detalle}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}
