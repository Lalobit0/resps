"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Label, btnGhost, btnPrimary, inputCls } from "./ui";

const ETIQUETA_ENTIDAD: Record<string, string> = {
  USUARIO: "Usuarios",
  ROL: "Roles y permisos",
  EXPEDIENTE: "Expedientes",
  DOCUMENTO: "Documentos",
  TIPO_DOC: "Tipos de documento",
  CATEGORIA: "Categorías",
  MATRIZ: "Matriz de requisitos",
};

/** Filtros de la bitácora. Van por la dirección para poder guardar la búsqueda. */
export default function BitacoraFiltros({
  entidades,
  q,
  entidad,
  denegados,
}: {
  entidades: string[];
  q: string;
  entidad: string;
  denegados: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [texto, setTexto] = useState(q);

  const ir = (cambios: Record<string, string | null>) => {
    const nuevos = new URLSearchParams(params.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    router.push(`/bitacora?${nuevos.toString()}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ir({ q: texto || null });
      }}
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <div>
        <Label>Buscar</Label>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Persona, documento, acción…"
          className={`${inputCls} w-60`}
        />
      </div>
      <div>
        <Label>Sobre qué</Label>
        <select value={entidad} onChange={(e) => ir({ entidad: e.target.value || null })} className={`${inputCls} w-52`}>
          <option value="">Todo</option>
          {entidades.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ENTIDAD[e] ?? e}
            </option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={denegados}
          onChange={(e) => ir({ denegados: e.target.checked ? "1" : null })}
          className="h-4 w-4 accent-brand-red"
        />
        Solo los intentos rechazados
      </label>
      <button type="submit" className={btnPrimary}>
        Buscar
      </button>
      {q || entidad || denegados ? (
        <button type="button" className={btnGhost} onClick={() => router.push("/bitacora")}>
          Limpiar
        </button>
      ) : null}
    </form>
  );
}
