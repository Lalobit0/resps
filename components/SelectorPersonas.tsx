"use client";

import { useMemo, useState } from "react";
import { Badge, inputCls } from "./ui";

export type PersonaOpcion = {
  numero_empleado: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
};

/**
 * A quiénes en particular se les pide un documento.
 *
 * Casi todo se resuelve por puesto o por área, pero siempre queda el caso
 * suelto —el chofer que sí maneja el tractocamión, el que trae cartilla
 * militar y los demás no—. Aquí se busca a la persona y se ve su puesto antes
 * de elegirla, que es lo que evita ponerle el documento al homónimo.
 *
 * Cada elegido viaja como un campo `empleados` del formulario, para que el
 * servidor arme una regla por cabeza.
 */
export default function SelectorPersonas({
  personas,
  iniciales = [],
}: {
  personas: PersonaOpcion[];
  iniciales?: string[];
}) {
  const [elegidos, setElegidos] = useState<string[]>(iniciales);
  const [busqueda, setBusqueda] = useState("");

  const porNumero = useMemo(
    () => new Map(personas.map((p) => [p.numero_empleado, p])),
    [personas]
  );

  const resultados = useMemo(() => {
    const partes = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!partes.length) return [];
    return personas
      .filter((p) => {
        if (elegidos.includes(p.numero_empleado)) return false;
        const texto = `${p.numero_empleado} ${p.nombre} ${p.puesto ?? ""} ${p.departamento ?? ""}`.toLowerCase();
        return partes.every((t) => texto.includes(t));
      })
      .slice(0, 40);
  }, [personas, busqueda, elegidos]);

  const agregar = (numero: string) => {
    setElegidos((e) => (e.includes(numero) ? e : [...e, numero]));
    setBusqueda("");
  };

  return (
    <div>
      {elegidos.map((n) => (
        <input key={n} type="hidden" name="empleados" value={n} />
      ))}

      {elegidos.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {elegidos.map((n) => {
            const p = porNumero.get(n);
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setElegidos((e) => e.filter((x) => x !== n))}
                  title="Quitar de la lista"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-left text-xs hover:border-red-300 hover:bg-red-50"
                >
                  <span>
                    <span className="font-medium text-ink">{p?.nombre ?? n}</span>
                    <span className="block text-[11px] text-soft">
                      {n}
                      {p?.puesto ? ` · ${p.puesto}` : ""}
                    </span>
                  </span>
                  <span className="text-soft">✕</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔍 Busca por nombre, número o puesto…"
        className={inputCls}
      />

      {busqueda.trim() ? (
        resultados.length === 0 ? (
          <p className="mt-1 text-xs text-soft">
            Nadie de la plantilla coincide con “{busqueda.trim()}”{elegidos.length ? " y falte por elegir" : ""}.
          </p>
        ) : (
          <ul className="mt-1 max-h-52 overflow-y-auto rounded-md border border-line bg-card">
            {resultados.map((p) => (
              <li key={p.numero_empleado}>
                <button
                  type="button"
                  onClick={() => agregar(p.numero_empleado)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-ink hover:bg-paper"
                >
                  <span>
                    {p.nombre}
                    <span className="block text-xs text-soft">
                      {p.numero_empleado}
                      {p.departamento ? ` · ${p.departamento}` : ""}
                    </span>
                  </span>
                  {p.puesto ? <Badge tono="gris">{p.puesto}</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="mt-1 text-xs text-soft">
          {elegidos.length === 0
            ? "Escribe para buscar a quién se le va a pedir."
            : `${elegidos.length} ${elegidos.length === 1 ? "persona elegida" : "personas elegidas"} · cada una queda con su propia regla.`}
        </p>
      )}
    </div>
  );
}
