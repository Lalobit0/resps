"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { darDeBajaEmpleado, resumenBajaEmpleado, type ResumenBaja } from "../app/empleados/actions";
import { ETIQUETA_TIPO } from "../lib/constants";
import { Badge, Label, btnDanger, btnGhost, inputCls } from "./ui";

const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Baja del empleado: deja la empresa y sus equipos vuelven al inventario.
 *
 * Se marca lo que sí entregó —eso queda disponible para reasignar, conservando
 * el área a la que pertenecía— y lo que no, que se queda a su nombre y aparece
 * en el aviso, para que no se pierda de vista que falta recuperarlo.
 */
export default function DarDeBajaBtn({
  empleadoId,
  nombre,
  className,
}: {
  empleadoId: number;
  nombre: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resumen, setResumen] = useState<ResumenBaja | null>(null);
  const [recibidos, setRecibidos] = useState<Set<number>>(new Set());
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const abrir = () => {
    setAbierto(true);
    setError("");
    setResumen(null);
    setFecha(hoyISO());
    setMotivo("");
    iniciar(async () => {
      const r = await resumenBajaEmpleado(empleadoId);
      if (!r) {
        setError("El empleado ya no existe.");
        return;
      }
      setResumen(r);
      // De entrada se asume que entregó todo: es lo normal y así solo se
      // desmarca la excepción.
      setRecibidos(new Set(r.equipos.map((e) => e.id)));
    });
  };

  const alternar = (id: number) =>
    setRecibidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const confirmar = () => {
    if (!resumen) return;
    const faltan = resumen.equipos.filter((e) => !recibidos.has(e.id));
    if (
      !confirm(
        `Se va a dar de baja a ${nombre} con fecha ${fecha}.\n\n` +
          `${recibidos.size} equipo(s) vuelven al inventario como disponibles y sus cartas quedan cerradas.\n` +
          `${faltan.length ? `⚠️ ${faltan.length} equipo(s) siguen a su nombre: ${faltan.map((e) => e.codigo).join(", ")}.\n` : ""}` +
          `\n¿Continuar?`
      )
    )
      return;
    setError("");
    iniciar(async () => {
      const res = await darDeBajaEmpleado({ id: empleadoId, fecha, motivo, recibidos: [...recibidos] });
      if (res.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(res.error ?? "No se pudo dar de baja.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={abrir}
        title="El empleado deja la empresa: recibir sus equipos y desactivarlo"
      >
        ⛔ Dar de baja
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-6 w-full max-w-3xl rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Dar de baja a {nombre}</h2>
                <p className="mt-0.5 text-sm text-soft">
                  Queda inactivo y lo que entregue vuelve al inventario como <b>disponible</b>, conservando el área a la
                  que pertenece el equipo. Nada se borra: su histórico y sus cartas se quedan como están.
                </p>
              </div>
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            {!resumen ? (
              <p className="text-sm text-soft">Revisando qué tiene a su nombre…</p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Fecha de baja</Label>
                    <input
                      type="date"
                      className={inputCls}
                      max={hoyISO()}
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      disabled={pendiente}
                    />
                  </div>
                  <div>
                    <Label>Motivo (opcional)</Label>
                    <input
                      className={inputCls}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Renuncia, fin de contrato…"
                      disabled={pendiente}
                    />
                  </div>
                </div>

                {resumen.equipos.length === 0 ? (
                  <p className="rounded-md border border-dashed border-line bg-paper/60 px-4 py-6 text-center text-sm text-soft">
                    No tiene equipos a su nombre. Solo queda marcarlo como inactivo.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-sm font-semibold text-ink">
                      ¿Qué entregó? Desmarca lo que no haya devuelto.
                    </p>
                    <div className="overflow-hidden rounded-md border border-line">
                      {resumen.equipos.map((e) => {
                        const marcado = recibidos.has(e.id);
                        return (
                          <label
                            key={e.id}
                            className={`flex cursor-pointer items-start gap-3 border-b border-line/60 px-3 py-2 last:border-0 ${
                              marcado ? "bg-white" : "bg-amber-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-kraft"
                              checked={marcado}
                              onChange={() => alternar(e.id)}
                              disabled={pendiente}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="mono text-sm font-bold text-kraft-dark">{e.codigo}</span>
                                <span className="text-sm text-ink">
                                  {e.marca} {e.modelo}
                                </span>
                                <Badge tono="gris">{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</Badge>
                                {e.area ? <Badge tono="petrol">{e.area}</Badge> : null}
                              </span>
                              <span className="mt-0.5 block text-xs text-soft">
                                {marcado ? (
                                  <>Vuelve al inventario como disponible{e.area ? ` en ${e.area}` : ""}.</>
                                ) : (
                                  <b className="text-amber-800">Se queda a su nombre: no lo entregó.</b>
                                )}
                                {e.folios ? ` · Carta ${e.folios}` : " · Sin carta vigente"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {resumen.cartas.length ? (
                      <p className="mt-2 text-xs text-soft">
                        Las cartas de los equipos que reciba quedan <b>cerradas</b>; el PDF firmado se conserva.
                      </p>
                    ) : null}
                  </>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={btnDanger} onClick={confirmar} disabled={pendiente}>
                    {pendiente ? "Dando de baja…" : "Dar de baja y recibir equipos"}
                  </button>
                  <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
