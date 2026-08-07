"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  candidatasParaFirma,
  equiposParaResponsiva,
  ligarEquiposAResponsiva,
  usarComoFirmaDeOtra,
  type EquipoDeCarta,
  type SugerenciaFirma,
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
  const [candidatas, setCandidatas] = useState<SugerenciaFirma[]>([]);
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
      const [eq, cand] = await Promise.all([equiposParaResponsiva(id), candidatasParaFirma(id)]);
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

  const reasignar = (destino: SugerenciaFirma) => {
    if (
      !confirm(
        `El documento de ${folio} pasará a ser la firma de ${destino.folio}.\n\n` +
          `${folio} se irá a la papelera y su equipo quedará disponible (podrás revertirlo desde la bitácora).\n\n¿Continuar?`
      )
    )
      return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await usarComoFirmaDeOtra(id, destino.id);
      if (res.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(res.error ?? "No se pudo reasignar.");
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
                <h3 className="text-sm font-bold text-amber-900">¿Este documento era la firma de otra carta?</h3>
                <p className="mt-0.5 text-xs text-amber-900">
                  Es lo que pasa cuando se sube un escaneo y se da de alta una carta nueva, aunque la buena ya estaba
                  esperando firma. Elige cuál era: el documento pasa a esa carta y <b>{folio}</b> se va a la papelera.
                </p>
                <div className="mt-2 space-y-1.5">
                  {candidatas.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                    >
                      <div className="text-xs">
                        <span className="mono text-sm font-bold text-kraft-dark">{c.folio}</span>{" "}
                        <span className="text-soft">
                          · {ETIQUETA_CLASE[c.clase] ?? c.clase} · {fechaCorta(c.fecha)}
                          {c.equipos ? ` · ${c.equipos}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a href={`/api/pdf/${c.id}`} target="_blank" rel="noreferrer" className={btnGhost}>
                          Ver
                        </a>
                        <button
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          disabled={pendiente}
                          onClick={() => reasignar(c)}
                        >
                          Era esta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-soft">
                Este empleado no tiene otras cartas esperando firma, así que no hay a cuál reasignar el documento.
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
