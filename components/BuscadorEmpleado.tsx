"use client";

import { useMemo, useState } from "react";
import type { Empleado } from "../lib/types";
import { inputCls } from "./ui";

export default function BuscadorEmpleado({
  empleados,
  value,
  onChange,
}: {
  empleados: Empleado[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);

  const seleccionado = empleados.find((e) => e.id === value) ?? null;

  const ordenados = useMemo(
    () =>
      [...empleados].sort(
        (a, b) =>
          (parseInt(a.numero_empleado, 10) || 0) - (parseInt(b.numero_empleado, 10) || 0) ||
          a.nombre.localeCompare(b.nombre)
      ),
    [empleados]
  );

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const base = q
      ? ordenados.filter((e) => `${e.numero_empleado} ${e.nombre}`.toLowerCase().includes(q))
      : ordenados;
    return base.slice(0, 60);
  }, [ordenados, texto]);

  if (seleccionado && !abierto) {
    return (
      <button
        type="button"
        className={`${inputCls} flex w-full items-center justify-between text-left`}
        onClick={() => {
          setAbierto(true);
          setTexto("");
        }}
      >
        <span>
          <span className="mono text-xs text-kraft-dark">{seleccionado.numero_empleado}</span> · {seleccionado.nombre}
        </span>
        <span className="text-soft">▾</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus={abierto}
        className={`${inputCls} w-full`}
        placeholder="🔍 Busca por número o nombre…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-sm text-soft">Sin resultados.</div>
          ) : (
            filtrados.map((e) => (
              <button
                key={e.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(e.id);
                  setAbierto(false);
                  setTexto("");
                }}
              >
                <span className="mono text-xs text-kraft-dark">{e.numero_empleado}</span> · {e.nombre}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
