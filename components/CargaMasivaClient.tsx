"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado } from "../lib/types";
import { ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { analizarLoteResponsivas, confirmarLoteResponsivas, type RenglonLote } from "../app/responsivas/actions";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { Badge, Card, btnGhost, btnPrimary, tdCls, thCls } from "./ui";

/**
 * Carga masiva: un PDF con muchas responsivas se separa en una por página, el
 * sistema propone de quién es cada una y aquí se revisa antes de guardar.
 * Lo que no pudo identificar se asigna a mano en la misma tabla.
 */
export default function CargaMasivaClient({ empleados }: { empleados: Empleado[] }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [renglones, setRenglones] = useState<RenglonLote[] | null>(null);
  /** Página abierta en el visor, para ver la carta mientras se asigna. */
  const [viendo, setViendo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();

  const analizar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!archivos.length) return;
    setError("");
    setMensaje("");
    setRenglones(null);
    setViendo(null);
    const fd = new FormData();
    for (const a of archivos) fd.append("archivo", a);
    iniciar(async () => {
      try {
        const res = await analizarLoteResponsivas(fd);
        if (res.ok && res.lote) setRenglones(res.lote.renglones);
        else setError(res.error ?? "No se pudo leer el PDF.");
      } catch {
        // Si el servidor corta la subida (archivo enorme) no hay respuesta que leer.
        setError(
          "No se pudo subir el archivo: pesa demasiado o se interrumpió el envío. " +
            "Divídelo en varios PDF más chicos y vuelve a intentar."
        );
      }
    });
  };

  const cambiarEmpleado = (clave: string, id: number | null) =>
    setRenglones((rs) =>
      rs
        ? rs.map((r) =>
            r.clave === clave
              ? {
                  ...r,
                  empleadoId: id,
                  empleadoTexto: id ? empleados.find((e) => e.id === id)?.nombre ?? "" : null,
                  comoSeIdentifico: id ? "elegido a mano" : "",
                  aviso: id ? "" : r.aviso,
                }
              : r
          )
        : rs
    );

  const guardar = () => {
    if (!renglones) return;
    const listos = renglones.filter((r) => r.responsivaId || r.empleadoId);
    if (!listos.length) {
      setError("Todavía no hay ninguna carta con empleado asignado.");
      return;
    }
    setError("");
    iniciar(async () => {
      try {
        const res = await confirmarLoteResponsivas(
          listos.map((r) => ({
            clave: r.clave,
            empleadoId: r.empleadoId,
            responsivaId: r.responsivaId,
            clase: r.clase,
            fecha: r.fecha,
            equipoIds: r.equipoIds,
          }))
        );
        if (res.ok) {
          setMensaje(res.mensaje ?? "Carga lista.");
          setRenglones(null);
          router.refresh();
        } else {
          setError(res.error ?? "No se pudo guardar.");
        }
      } catch {
        setError("Se interrumpió el guardado. Vuelve a subir el PDF e inténtalo de nuevo.");
      }
    });
  };

  const faltan = renglones?.filter((r) => !r.responsivaId && !r.empleadoId).length ?? 0;
  const indiceAbierta = renglones?.findIndex((r) => r.clave === viendo) ?? -1;
  const abierta = indiceAbierta >= 0 ? renglones?.[indiceAbierta] ?? null : null;
  /** Salta a otra carta sin cerrar el visor: así se revisan de corrido. */
  const irA = (i: number) => {
    if (renglones && i >= 0 && i < renglones.length) setViendo(renglones[i].clave);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-2 text-base font-bold text-ink">1. Sube el PDF con las responsivas</h2>
        <p className="mb-3 text-sm text-soft">
          Puede ser un solo PDF con muchas cartas (una por página) o varios archivos a la vez. El sistema lo separa,
          lee cada carta y te dice de quién es antes de guardar nada.
        </p>
        <button className={btnPrimary} disabled={pendiente} onClick={() => ref.current?.click()}>
          {pendiente && !renglones ? "Leyendo…" : "↥ Elegir PDF"}
        </button>
        <input ref={ref} type="file" accept=".pdf" multiple className="hidden" onChange={analizar} />
      </Card>

      {mensaje ? (
        <div className="whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {mensaje}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {renglones ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">2. Revisa y confirma</h2>
              <p className="mt-0.5 text-sm text-soft">
                Se encontraron <b>{renglones.length}</b> cartas.
                {faltan > 0 ? (
                  <>
                    {" "}
                    Faltan <b>{faltan}</b> por asignar a un empleado; las demás ya están listas.
                  </>
                ) : (
                  " Todas quedaron identificadas."
                )}
              </p>
            </div>
            <button className={btnPrimary} disabled={pendiente} onClick={guardar}>
              {pendiente ? "Guardando…" : "Guardar las identificadas"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className="border-b border-line bg-paper/70">
                <tr>
                  <th className={thCls}>Página</th>
                  <th className={thCls}>Qué se leyó</th>
                  <th className={thCls}>Empleado</th>
                  <th className={thCls}>Equipos</th>
                  <th className={thCls}>Ver</th>
                </tr>
              </thead>
              <tbody>
                {renglones.map((r) => (
                  <tr key={r.clave} className="border-b border-line/60 align-top last:border-0">
                    <td className={tdCls}>
                      <div className="text-sm font-semibold">Pág. {r.pagina}</div>
                      <div className="text-xs text-soft">{r.archivo}</div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap items-center gap-1">
                        {r.folio ? <span className="mono text-xs font-semibold text-kraft-dark">{r.folio}</span> : null}
                        <Badge tono="petrol">{ETIQUETA_CLASE[r.clase] ?? r.clase}</Badge>
                        {r.responsivaId ? <Badge tono="verde">Es la firma de esa carta</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-soft">
                        {r.fecha ? fechaCorta(r.fecha) : "sin fecha"}
                        {r.comoSeIdentifico ? ` · identificado por ${r.comoSeIdentifico}` : ""}
                      </div>
                    </td>
                    <td className={tdCls}>
                      {r.responsivaId ? (
                        <span className="text-sm">{r.empleadoTexto ?? "—"}</span>
                      ) : (
                        <div className="space-y-1">
                          {r.aviso ? <p className="text-xs text-amber-800">{r.aviso}</p> : null}
                          <div className="w-64">
                            <BuscadorEmpleado
                              empleados={empleados}
                              value={r.empleadoId}
                              onChange={(id) => cambiarEmpleado(r.clave, id)}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className={`${tdCls} mono text-xs`}>{r.equiposTexto ?? "—"}</td>
                    <td className={tdCls}>
                      <button className={btnGhost} onClick={() => setViendo(r.clave)}>
                        👁 Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-soft">
            Las que ya existen en el sistema se adjuntan como su documento firmado. Las demás se dan de alta como
            responsiva cargada del empleado que elijas. Las que dejes sin empleado no se guardan.
          </p>
        </Card>
      ) : null}

      {abierta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setViendo(null)}>
          <div
            className="flex h-[92vh] w-full max-w-6xl flex-col rounded-lg border border-line bg-white p-3 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">
                  Carta {indiceAbierta + 1} de {renglones?.length ?? 0}
                </p>
                <p className="text-xs text-soft">
                  {abierta.archivo} · pág. {abierta.pagina}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnGhost} disabled={indiceAbierta <= 0} onClick={() => irA(indiceAbierta - 1)}>
                  ← Anterior
                </button>
                <button
                  className={btnGhost}
                  disabled={!renglones || indiceAbierta >= renglones.length - 1}
                  onClick={() => irA(indiceAbierta + 1)}
                >
                  Siguiente →
                </button>
                <a href={`/api/lote/${encodeURIComponent(abierta.clave)}`} target="_blank" className={btnGhost}>
                  Abrir en pestaña ↗
                </a>
                <button className={btnGhost} onClick={() => setViendo(null)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* El empleado se elige aquí mismo, con la carta a la vista. */}
            <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper/60 px-3 py-2">
              {abierta.responsivaId ? (
                <p className="text-sm">
                  Es la firma de <span className="mono font-semibold">{abierta.folio}</span> — {abierta.empleadoTexto}
                </p>
              ) : (
                <>
                  <span className="text-sm font-semibold text-ink">Empleado:</span>
                  <div className="w-80">
                    <BuscadorEmpleado
                      empleados={empleados}
                      value={abierta.empleadoId}
                      onChange={(id) => cambiarEmpleado(abierta.clave, id)}
                    />
                  </div>
                  {abierta.empleadoId ? <span className="text-xs text-emerald-700">Asignada</span> : null}
                </>
              )}
            </div>

            <iframe
              title={`Carta ${abierta.pagina}`}
              src={`/api/lote/${encodeURIComponent(abierta.clave)}`}
              className="h-full w-full rounded-md border border-line bg-white"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
