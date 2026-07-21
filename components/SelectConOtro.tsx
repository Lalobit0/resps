"use client";

import { useState } from "react";
import type { OpcionCampo } from "../lib/constants";
import { inputCls } from "./ui";

/**
 * Lista desplegable con opción de "Otro (escribir)…" para capturar un valor
 * libre. Si el valor actual no está en la lista, se conserva: como texto libre
 * (cuando se permite "otro") o como una opción extra visible.
 */
export default function SelectConOtro({
  value,
  onChange,
  opciones,
  permitirOtro = false,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: OpcionCampo[];
  permitirOtro?: boolean;
  placeholder?: string;
}) {
  const enLista = opciones.some((o) => o.valor === value);
  const [modoOtro, setModoOtro] = useState(false);
  const usarTexto = permitirOtro && (modoOtro || (value !== "" && !enLista));

  return (
    <div className="space-y-1.5">
      <select
        className={inputCls}
        value={usarTexto ? "__otro__" : value}
        onChange={(e) => {
          if (e.target.value === "__otro__") {
            setModoOtro(true);
            onChange("");
          } else {
            setModoOtro(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">— Selecciona —</option>
        {!permitirOtro && value !== "" && !enLista ? <option value={value}>{value}</option> : null}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
        {permitirOtro ? <option value="__otro__">Otro (escribir)…</option> : null}
      </select>
      {usarTexto ? (
        <input
          autoFocus
          className={inputCls}
          value={value}
          placeholder={placeholder ?? "Escribe el valor"}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
