"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLASES_CARTA, ETIQUETA_CLASE } from "../lib/constants";
import { cambiarClaseResponsiva, cambiarClaseVarias } from "../app/responsivas/actions";
import { btnGhost, inputCls } from "./ui";

/**
 * Tipo de carta de una responsiva, editable en el mismo renglón.
 * Se usa para corregir las que se cargaron con el tipo equivocado.
 */
export function SelectClaseResponsiva({ id, clase, tipo }: { id: number; clase: string; tipo: string }) {
  const router = useRouter();
  const [valor, setValor] = useState(clase);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  // En las devoluciones el tipo lo hereda la carta original: no se toca.
  if (tipo !== "ASIGNACION") return <span className="text-[11px] text-soft">{ETIQUETA_CLASE[clase] ?? clase}</span>;

  const cambiar = (nueva: string) => {
    const antes = valor;
    setValor(nueva);
    setError("");
    iniciar(async () => {
      const res = await cambiarClaseResponsiva(id, nueva);
      if (res.ok) router.refresh();
      else {
        setValor(antes);
        setError(res.error ?? "No se pudo cambiar.");
      }
    });
  };

  return (
    <>
      <select
        className={`${inputCls} max-w-[150px] px-1.5 py-0.5 text-[11px]`}
        value={valor}
        disabled={pendiente}
        onChange={(e) => cambiar(e.target.value)}
        title="Tipo de carta. Cámbialo si se cargó mal."
      >
        {CLASES_CARTA.map((c) => (
          <option key={c} value={c}>
            {ETIQUETA_CLASE[c] ?? c}
          </option>
        ))}
      </select>
      {error ? <span className="block text-[11px] text-red-700">{error}</span> : null}
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
    if (!confirm(`Se van a cambiar ${ids.length} responsiva(s) a "${ETIQUETA_CLASE[clase] ?? clase}".\n\n${resumen}\n\n¿Continuar?`))
      return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await cambiarClaseVarias(ids, clase);
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo cambiar.");
      }
    });
  };

  return (
    <div className="mb-5 rounded-md border border-line bg-paper/60 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">Cambiar el tipo de las {ids.length} de esta lista a:</span>
        <select className={`${inputCls} max-w-[200px]`} value={clase} onChange={(e) => setClase(e.target.value)}>
          <option value="">— Elige el tipo —</option>
          {CLASES_CARTA.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CLASE[c] ?? c}
            </option>
          ))}
        </select>
        <button className={btnGhost} disabled={pendiente} onClick={aplicar}>
          {pendiente ? "Cambiando…" : "Aplicar a las de la lista"}
        </button>
        <span className="text-xs text-soft">
          Filtra arriba para dejar solo las que quieres corregir. Solo se cambian las de asignación.
        </span>
      </div>
      {mensaje ? <p className="mt-2 text-xs text-emerald-800">{mensaje}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
