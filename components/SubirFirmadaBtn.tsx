"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subirResponsivaFirmada } from "../app/responsivas/actions";

/**
 * Sube el escaneo (o la foto) de una responsiva ya firmada en papel.
 * A partir de ese momento el documento que se ve al dar "Ver" es el firmado.
 */
export default function SubirFirmadaBtn({
  responsivaId,
  folio,
  className,
  etiqueta = "Subir firmada",
}: {
  responsivaId: number;
  folio: string;
  className?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const subir = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError("");
    const fd = new FormData();
    fd.append("archivo", archivo);
    iniciar(async () => {
      const res = await subirResponsivaFirmada(responsivaId, fd);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo subir.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={
          className ??
          "rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
        }
        disabled={pendiente}
        title={`Sube el PDF o la foto de ${folio} ya firmada`}
        onClick={() => ref.current?.click()}
      >
        {pendiente ? "Subiendo…" : `↥ ${etiqueta}`}
      </button>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={subir} />
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </>
  );
}
