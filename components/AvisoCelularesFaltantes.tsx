"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agregarCelularesFaltantes } from "../app/lineas/actions";
import { btnPrimary } from "./ui";

export type Faltante = { imei: string; usuario?: string; num?: string; modelo?: string; linea?: string };

/**
 * Avisa cuando el inventario no tiene todos los teléfonos del listado oficial
 * de telefonía y permite darlos de alta sin salir de la pantalla.
 */
export default function AvisoCelularesFaltantes({ faltan, total }: { faltan: Faltante[]; total: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  if (!faltan.length) return null;

  const agregar = () => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await agregarCelularesFaltantes();
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo.");
      }
    });
  };

  return (
    <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p>
            ⚠️ El listado de telefonía tiene <b>{total}</b> teléfonos y al inventario le faltan <b>{faltan.length}</b>:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {faltan.map((c) => (
              <li key={c.imei}>
                <b>{c.usuario || "Sin usuario"}</b>
                {c.num ? ` (empleado ${c.num})` : ""} — {c.modelo || "teléfono"} · línea {c.linea || "—"} ·{" "}
                <span className="mono text-xs">IMEI {c.imei}</span>
              </li>
            ))}
          </ul>
        </div>
        <button className={`${btnPrimary} shrink-0`} onClick={agregar} disabled={pendiente}>
          {pendiente ? "Agregando…" : "Agregar al inventario"}
        </button>
      </div>
      {mensaje ? <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{mensaje}</p> : null}
      {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</p> : null}
    </div>
  );
}
