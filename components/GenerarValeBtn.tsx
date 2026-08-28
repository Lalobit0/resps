"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarValeDeEntrega } from "../app/responsivas/actions";
import { btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Genera el vale de descuento de una entrega que ya está hecha.
 *
 * En los radios la entrega son dos papeles: la responsiva del aparato y el
 * vale por su valor de reposición. Esto es para los que ya se entregaron sin
 * él, sin tener que rehacer la carta.
 */
export default function GenerarValeBtn({
  responsivaId,
  folio,
  conceptoSugerido,
  montoSugerido,
  className,
}: {
  responsivaId: number;
  folio: string;
  /** Sale del equipo de la carta: marca, modelo y serie. */
  conceptoSugerido: string;
  /** El costo del equipo, si está capturado. */
  montoSugerido?: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState(conceptoSugerido);
  const [monto, setMonto] = useState(montoSugerido ?? "");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const generar = () => {
    setError("");
    iniciar(async () => {
      const res = await generarValeDeEntrega({ responsivaId, concepto, monto });
      if (res.ok) {
        setAbierto(false);
        router.refresh();
        if (res.id) window.open(`/api/pdf/${res.id}`, "_blank");
      } else setError(res.error ?? "No se pudo generar el vale.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={() => {
          setConcepto(conceptoSugerido);
          setMonto(montoSugerido ?? "");
          setError("");
          setAbierto(true);
        }}
        title="Generar el vale de descuento de nómina de esta entrega"
      >
        + Vale de descuento
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-10 w-full max-w-lg rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Vale de descuento</h2>
                <p className="mt-0.5 text-sm text-soft">
                  Queda ligado a la carta <span className="mono font-semibold text-kraft-dark">{folio}</span>, con su
                  misma fecha. Lo firma Recursos Humanos.
                </p>
              </div>
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
                  Concepto del descuento
                </label>
                <input
                  className={inputCls}
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Radio TXPRO TK-320, serie 2312A04938"
                  disabled={pendiente}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
                  Valor de reposición
                </label>
                <input
                  className={`${inputCls} max-w-[200px]`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  disabled={pendiente}
                />
                <p className="mt-1 text-xs text-soft">
                  {montoSugerido
                    ? "Viene del costo capturado en el inventario; cámbialo si el de reposición es otro."
                    : "El equipo no tiene costo capturado: escribe el valor de reposición."}
                </p>
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={generar} disabled={pendiente || !concepto.trim() || !(Number(monto) > 0)}>
                {pendiente ? "Generando…" : "Generar vale e imprimir"}
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
