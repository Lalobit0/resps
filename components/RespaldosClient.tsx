"use client";

import { useRef, useState, useTransition } from "react";
import { crearRespaldo, eliminarRespaldo, restaurarRespaldo, restaurarDesdeArchivo, cancelarRestauracion } from "../app/respaldos/actions";
import { Card, Empty, btnDanger, btnGhost, btnPrimary, tdCls, thCls } from "./ui";

export type Respaldo = { nombre: string; tamano: string; fecha: string };

export default function RespaldosClient({ respaldos, pendiente: hayPendiente }: { respaldos: Respaldo[]; pendiente: boolean }) {
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [trabajando, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const correr = (fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await fn();
      if (res.ok) setMensaje(res.mensaje ?? "Listo.");
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const subir = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    if (!confirm(`¿Usar "${archivo.name}" para restaurar? Reemplazará los datos actuales al reiniciar la app.`)) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    correr(() => restaurarDesdeArchivo(fd));
  };

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {hayPendiente ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Hay una restauración pendiente. Se aplicará al cerrar y volver a abrir la app.</span>
          <button className={btnGhost} disabled={trabajando} onClick={() => correr(cancelarRestauracion)}>
            Cancelar restauración
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={trabajando} onClick={() => correr(crearRespaldo)}>
          {trabajando ? "Trabajando…" : "💾 Crear respaldo ahora"}
        </button>
        <input ref={fileRef} type="file" accept=".db" className="hidden" onChange={subir} />
        <button className={btnGhost} disabled={trabajando} onClick={() => fileRef.current?.click()}>
          ↥ Restaurar desde archivo .db
        </button>
      </div>

      <Card className="p-0">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Respaldos guardados</h2>
          <p className="text-xs text-soft">Se guardan en la carpeta data/backups de la app.</p>
        </div>
        {respaldos.length === 0 ? (
          <div className="p-4">
            <Empty>Aún no hay respaldos. Crea el primero con el botón de arriba.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="border-b border-line bg-paper/70">
                <tr>
                  <th className={thCls}>Archivo</th>
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Tamaño</th>
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {respaldos.map((r) => (
                  <tr key={r.nombre} className="border-b border-line/60 last:border-0">
                    <td className={`${tdCls} mono text-xs`}>{r.nombre}</td>
                    <td className={tdCls}>{r.fecha}</td>
                    <td className={`${tdCls} text-soft`}>{r.tamano}</td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1.5">
                        <a className={btnGhost} href={`/api/respaldo/${r.nombre}`}>
                          Descargar
                        </a>
                        <button
                          className={btnGhost}
                          disabled={trabajando}
                          onClick={() => {
                            if (confirm(`¿Restaurar "${r.nombre}"? Reemplazará los datos actuales al reiniciar la app.`))
                              correr(() => restaurarRespaldo(r.nombre));
                          }}
                        >
                          Restaurar
                        </button>
                        <button
                          className={btnDanger}
                          disabled={trabajando}
                          onClick={() => {
                            if (confirm(`¿Eliminar el respaldo "${r.nombre}"?`)) correr(() => eliminarRespaldo(r.nombre));
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
