"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputCls } from "./ui";

/**
 * Un campo para elegir de una lista larga escribiendo lo que uno recuerda.
 *
 * Los catálogos del sistema —el tarifario de vales, los equipos del
 * inventario— pasan de los treinta renglones y crecen solos, y en una lista
 * desplegable hay que cazar el renglón a ojo. Aquí se escribe un pedazo de lo
 * que sea que uno recuerde y quedan a la vista los que casan.
 */

export type OpcionBuscador = {
  id: number;
  /** Lo que se ve en grande, y lo que queda en el campo al elegirlo. */
  titulo: string;
  /** Segunda línea, para el dato que ayuda a distinguir entre parecidos. */
  detalle?: string;
  /** A la derecha del renglón: el precio, el estado. */
  derecha?: string;
  /** Todo el texto contra el que se busca, junto. */
  buscar: string;
};

export default function Buscador({
  opciones,
  value,
  onChange,
  placeholder,
  sinResultados,
  nota,
  unidad,
  autoFocus,
  disabled,
}: {
  opciones: OpcionBuscador[];
  value: number | "";
  onChange: (id: number | "") => void;
  placeholder?: string;
  /** Qué decir cuando la búsqueda no encuentra nada. Recibe lo tecleado. */
  sinResultados?: (q: string) => string;
  /** Aclaración bajo el campo cuando ya hay algo elegido. */
  nota?: (elegida: OpcionBuscador) => string;
  /** Cómo se llama lo que se está buscando, para el conteo del pie. */
  unidad?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const elegida = opciones.find((o) => o.id === value) ?? null;

  const resultados = useMemo(() => {
    // Se busca por palabras sueltas y en cualquier orden: "radio kenwood"
    // encuentra "REP. RADIO PORTATIL KENWOOD".
    const partes = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!partes.length) return opciones;
    return opciones.filter((o) => {
      const texto = o.buscar.toLowerCase();
      return partes.every((p) => texto.includes(p));
    });
  }, [opciones, busqueda]);

  // Al filtrar, la marca vuelve arriba: si no, señala un renglón que ya no está.
  useEffect(() => setMarcado(0), [busqueda]);

  // Un clic fuera cierra la lista sin cambiar lo elegido.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // La opción marcada se mantiene a la vista al moverse con el teclado.
  useEffect(() => {
    lista.current?.children[marcado]?.scrollIntoView({ block: "nearest" });
  }, [marcado]);

  const elegir = (o: OpcionBuscador) => {
    onChange(o.id);
    setBusqueda("");
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) return setAbierto(true);
      setMarcado((m) => {
        const n = e.key === "ArrowDown" ? m + 1 : m - 1;
        return Math.max(0, Math.min(resultados.length - 1, n));
      });
    } else if (e.key === "Enter") {
      if (abierto && resultados[marcado]) {
        e.preventDefault();
        elegir(resultados[marcado]);
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div ref={caja} className="relative">
      <input
        className={inputCls}
        autoFocus={autoFocus}
        disabled={disabled}
        value={abierto ? busqueda : (elegida?.titulo ?? "")}
        placeholder={placeholder ?? "🔍 Escribe para buscar…"}
        onFocus={() => {
          setBusqueda("");
          setAbierto(true);
        }}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setAbierto(true);
        }}
        onKeyDown={teclas}
      />

      {elegida && !abierto && nota ? <p className="mt-1 text-xs text-soft">{nota(elegida)}</p> : null}

      {abierto ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-card shadow-lg">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-soft">
              {sinResultados?.(busqueda.trim()) ?? `Nada coincide con “${busqueda.trim()}”.`}
            </p>
          ) : (
            <ul ref={lista} className="max-h-64 overflow-y-auto">
              {resultados.map((o, i) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setMarcado(i)}
                    onClick={() => elegir(o)}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${
                      i === marcado ? "bg-paper" : ""
                    } ${o.id === value ? "font-semibold text-kraft-dark" : "text-ink"}`}
                  >
                    <span>
                      {o.titulo}
                      {o.detalle ? <span className="block text-xs font-normal text-soft">{o.detalle}</span> : null}
                    </span>
                    {o.derecha ? (
                      <span className="shrink-0 tabular-nums text-xs text-soft">{o.derecha}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line bg-paper/60 px-3 py-1.5 text-[11px] text-soft">
            {resultados.length} de {opciones.length}
            {unidad ? ` ${unidad}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
