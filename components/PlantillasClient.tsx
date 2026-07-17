"use client";

import { useState, useTransition } from "react";
import type { Plantilla } from "../lib/types";
import { MARCADORES_DISPONIBLES } from "../lib/plantilla";
import { guardarConfig, guardarPlantilla, previsualizarPlantilla } from "../app/plantillas/actions";
import { Card, Label, btnGhost, btnPrimary, inputCls } from "./ui";

function base64AUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export default function PlantillasClient({
  plantillas,
  config,
}: {
  plantillas: Plantilla[];
  config: { empresa: string; ciudad: string; entrega_default: string; direccion: string };
}) {
  const [conf, setConf] = useState(config);
  const [textos, setTextos] = useState<Record<string, string>>(
    Object.fromEntries(plantillas.map((p) => [p.clave, p.contenido]))
  );
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState<string | null>(null);
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

  const previsualizar = (clave: string) => {
    setError("");
    setMensaje("");
    setCargando(clave);
    iniciar(async () => {
      const res = await previsualizarPlantilla(clave, textos[clave] ?? "");
      setCargando(null);
      if (res.ok && res.pdf) {
        setPreviews((p) => {
          if (p[clave]) URL.revokeObjectURL(p[clave]);
          return { ...p, [clave]: base64AUrl(res.pdf as string) };
        });
      } else {
        setError(res.error ?? "No se pudo generar la vista previa.");
      }
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
          <div className="sm:col-span-3">
            <Label>Dirección (pie de las cartas)</Label>
            <input
              className={inputCls}
              value={conf.direccion}
              onChange={(e) => setConf((c) => ({ ...c, direccion: e.target.value }))}
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
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <textarea
                className={`${inputCls} mono text-xs leading-relaxed`}
                rows={16}
                value={textos[p.clave] ?? ""}
                onChange={(e) => setTextos((t) => ({ ...t, [p.clave]: e.target.value }))}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={btnPrimary}
                  disabled={pendiente}
                  onClick={() => ejecutar(() => guardarPlantilla(p.clave, textos[p.clave] ?? ""), `Plantilla “${p.nombre}” guardada.`)}
                >
                  Guardar plantilla
                </button>
                <button className={btnGhost} disabled={pendiente} onClick={() => previsualizar(p.clave)}>
                  {cargando === p.clave ? "Generando…" : "👁 Vista previa"}
                </button>
              </div>
            </div>
            <div>
              <Label>Vista previa</Label>
              {previews[p.clave] ? (
                <div className="space-y-2">
                  <iframe
                    title={`Vista previa ${p.nombre}`}
                    src={previews[p.clave]}
                    className="h-[520px] w-full rounded-md border border-line bg-white"
                  />
                  <a href={previews[p.clave]} target="_blank" rel="noreferrer" className={btnGhost}>
                    Abrir en pestaña nueva
                  </a>
                </div>
              ) : (
                <div className="flex h-[520px] items-center justify-center rounded-md border border-dashed border-line bg-paper/50 px-6 text-center text-sm text-soft">
                  Pulsa “Vista previa” para ver cómo queda esta carta con datos de ejemplo.
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
