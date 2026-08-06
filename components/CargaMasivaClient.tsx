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
    const fd = new FormData();
    for (const a of archivos) fd.append("archivo", a);
    iniciar(async () => {
      const res = await analizarLoteResponsivas(fd);
      if (res.ok && res.lote) setRenglones(res.lote.renglones);
      else setError(res.error ?? "No se pudo leer el PDF.");
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
    });
  };

  const faltan = renglones?.filter((r) => !r.responsivaId && !r.empleadoId).length ?? 0;

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
                      <a href={`/api/lote/${encodeURIComponent(r.clave)}`} target="_blank" className={btnGhost}>
                        Ver página
                      </a>
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
    </div>
  );
}
