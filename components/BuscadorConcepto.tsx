"use client";

import { useMemo } from "react";
import type { ConceptoVale } from "../lib/vales";
import { dinero } from "../lib/helpers";
import Buscador from "./Buscador";

/**
 * El concepto del vale, buscándolo por lo que uno recuerda.
 *
 * El tarifario de Recursos Humanos pasa de los treinta renglones y crece cada
 * vez que se agrega un artículo. Aquí se escribe "radio" y quedan a la vista
 * los tres que dicen radio, con su precio, que es el otro dato que hay que
 * confirmar antes de imprimir.
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
  const opciones = useMemo(
    () =>
      conceptos.map((c) => ({
        id: c.id,
        titulo: c.concepto,
        derecha: dinero(c.monto),
        buscar: `${c.concepto} ${c.monto}`,
      })),
    [conceptos]
  );

  return (
    <Buscador
      opciones={opciones}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder="🔍 Escribe para buscar: radio, botas, playera…"
      sinResultados={(q) => `Nada en el tarifario dice “${q}”. Se agrega desde el catálogo de conceptos.`}
      nota={(o) => `${o.derecha} · toca el campo para cambiarlo`}
      unidad="conceptos"
    />
  );
}
