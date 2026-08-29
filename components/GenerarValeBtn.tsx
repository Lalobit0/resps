"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearVale } from "../app/responsivas/actions";
import type { ConceptoVale } from "../lib/vales";
import { dinero } from "../lib/helpers";
import { btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Genera el vale de descuento de una entrega que ya está hecha.
 *
 * El concepto sale del tarifario de Recursos Humanos y arrastra su precio: son
 * los dos únicos datos que el formato pide capturar. Lo demás —el día, la
 * semana, el año— va en blanco para que lo llene el empleado al firmar.
 */
export default function GenerarValeBtn({
  empleadoId,
  responsivaId,
  folio,
  conceptos,
  /** Texto para adivinar el concepto del tarifario: marca y modelo del equipo. */
  pista,
  className,
}: {
  empleadoId: number;
  responsivaId: number;
  folio: string;
  conceptos: ConceptoVale[];
  pista?: string;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [conceptoId, setConceptoId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const elegido = conceptos.find((c) => c.id === conceptoId);
  // Se arma el PDF de verdad, sin guardar: lo que se ve es lo que se imprime.
  const urlPrevia = conceptoId
    ? `/api/vale/preview?empleado=${empleadoId}&concepto=${conceptoId}#toolbar=0&navpanes=0&view=FitH`
    : "";

  /** Propone el concepto del tarifario que menciona la marca del equipo. */
  const sugerir = () => {
    const texto = (pista ?? "").toUpperCase();
    if (!texto) return "";
    const marca = conceptos.find((c) => {
      const palabras = c.concepto.split(/\s+/).filter((p) => p.length >= 5 && !p.startsWith("REP"));
      return palabras.some((p) => texto.includes(p));
    });
    return marca?.id ?? "";
  };

  const generar = () => {
    setError("");
    iniciar(async () => {
      const res = await crearVale({ empleadoId, conceptoId: Number(conceptoId), responsivaOrigenId: responsivaId });
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
          setConceptoId(sugerir());
          setError("");
          setAbierto(true);
        }}
        title="Generar el vale de descuento de nómina de esta entrega"
      >
        + Vale
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-10 w-full max-w-3xl rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Vale de descuento</h2>
                <p className="mt-0.5 text-sm text-soft">
                  Queda ligado a la carta <span className="mono font-semibold text-kraft-dark">{folio}</span>. Lo firma
                  Recursos Humanos.
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
                <select
                  className={inputCls}
                  value={conceptoId}
                  onChange={(e) => setConceptoId(e.target.value ? Number(e.target.value) : "")}
                  disabled={pendiente}
                >
                  <option value="">— Elige el concepto —</option>
                  {conceptos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.concepto} — {dinero(c.monto)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
                  Valor de reposición
                </label>
                <p className="rounded-md border border-line bg-paper/60 px-3 py-2 text-sm text-ink">
                  {elegido ? elegido.texto || dinero(elegido.monto) : <span className="text-soft">Sale del concepto</span>}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">Vista previa</label>
              {urlPrevia ? (
                <iframe
                  key={urlPrevia}
                  src={urlPrevia}
                  title="Vista previa del vale"
                  className="h-[460px] w-full rounded-md border border-line bg-white"
                />
              ) : (
                <p className="rounded-md border border-dashed border-line bg-paper/60 px-4 py-8 text-center text-sm text-soft">
                  Elige el concepto para ver cómo queda el vale.
                </p>
              )}
            </div>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={generar} disabled={pendiente || !conceptoId}>
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
