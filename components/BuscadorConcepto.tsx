"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConceptoVale } from "../lib/vales";
import { dinero } from "../lib/helpers";
import { inputCls } from "./ui";

/**
 * El concepto del vale, buscándolo por lo que uno recuerda.
 *
 * El tarifario de Recursos Humanos pasa de los treinta renglones y crece cada
 * vez que se agrega un artículo, así que en una lista desplegable hay que
 * cazar el renglón a ojo. Aquí se escribe "radio" y quedan a la vista los tres
 * que dicen radio, con su precio, que es el otro dato que hay que confirmar
 * antes de imprimir.
 */
export default function BuscadorConcepto({
  conceptos,
  value,
  onChange,
  autoFocus,
  disabled,
}: {
  conceptos: ConceptoVale[];
  value: number | "";
  onChange: (id: number | "") => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const elegido = conceptos.find((c) => c.id === value) ?? null;

  const resultados = useMemo(() => {
    // Se busca por palabras sueltas y en cualquier orden: "radio kenwood"
    // encuentra "REP. RADIO PORTATIL KENWOOD".
    const partes = busqueda
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!partes.length) return conceptos;
    return conceptos.filter((c) => {
      const texto = `${c.concepto} ${c.monto}`.toLowerCase();
      return partes.every((p) => texto.includes(p));
    });
  }, [conceptos, busqueda]);

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

  const elegir = (c: ConceptoVale) => {
    onChange(c.id);
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
        value={abierto ? busqueda : elegido?.concepto ?? ""}
        placeholder="🔍 Escribe para buscar: radio, botas, playera…"
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

      {elegido && !abierto ? (
        <p className="mt-1 text-xs text-soft">
          {dinero(elegido.monto)} · toca el campo para cambiarlo
        </p>
      ) : null}

      {abierto ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-card shadow-lg">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-soft">
              Nada en el tarifario dice “{busqueda.trim()}”. Se agrega desde el catálogo de conceptos.
            </p>
          ) : (
            <ul ref={lista} className="max-h-64 overflow-y-auto">
              {resultados.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setMarcado(i)}
                    onClick={() => elegir(c)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                      i === marcado ? "bg-paper" : ""
                    } ${c.id === value ? "font-semibold text-kraft-dark" : "text-ink"}`}
                  >
                    <span>{c.concepto}</span>
                    <span className="shrink-0 tabular-nums text-xs text-soft">{dinero(c.monto)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line bg-paper/60 px-3 py-1.5 text-[11px] text-soft">
            {resultados.length} de {conceptos.length} conceptos
          </p>
        </div>
      ) : null}
    </div>
  );
}
