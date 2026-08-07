"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unirParesPartidos } from "../app/responsivas/actions";
import type { ParPartido } from "../lib/pendientes";
import { ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { Badge, btnGhost, btnPrimary, tdCls, thCls } from "./ui";

/**
 * Cartas que quedaron partidas en dos: el escaneo entró como carta aparte, así
 * que una tiene la firma y la otra el equipo. Aquí se ven todas juntas y se
 * unen de una vez, conservando el folio de la que trae el equipo (la que se
 * imprimió y firmaron).
 */
export default function AvisoParesPartidos({ pares }: { pares: ParPartido[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set(pares.map((p) => p.sin_firma_id)));
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  if (!pares.length) return null;

  const alternar = (id: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const unir = () => {
    const marcados = pares.filter((p) => elegidos.has(p.sin_firma_id));
    if (!marcados.length) {
      setError("Marca al menos un par.");
      return;
    }
    if (
      !confirm(
        `Se van a unir ${marcados.length} par(es).\n\n` +
          `En cada uno queda la carta que tiene el equipo, con la firma de la otra; la otra se va a la papelera.\n\n` +
          `Todo queda en la bitácora y se puede revertir. ¿Continuar?`
      )
    )
      return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await unirParesPartidos(
        marcados.map((p) => ({ conservarId: p.sin_firma_id, eliminarId: p.firmada_id }))
      );
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else setError(res.error ?? "No se pudieron unir.");
    });
  };

  return (
    <div className="mb-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          🔗 Hay <b>{pares.length}</b> carta(s) <b>partidas en dos</b>: el escaneo se guardó como carta aparte, así que
          una tiene la firma y la otra el equipo. Se pueden unir en una sola.
        </span>
        <button className={btnGhost} onClick={() => setAbierto(!abierto)}>
          {abierto ? "Ocultar" : "Ver y unir"}
        </button>
      </div>

      {mensaje ? (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {mensaje}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      {abierto ? (
        <div className="mt-3">
          <div className="overflow-x-auto rounded-md border border-amber-200 bg-white">
            <table className="w-full border-collapse">
              <thead className="border-b border-amber-200 bg-amber-50/60">
                <tr>
                  <th className={`${thCls} w-10`}></th>
                  <th className={thCls}>Empleado</th>
                  <th className={thCls}>Se conserva (tiene el equipo)</th>
                  <th className={thCls}>Se une y desaparece (tiene la firma)</th>
                </tr>
              </thead>
              <tbody>
                {pares.map((p) => (
                  <tr key={p.sin_firma_id} className="border-b border-amber-100 last:border-0">
                    <td className={tdCls}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-kraft"
                        checked={elegidos.has(p.sin_firma_id)}
                        onChange={() => alternar(p.sin_firma_id)}
                        aria-label={`Unir el par de ${p.empleado_nombre}`}
                      />
                    </td>
                    <td className={`${tdCls} text-xs`}>
                      <span className="mono">{p.empleado_numero}</span> {p.empleado_nombre}
                      <div className="text-soft">{ETIQUETA_CLASE[p.clase] ?? p.clase}</div>
                    </td>
                    <td className={tdCls}>
                      <span className="mono text-xs font-semibold text-kraft-dark">{p.sin_firma_folio}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-soft">
                        <Badge tono="rojo">Sin firmar</Badge>
                        <span className="mono">{p.equipos}</span>
                        <span>· {fechaCorta(p.sin_firma_fecha)}</span>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <span className="mono text-xs font-semibold text-kraft-dark">{p.firmada_folio}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-soft">
                        <Badge tono="verde">Firmada</Badge>
                        <Badge tono="ambar">Sin equipo</Badge>
                        <span>· {fechaCorta(p.firmada_fecha)}</span>
                        <a href={`/api/pdf/${p.firmada_id}`} target="_blank" rel="noreferrer" className="underline">
                          ver
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className={btnPrimary} onClick={unir} disabled={pendiente || !elegidos.size}>
              {pendiente ? "Uniendo…" : `Unir ${elegidos.size} par(es)`}
            </button>
            <span className="text-xs">
              La firma pasa a la carta que tiene el equipo y la otra se va a la papelera. Se puede revertir desde la
              bitácora.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
