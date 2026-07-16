"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemConEquipo, Responsiva } from "../lib/types";
import { CONDICIONES_DEVOLUCION } from "../lib/constants";
import { registrarDevolucion } from "../app/responsivas/actions";
import SignatureCanvas from "./SignatureCanvas";
import { Card, Label, btnPrimary, inputCls } from "./ui";

export default function DevolucionClient({
  responsiva,
  empleadoNombre,
  items,
}: {
  responsiva: Responsiva;
  empleadoNombre: string;
  items: ItemConEquipo[];
}) {
  const router = useRouter();
  const [condiciones, setCondiciones] = useState<Record<number, string>>(
    Object.fromEntries(items.map((i) => [i.equipo_id, "Buen estado"]))
  );
  const [observaciones, setObservaciones] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const enviar = () => {
    setError("");
    if (!firma) return setError("Falta la firma del empleado que entrega el equipo.");
    iniciar(async () => {
      const res = await registrarDevolucion({
        responsivaId: responsiva.id,
        condiciones,
        observaciones,
        firma,
      });
      if (res.ok && res.id) {
        window.open(`/api/pdf/${res.id}`, "_blank");
        router.push(`/responsivas?nueva=${res.folio}`);
        router.refresh();
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <h2 className="mb-1 text-base font-bold text-ink">Responsiva de origen</h2>
          <p className="text-sm text-soft">
            <span className="mono font-semibold text-ink">{responsiva.folio}</span> · {empleadoNombre}
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">Condición de cada equipo al devolver</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-white px-3 py-2.5">
                <p className="text-sm">
                  <span className="mono text-xs font-semibold text-kraft-dark">{item.codigo}</span>{" "}
                  <span className="font-medium">{item.descripcion}</span>
                </p>
                <select
                  className={`${inputCls} mt-2`}
                  value={condiciones[item.equipo_id] ?? "Buen estado"}
                  onChange={(e) => setCondiciones((c) => ({ ...c, [item.equipo_id]: e.target.value }))}
                >
                  {CONDICIONES_DEVOLUCION.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">Detalles de la recepción</h2>
          <div>
            <Label>Observaciones (opcional)</Label>
            <textarea
              className={inputCls}
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Se devuelve con cargador. Pantalla con rayón leve."
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">Firma del empleado que devuelve</h2>
          <SignatureCanvas onChange={setFirma} />
        </Card>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente}>
          {pendiente ? "Generando PDF…" : "Registrar devolución y generar carta"}
        </button>
        <p className="text-center text-xs text-soft">
          Los equipos volverán a quedar disponibles y la responsiva original se cerrará.
        </p>
      </div>
    </div>
  );
}
