"use client";

import { useState, useTransition } from "react";
import { ligarConSuResponsiva } from "../app/inventario/actions";

const btn =
  "rounded-md border border-violet-400 bg-white px-3 py-1.5 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60";

export type PorLigar = {
  equipo_id: number;
  codigo: string;
  marca: string;
  modelo: string;
  folio: string;
  empleado_numero: string;
  empleado_nombre: string;
};

/**
 * Equipos que tienen carta responsiva vigente pero en el inventario aparecen
 * sin empleado. El empleado ya viene en el documento, así que se ligan de un
 * golpe sin que nadie tenga que elegirlo.
 */
export default function AvisoPorLigar({ pendientes }: { pendientes: PorLigar[] }) {
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const correr = () => {
    setError("");
    setResultado("");
    iniciar(async () => {
      const res = await ligarConSuResponsiva();
      if (res.ok) setResultado(res.mensaje ?? "Listo.");
      else setError(res.error ?? "Error desconocido.");
    });
  };

  if (error) {
    return <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (!pendientes.length) {
    return resultado ? (
      <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        ✅ {resultado}
      </div>
    ) : null;
  }

  return (
    <div className="mb-5 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p>
            🔗 Hay <b>{pendientes.length}</b> equipo(s) <b>con carta responsiva firmada pero sin empleado</b> en el
            inventario. El empleado ya viene en el documento:
          </p>
          <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
            {pendientes.slice(0, 12).map((p) => (
              <li key={p.equipo_id}>
                <span className="mono text-xs font-semibold">{p.codigo}</span> {p.marca} {p.modelo} →{" "}
                <b>
                  {p.empleado_numero} {p.empleado_nombre}
                </b>{" "}
                <span className="mono text-xs">({p.folio})</span>
              </li>
            ))}
            {pendientes.length > 12 ? <li>…y {pendientes.length - 12} más.</li> : null}
          </ul>
        </div>
        <button className={btn} onClick={correr} disabled={pendiente}>
          {pendiente ? "Ligando…" : "🔗 Ligar con su empleado"}
        </button>
      </div>
      {resultado ? <p className="mt-2 border-t border-violet-200 pt-2 text-xs">{resultado}</p> : null}
    </div>
  );
}
