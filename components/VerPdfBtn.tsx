"use client";

import { useEffect, useState } from "react";
import { btnGhost } from "./ui";

/**
 * Abre el documento de una responsiva en una ventana sobre la página, sin
 * mandar a otra pestaña: así se revisa el escaneo y se sigue trabajando en la
 * misma lista.
 */
export default function VerPdfBtn({
  id,
  folio,
  etiqueta = "Ver PDF",
  className,
  /** Fuerza el documento generado en vez del escaneo firmado. */
  original = false,
  subtitulo,
}: {
  id: number;
  folio: string;
  etiqueta?: string;
  className?: string;
  original?: boolean;
  subtitulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const src = `/api/pdf/${id}${original ? "?original=1" : ""}`;

  // Con Escape se cierra, que es lo que todo el mundo intenta primero.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <>
      <button type="button" className={className ?? btnGhost} onClick={() => setAbierto(true)}>
        {etiqueta}
      </button>

      {abierto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-line bg-white p-3 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="mono text-sm font-bold text-kraft-dark">{folio}</p>
                {subtitulo ? <p className="text-xs text-soft">{subtitulo}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a href={src} target="_blank" rel="noreferrer" className={btnGhost}>
                  Abrir en pestaña ↗
                </a>
                <a href={src} download={`${folio}.pdf`} className={btnGhost}>
                  Descargar
                </a>
                <button className={btnGhost} onClick={() => setAbierto(false)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <iframe title={`Responsiva ${folio}`} src={src} className="h-full w-full rounded-md border border-line bg-white" />
          </div>
        </div>
      ) : null}
    </>
  );
}
