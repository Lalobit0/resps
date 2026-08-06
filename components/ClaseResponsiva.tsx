"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLASES_CARTA, ETIQUETA_CLASE } from "../lib/constants";
import { cambiarClaseResponsiva, cambiarClaseVarias } from "../app/responsivas/actions";
import { btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Cambia el tipo de carta de una responsiva.
 *
 * Va como acción con su ventana de confirmación, no como lista desplegable en
 * el renglón: ahí se cambiaba sin querer con solo rozar la rueda del mouse.
 */
export function EditarClaseBtn({
  id,
  folio,
  clase,
  tipo,
  className,
}: {
  id: number;
  folio: string;
  clase: string;
  tipo: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(clase);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  // En las devoluciones el tipo lo hereda la carta original: no se edita.
  if (tipo !== "ASIGNACION") return null;

  const guardar = () => {
    if (valor === clase) {
      setAbierto(false);
      return;
    }
    setError("");
    iniciar(async () => {
      const res = await cambiarClaseResponsiva(id, valor);
      if (res.ok) {
        setAbierto(false);
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo cambiar.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={() => {
          setValor(clase);
          setError("");
          setAbierto(true);
        }}
        title="Cambiar el tipo de carta de esta responsiva"
      >
        Editar tipo
      </button>

      {abierto ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => (pendiente ? null : setAbierto(false))}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-sm"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-base font-bold text-ink">Tipo de carta</h2>
            <p className="mt-1 text-sm text-soft">
              Responsiva <span className="mono font-semibold text-kraft-dark">{folio}</span>. Hoy está como{" "}
              <b>{ETIQUETA_CLASE[clase] ?? clase}</b>.
            </p>

            <div className="mt-4">
              <select className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} disabled={pendiente}>
                {CLASES_CARTA.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CLASE[c] ?? c}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={guardar} disabled={pendiente || valor === clase}>
                {pendiente ? "Guardando…" : "Guardar el cambio"}
              </button>
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Corrige de un golpe el tipo de todas las responsivas que se están viendo.
 * Pensado para una carga masiva que entró con el tipo equivocado: se filtra la
 * lista hasta dejar solo esas y se cambian juntas.
 */
export function CambiarClaseLista({ ids, resumen }: { ids: number[]; resumen: string }) {
  const router = useRouter();
  const [clase, setClase] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const aplicar = () => {
    if (!clase) {
      setError("Elige a qué tipo de carta se cambian.");
      return;
    }
    if (
      !confirm(
        `Se van a cambiar TODAS las ${ids.length} responsivas que estás viendo a "${ETIQUETA_CLASE[clase] ?? clase}".\n\n` +
          `${resumen}\n\nSi no son todas las que quieres cambiar, cancela y filtra primero.\n\n¿Continuar?`
      )
    )
      return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await cambiarClaseVarias(ids, clase);
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        setClase("");
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo cambiar.");
      }
    });
  };

  return (
    <div className="mb-5 rounded-md border border-line bg-paper/60 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">Corregir varias a la vez:</span>
        <select className={`${inputCls} max-w-[200px]`} value={clase} onChange={(e) => setClase(e.target.value)}>
          <option value="">— Elige el tipo —</option>
          {CLASES_CARTA.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CLASE[c] ?? c}
            </option>
          ))}
        </select>
        <button className={btnGhost} disabled={pendiente || !clase} onClick={aplicar}>
          {pendiente ? "Cambiando…" : `Aplicar a las ${ids.length} de esta lista`}
        </button>
        <span className="text-xs text-soft">
          Filtra arriba para dejar solo las que quieres corregir. Las devoluciones no se tocan.
        </span>
      </div>
      {mensaje ? <p className="mt-2 text-xs text-emerald-800">{mensaje}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
