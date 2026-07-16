"use client";

import { useState, useTransition } from "react";
import type { Plantilla } from "../lib/types";
import { MARCADORES_DISPONIBLES } from "../lib/plantilla";
import { guardarConfig, guardarPlantilla } from "../app/plantillas/actions";
import { Card, Label, btnPrimary, inputCls } from "./ui";

export default function PlantillasClient({
  plantillas,
  config,
}: {
  plantillas: Plantilla[];
  config: { empresa: string; ciudad: string; entrega_default: string };
}) {
  const [conf, setConf] = useState(config);
  const [textos, setTextos] = useState<Record<string, string>>(
    Object.fromEntries(plantillas.map((p) => [p.clave, p.contenido]))
  );
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await fn();
      if (res.ok) setMensaje(exito);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {mensaje}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <Card>
        <h2 className="mb-4 text-base font-bold text-ink">Datos de la empresa</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Empresa</Label>
            <input className={inputCls} value={conf.empresa} onChange={(e) => setConf((c) => ({ ...c, empresa: e.target.value }))} />
          </div>
          <div>
            <Label>Ciudad (para las cartas)</Label>
            <input className={inputCls} value={conf.ciudad} onChange={(e) => setConf((c) => ({ ...c, ciudad: e.target.value }))} />
          </div>
          <div>
            <Label>Entrega por defecto</Label>
            <input
              className={inputCls}
              value={conf.entrega_default}
              onChange={(e) => setConf((c) => ({ ...c, entrega_default: e.target.value }))}
            />
          </div>
        </div>
        <button
          className={`${btnPrimary} mt-4`}
          disabled={pendiente}
          onClick={() => ejecutar(() => guardarConfig(conf), "Datos de la empresa guardados.")}
        >
          Guardar datos
        </button>
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-bold text-ink">Marcadores disponibles</h2>
        <p className="mb-3 text-sm text-soft">
          Escribe estos marcadores dentro de las plantillas y el sistema los sustituye solo al generar cada carta:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MARCADORES_DISPONIBLES.map((m) => (
            <code key={m} className="mono rounded bg-paper px-2 py-1 text-xs text-kraft-dark">
              {m}
            </code>
          ))}
        </div>
      </Card>

      {plantillas.map((p) => (
        <Card key={p.clave}>
          <h2 className="mb-3 text-base font-bold text-ink">{p.nombre}</h2>
          <textarea
            className={`${inputCls} mono text-xs leading-relaxed`}
            rows={16}
            value={textos[p.clave] ?? ""}
            onChange={(e) => setTextos((t) => ({ ...t, [p.clave]: e.target.value }))}
          />
          <button
            className={`${btnPrimary} mt-3`}
            disabled={pendiente}
            onClick={() => ejecutar(() => guardarPlantilla(p.clave, textos[p.clave] ?? ""), `Plantilla “${p.nombre}” guardada.`)}
          >
            Guardar plantilla
          </button>
        </Card>
      ))}
    </div>
  );
}
