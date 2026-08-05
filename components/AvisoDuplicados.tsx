"use client";

import { useState, useTransition } from "react";
import { unirDuplicados } from "../app/inventario/actions";
import { btnGhost } from "./ui";

const btnUnir =
  "rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60";

export type CampoRepetido = { etiqueta: string; n: number; bloqueante: boolean };

/**
 * Aviso de datos repetidos con el botón que los resuelve.
 *
 * Une los registros que son el mismo aparato capturado dos veces: el más
 * completo se queda con toda la información y con las responsivas, y el
 * sobrante desaparece. Antes se necesitaba un script desde la terminal.
 */
export default function AvisoDuplicados({
  total,
  desglose,
  soloDup,
}: {
  total: number;
  desglose: CampoRepetido[];
  soloDup: boolean;
}) {
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const correr = () => {
    if (
      !confirm(
        "Se van a unir los registros repetidos: el más completo se queda con toda la información y con las responsivas, y el sobrante desaparece.\n\n" +
          "Antes se guarda un respaldo automático, así que siempre se puede volver atrás desde Respaldos.\n\n¿Continuar?"
      )
    )
      return;
    setError("");
    setResultado("");
    iniciar(async () => {
      const res = await unirDuplicados();
      if (res.ok) setResultado(res.mensaje ?? "Listo.");
      else setError(res.error ?? "Error desconocido.");
    });
  };

  if (error) {
    return <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  // El aviso desaparece solo cuando ya no queda nada repetido; mientras tanto se
  // deja el resultado a la vista para saber qué se hizo.
  if (total === 0) {
    return resultado ? (
      <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        ✅ {resultado}
      </div>
    ) : null;
  }

  return (
    <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          ⚠️ Se detectaron <b>{total}</b> equipo(s) con datos repetidos:{" "}
          {desglose.map((d, i) => (
            <span key={d.etiqueta}>
              {i > 0 ? ", " : ""}
              <b>{d.n}</b> por {d.etiqueta}
              {d.bloqueante ? "" : " (solo aviso)"}
            </span>
          ))}
          . Casi siempre es el mismo aparato capturado dos veces: con <b>Unir duplicados</b> se juntan en un solo
          registro (se queda el más completo, con sus responsivas) y el sobrante desaparece.
        </span>
        <div className="flex items-center gap-2">
          <a href={soloDup ? "/inventario" : "/inventario?dup=1"} className={btnGhost}>
            {soloDup ? "Ver todo el inventario" : "Ver solo duplicados"}
          </a>
          <button className={btnUnir} onClick={correr} disabled={pendiente}>
            {pendiente ? "Uniendo…" : "🧹 Unir duplicados"}
          </button>
        </div>
      </div>
      {resultado ? <p className="mt-2 border-t border-amber-200 pt-2 text-xs">{resultado}</p> : null}
    </div>
  );
}
