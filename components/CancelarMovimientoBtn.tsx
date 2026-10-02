"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlanCancelacion } from "../lib/movimientos";
import { fechaCorta } from "../lib/helpers";
import { cancelarMovimientoEquipo } from "../app/inventario/actions";
import { Card, Label, btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Deshacer el último movimiento del equipo.
 *
 * La ventana dice de antemano todo lo que va a pasar —a quién vuelve el
 * equipo, qué carta se reabre, cuál se va a la papelera— porque cancelar toca
 * varias cosas a la vez y nadie debería tener que adivinar cuáles.
 */
export default function CancelarMovimientoBtn({
  plan,
  codigo,
  className,
}: {
  plan: PlanCancelacion;
  codigo: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const cerrar = () => {
    setAbierto(false);
    setMotivo("");
    setError("");
  };

  const confirmar = () => {
    setError("");
    iniciar(async () => {
      const r = await cancelarMovimientoEquipo({ historialId: plan.historialId, motivo });
      if (!r.ok) return setError(r.error ?? "No se pudo cancelar el movimiento.");
      cerrar();
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={() => setAbierto(true)}
        title="Deshacer este movimiento y dejar el equipo como estaba"
      >
        Cancelar movimiento
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-10 w-full max-w-lg">
            <h2 className="text-base font-bold text-ink">Cancelar el movimiento de {codigo}</h2>
            <p className="mt-1 text-sm text-soft">
              <span className="font-semibold text-ink">{plan.titulo}</span> del {fechaCorta(plan.fecha)}
              {plan.loTiene ? (
                <>
                  , a nombre de <span className="font-semibold text-ink">{plan.loTiene}</span>
                </>
              ) : null}
              .
            </p>

            {plan.impedimento ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {plan.impedimento}
              </div>
            ) : (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-soft">Esto es lo que va a pasar</p>
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  <li>
                    ↩ {codigo} {plan.volverA ? <>vuelve a <b>{plan.volverA}</b></> : <>vuelve al inventario como disponible</>}
                  </li>
                  {plan.cartaPapelera ? (
                    <li>
                      🗑 La carta <span className="mono text-kraft-dark">{plan.cartaPapelera}</span> se va a la papelera
                    </li>
                  ) : null}
                  {plan.cartaReabre ? (
                    <li>
                      📄 La carta <span className="mono text-kraft-dark">{plan.cartaReabre}</span> queda vigente otra vez
                    </li>
                  ) : null}
                  <li>📝 El movimiento se queda en el histórico, marcado como cancelado</li>
                </ul>

                <div className="mt-4">
                  <Label>¿Por qué se cancela?</Label>
                  <input
                    className={inputCls}
                    placeholder="El radio no funcionó, se entregó al equivocado…"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>
              </>
            )}

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="mt-4 flex gap-2">
              {plan.impedimento ? null : (
                <button className={btnPrimary} onClick={confirmar} disabled={pendiente}>
                  {pendiente ? "Cancelando…" : "Sí, cancelar el movimiento"}
                </button>
              )}
              <button className={btnGhost} onClick={cerrar} disabled={pendiente}>
                {plan.impedimento ? "Entendido" : "No, dejarlo como está"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
