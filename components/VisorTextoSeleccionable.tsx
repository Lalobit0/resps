"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { LecturaSeleccionable } from "../lib/ocr";

/**
 * Muestra la imagen escaneada con una capa de texto transparente encima,
 * palabra por palabra, para poder seleccionarla y copiarla directo del
 * escaneo (como el "texto en vivo" del iPhone). Incluye lupa (zoom).
 *
 * Cada palabra se estira con scaleX para que cubra exactamente su palabra
 * impresa: así lo que resaltas coincide con lo que ves y nada se encima.
 */
export default function VisorTextoSeleccionable({ data }: { data: LecturaSeleccionable }) {
  const [copiado, setCopiado] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(0.25);
  const contRef = useRef<HTMLDivElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);

  // Escala de "ajustar al ancho" (se recalcula si cambia el tamaño del panel).
  useLayoutEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const medir = () => setFit(Math.max(0.05, (el.clientWidth - 2) / data.ancho));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.ancho]);

  // Estira cada palabra (scaleX) para que cubra el ancho real de su palabra impresa.
  useLayoutEffect(() => {
    const capa = capaRef.current;
    if (!capa) return;
    const spans = capa.querySelectorAll<HTMLSpanElement>("[data-w]");
    for (const s of spans) {
      const objetivo = Number(s.dataset.w);
      // Mide solo la palabra (span interno), sin el espacio/salto separador.
      const natural = (s.firstElementChild as HTMLElement | null)?.offsetWidth ?? s.offsetWidth;
      if (natural > 0 && objetivo > 0) s.style.transform = `scaleX(${objetivo / natural})`;
    }
  }, [data]);

  const k = fit * zoom;
  const masZoom = () => setZoom((z) => Math.min(6, z * 1.25));
  const menosZoom = () => setZoom((z) => Math.max(0.4, z / 1.25));

  const copiarTodo = async () => {
    try {
      await navigator.clipboard.writeText(data.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Si el navegador no deja copiar, el usuario aún puede seleccionar a mano.
    }
  };

  const btn = "rounded-md border border-line bg-white px-2 py-1 text-xs text-kraft-dark hover:bg-paper";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={menosZoom} title="Alejar">
            🔍−
          </button>
          <span className="mono w-12 text-center text-xs text-soft">{Math.round(zoom * 100)}%</span>
          <button type="button" className={btn} onClick={masZoom} title="Acercar">
            🔍+
          </button>
          <button type="button" className={btn} onClick={() => setZoom(1)} title="Ajustar al ancho">
            Ajustar
          </button>
        </div>
        <button type="button" onClick={copiarTodo} className={btn}>
          {copiado ? "¡Copiado!" : "📋 Copiar todo"}
        </button>
      </div>
      <p className="mb-2 text-xs text-soft">Selecciona el texto sobre la imagen para copiarlo y pegarlo en los campos.</p>
      <div ref={contRef} className="max-h-[78vh] overflow-auto rounded-md border border-line bg-white">
        <div style={{ width: Math.ceil(data.ancho * k), height: Math.ceil(data.alto * k), position: "relative" }}>
          <div
            style={{
              width: data.ancho,
              height: data.alto,
              transform: `scale(${k})`,
              transformOrigin: "0 0",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imagen}
              alt="Responsiva escaneada"
              width={data.ancho}
              height={data.alto}
              className="block select-none"
              draggable={false}
            />
            <div ref={capaRef} className="capa-ocr absolute inset-0">
              {data.palabras.map((p, i) => (
                <span
                  key={i}
                  data-w={p.w}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    fontSize: `${Math.max(8, p.h * 0.92)}px`,
                    lineHeight: `${p.h}px`,
                    whiteSpace: "pre",
                    color: "transparent",
                    transformOrigin: "0 0",
                    cursor: "text",
                    fontFamily: "Arial, Helvetica, sans-serif",
                  }}
                >
                  <span>{p.texto}</span>
                  {p.fin ? "\n" : " "}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
