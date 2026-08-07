"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cartasHermanas,
  equiposParaResponsiva,
  ligarEquiposAResponsiva,
  unirResponsivas,
  type CartaHermana,
  type EquipoDeCarta,
} from "../app/responsivas/actions";
import { ETIQUETA_CLASE, ETIQUETA_TIPO } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { Badge, btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Arregla una carta ya guardada sin tener que borrarla y capturarla de nuevo:
 * ligarle el equipo que le faltaba, o decir que en realidad era el escaneo
 * firmado de otra carta que seguía esperando (y así deshacer un duplicado).
 */
export default function CorregirResponsivaBtn({
  id,
  folio,
  tipo,
  className,
}: {
  id: number;
  folio: string;
  tipo: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [equipos, setEquipos] = useState<EquipoDeCarta[]>([]);
  const [empleado, setEmpleado] = useState("");
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [candidatas, setCandidatas] = useState<CartaHermana[]>([]);
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();

  // Las devoluciones no se tocan: heredan lo de su carta original.
  if (tipo !== "ASIGNACION") return null;

  const abrir = () => {
    setAbierto(true);
    setError("");
    setMensaje("");
    iniciar(async () => {
      const [eq, cand] = await Promise.all([equiposParaResponsiva(id), cartasHermanas(id)]);
      if (eq.ok && eq.equipos) {
        setEquipos(eq.equipos);
        setEmpleado(eq.empleado ?? "");
        setElegidos(new Set(eq.equipos.filter((e) => e.ligado).map((e) => e.id)));
      } else setError(eq.error ?? "No se pudo abrir.");
      if (cand.ok) setCandidatas(cand.candidatas ?? []);
    });
  };

  const alternar = (equipoId: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(equipoId)) s.delete(equipoId);
      else s.add(equipoId);
      return s;
    });

  const guardarEquipos = () => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await ligarEquiposAResponsiva(id, [...elegidos]);
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else setError(res.error ?? "No se pudo guardar.");
    });
  };

  /**
   * Une las dos en una sola. `conservarEsta` decide qué folio sobrevive: en la
   * que se queda terminan la firma y los equipos de las dos.
   */
  const unir = (otra: CartaHermana, conservarEsta: boolean) => {
    const queda = conservarEsta ? folio : otra.folio;
    const sobra = conservarEsta ? otra.folio : folio;
    if (
      !confirm(
        `Quedará una sola carta: ${queda}.\n\n` +
          `Se le pasa la firma y los equipos de ${sobra}, y ${sobra} se va a la papelera ` +
          `(queda en la bitácora, se puede revertir).\n\n¿Continuar?`
      )
    )
      return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = conservarEsta ? await unirResponsivas(id, otra.id) : await unirResponsivas(otra.id, id);
      if (res.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(res.error ?? "No se pudieron unir.");
    });
  };

  const visibles = equipos.filter((e) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return [e.codigo, e.marca, e.modelo, e.numero_serie].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <>
      <button type="button" className={className ?? btnGhost} onClick={abrir} title="Ligarle su equipo o corregir a qué carta pertenece">
        Corregir
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-6 w-full max-w-3xl rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">
                  Corregir <span className="mono text-kraft-dark">{folio}</span>
                </h2>
                {empleado ? <p className="mt-0.5 text-sm text-soft">{empleado}</p> : null}
              </div>
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}
            {mensaje ? (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {mensaje}
              </div>
            ) : null}

            {/* 1. Equipos que ampara la carta */}
            <div className="rounded-md border border-line p-3">
              <h3 className="text-sm font-bold text-ink">Equipos que ampara esta carta</h3>
              <p className="mt-0.5 text-xs text-soft">
                Marca los que entrega esta responsiva. Los que marques quedan asignados al empleado en el inventario;
                los que quites vuelven a estar disponibles.
              </p>
              <input
                className={`${inputCls} mt-2`}
                placeholder="Filtrar por código, marca, modelo o serie…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {pendiente && !equipos.length ? <p className="text-sm text-soft">Cargando…</p> : null}
                {!pendiente && !equipos.length ? (
                  <p className="text-sm text-soft">No hay equipos disponibles ni asignados a este empleado.</p>
                ) : null}
                {visibles.map((e) => (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 ${
                      elegidos.has(e.id) ? "border-emerald-300 bg-emerald-50" : "border-line bg-white hover:bg-paper/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-kraft"
                      checked={elegidos.has(e.id)}
                      onChange={() => alternar(e.id)}
                    />
                    <span className="text-sm">
                      <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                      <span className="font-medium">
                        {e.marca} {e.modelo}
                      </span>
                      <span className="block text-xs text-soft">
                        {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                        {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                      </span>
                      {e.deOtro ? (
                        <span className="mt-0.5 block text-[11px] text-red-700">Entregado a {e.deOtro}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              <button className={`${btnPrimary} mt-3`} onClick={guardarEquipos} disabled={pendiente}>
                {pendiente ? "Guardando…" : `Guardar los ${elegidos.size} equipo(s)`}
              </button>
            </div>

            {/* 2. Reasignar el documento a la carta que sí lo esperaba */}
            {candidatas.length ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
                <h3 className="text-sm font-bold text-amber-900">¿Alguna de estas es la misma entrega?</h3>
                <p className="mt-0.5 text-xs text-amber-900">
                  Pasa cuando el escaneo se dio de alta aparte: una carta se queda con la firma y la otra con el equipo.
                  Al unirlas queda <b>una sola</b>, con la firma y los equipos de las dos. Elige cuál folio conservar —
                  normalmente el de la carta que imprimiste y firmaron.
                </p>
                <div className="mt-2 space-y-1.5">
                  {candidatas.map((c) => (
                    <div key={c.id} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="mono text-sm font-bold text-kraft-dark">{c.folio}</span>{" "}
                          <span className="text-soft">
                            · {ETIQUETA_CLASE[c.clase] ?? c.clase} · {fechaCorta(c.fecha)}
                          </span>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {c.firmada ? <Badge tono="verde">Firmada</Badge> : <Badge tono="rojo">Sin firmar</Badge>}
                            {c.equipos ? (
                              <span className="mono text-[11px] text-soft">{c.equipos}</span>
                            ) : (
                              <Badge tono="ambar">Sin equipo</Badge>
                            )}
                          </div>
                        </div>
                        <a href={`/api/pdf/${c.id}`} target="_blank" rel="noreferrer" className={btnGhost}>
                          Ver
                        </a>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-amber-100 pt-2">
                        <span className="text-[11px] text-soft">Unir y conservar el folio:</span>
                        <button
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                          disabled={pendiente}
                          onClick={() => unir(c, false)}
                        >
                          {c.folio}
                        </button>
                        <button
                          className="rounded border border-line bg-white px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-paper"
                          disabled={pendiente}
                          onClick={() => unir(c, true)}
                        >
                          {folio} (esta)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-soft">
                Este empleado no tiene otras cartas de asignación con las que unir esta.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
