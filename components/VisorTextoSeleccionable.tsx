"use client";

import { useState } from "react";
import type { LecturaSeleccionable } from "../lib/ocr";

/**
 * Muestra la imagen escaneada con una capa de texto transparente encima,
 * posicionada palabra por palabra, para poder seleccionarla y copiarla
 * directo del escaneo (como el "texto en vivo" del iPhone).
 */
export default function VisorTextoSeleccionable({ data }: { data: LecturaSeleccionable }) {
  const [copiado, setCopiado] = useState(false);

  const copiarTodo = async () => {
    try {
      await navigator.clipboard.writeText(data.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Si el navegador no deja copiar, el usuario aún puede seleccionar a mano.
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-soft">Selecciona el texto sobre la imagen para copiarlo y pegarlo en los campos.</p>
        <button
          type="button"
          onClick={copiarTodo}
          className="shrink-0 rounded-md border border-line bg-white px-2 py-1 text-xs text-kraft-dark hover:bg-paper"
        >
          {copiado ? "¡Copiado!" : "📋 Copiar todo"}
        </button>
      </div>
      <div className="max-h-[78vh] overflow-auto rounded-md border border-line bg-white">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imagen} alt="Responsiva escaneada" className="block w-full select-none" draggable={false} />
          <div className="capa-ocr absolute inset-0">
            {data.palabras.map((p, i) => (
              <span
                key={i}
                className="ocr-palabra"
                style={{
                  position: "absolute",
                  left: `${(p.x / data.ancho) * 100}%`,
                  top: `${(p.y / data.alto) * 100}%`,
                  height: `${(p.h / data.alto) * 100}%`,
                  fontSize: `${(p.h / data.alto) * 100}cqh`,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  color: "transparent",
                  cursor: "text",
                }}
              >
                {p.texto + " "}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
