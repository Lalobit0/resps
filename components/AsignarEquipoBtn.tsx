"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Equipo } from "../lib/types";
import {
  CAMPOS_DETALLE,
  ETIQUETA_TIPO,
  OPCIONES_MARCA_COMPUTO,
  PRECIO_POR_PLAN,
  TIPOS_EQUIPO,
  type TipoEquipo,
} from "../lib/constants";
import { asignarEquipo, altaYAsignarEquipo } from "../app/empleados/actions";
import SelectConOtro from "./SelectConOtro";
import { Card, Label, btnGhost, btnPrimary, inputCls } from "./ui";

type Nuevo = {
  tipo: TipoEquipo;
  codigo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  fecha_compra: string;
  costo: string;
  notas: string;
  detalles: Record<string, string>;
};

const NUEVO_VACIO: Nuevo = {
  tipo: "COMPUTO",
  codigo: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  fecha_compra: "",
  costo: "",
  notas: "",
  detalles: {},
};

/**
 * Entrega un equipo al empleado sin salir de su ficha: puede ser uno que ya
 * está libre en el inventario o uno que se da de alta en ese momento. En los
 * dos casos el equipo queda en el inventario, asignado, y de inmediato se
 * ofrece generar su carta responsiva.
 */
export default function AsignarEquipoBtn({
  empleadoId,
  disponibles,
}: {
  empleadoId: number;
  disponibles: Equipo[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"existente" | "nuevo">("existente");
  const [filtro, setFiltro] = useState("");
  const [elegido, setElegido] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState<Nuevo>(NUEVO_VACIO);
  const [error, setError] = useState("");
  const [listo, setListo] = useState<{ equipoId: number; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return disponibles;
    return disponibles.filter((e) =>
      [e.codigo, ETIQUETA_TIPO[e.tipo] ?? e.tipo, e.marca, e.modelo, e.numero_serie ?? "", e.specs ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [disponibles, filtro]);

  const cerrar = () => {
    setAbierto(false);
    setError("");
    setListo(null);
    setElegido(null);
    setFiltro("");
    setNuevo(NUEVO_VACIO);
    setModo("existente");
  };

  const ponerDetalle = (clave: string, valor: string) =>
    setNuevo((n) => {
      const detalles = { ...n.detalles, [clave]: valor };
      // Al elegir el plan se autollena su precio del tarifario.
      if (clave === "plan" && PRECIO_POR_PLAN[valor]) detalles.plan_precio = PRECIO_POR_PLAN[valor];
      return { ...n, detalles };
    });

  const guardar = () => {
    setError("");
    iniciar(async () => {
      const res =
        modo === "existente"
          ? elegido
            ? await asignarEquipo(empleadoId, elegido)
            : { ok: false, error: "Elige el equipo que se le entrega." }
          : await altaYAsignarEquipo(empleadoId, nuevo);
      if (res.ok && res.id) {
        setListo({ equipoId: res.id, mensaje: res.mensaje ?? "Equipo asignado." });
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo asignar el equipo.");
      }
    });
  };

  if (!abierto) {
    return (
      <button className={btnPrimary} onClick={() => setAbierto(true)}>
        + Asignar equipo
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <Card className="my-6 w-full max-w-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-ink">Asignar equipo al empleado</h2>
          <button className={btnGhost} onClick={cerrar} disabled={pendiente}>
            ✕ Cerrar
          </button>
        </div>

        {listo ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p>✅ {listo.mensaje}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className={btnPrimary} href={`/responsivas/nueva?equipo=${listo.equipoId}`}>
                Generar su responsiva
              </Link>
              <Link className={btnGhost} href={`/responsivas/cargar?empleado=${empleadoId}&equipo=${listo.equipoId}`}>
                Cargar una ya firmada
              </Link>
              <button className={btnGhost} onClick={cerrar}>
                Después
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex gap-2 text-xs">
              {(
                [
                  ["existente", "Ya está en el inventario"],
                  ["nuevo", "Es un equipo nuevo"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setModo(valor)}
                  className={`rounded-md border px-3 py-1.5 ${
                    modo === valor ? "border-kraft bg-orange-50 font-semibold text-kraft-dark" : "border-line bg-white"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            ) : null}

            {modo === "existente" ? (
              disponibles.length === 0 ? (
                <div className="rounded-md border border-line bg-paper/60 px-4 py-6 text-center text-sm text-soft">
                  No hay equipos libres en el inventario. Usa <b>Es un equipo nuevo</b> para darlo de alta.
                </div>
              ) : (
                <>
                  <input
                    className={`${inputCls} mb-2`}
                    placeholder="Filtrar por código, marca, modelo o serie…"
                    value={filtro}
                    onChange={(ev) => setFiltro(ev.target.value)}
                  />
                  <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
                    {filtrados.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setElegido(e.id)}
                        className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                          elegido === e.id ? "border-kraft bg-orange-50/70" : "border-line bg-white hover:bg-paper/60"
                        }`}
                      >
                        <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                        <span className="font-medium">
                          {e.marca} {e.modelo}
                        </span>
                        <div className="text-xs text-soft">
                          {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                          {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                          {e.specs ? ` · ${e.specs}` : ""}
                        </div>
                      </button>
                    ))}
                    {filtrados.length === 0 ? <p className="px-1 py-3 text-sm text-soft">Nada coincide con el filtro.</p> : null}
                  </div>
                </>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Tipo de equipo *</Label>
                  <select
                    className={inputCls}
                    value={nuevo.tipo}
                    onChange={(ev) => setNuevo((n) => ({ ...n, tipo: ev.target.value as TipoEquipo, detalles: {} }))}
                  >
                    {TIPOS_EQUIPO.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Código interno</Label>
                  <input
                    className={`${inputCls} mono`}
                    value={nuevo.codigo}
                    onChange={(ev) => setNuevo((n) => ({ ...n, codigo: ev.target.value }))}
                    placeholder="Vacío = se genera solo"
                  />
                </div>
                <div>
                  <Label>Marca</Label>
                  {nuevo.tipo === "COMPUTO" ? (
                    <SelectConOtro
                      value={nuevo.marca}
                      onChange={(v) => setNuevo((n) => ({ ...n, marca: v }))}
                      opciones={OPCIONES_MARCA_COMPUTO}
                      permitirOtro
                      placeholder="Escribe la marca"
                    />
                  ) : (
                    <input
                      className={inputCls}
                      value={nuevo.marca}
                      onChange={(ev) => setNuevo((n) => ({ ...n, marca: ev.target.value }))}
                      placeholder="Dell, HP, TXPRO…"
                    />
                  )}
                </div>
                <div>
                  <Label>Modelo</Label>
                  <input
                    className={inputCls}
                    value={nuevo.modelo}
                    onChange={(ev) => setNuevo((n) => ({ ...n, modelo: ev.target.value }))}
                  />
                </div>
                <div>
                  <Label>Número de serie</Label>
                  <input
                    className={`${inputCls} mono`}
                    value={nuevo.numero_serie}
                    onChange={(ev) => setNuevo((n) => ({ ...n, numero_serie: ev.target.value }))}
                  />
                </div>

                {CAMPOS_DETALLE[nuevo.tipo].map((c) => {
                  const val = nuevo.detalles[c.clave] ?? "";
                  return (
                    <div key={c.clave}>
                      <Label>{c.etiqueta}</Label>
                      {c.opciones ? (
                        <SelectConOtro
                          value={val}
                          onChange={(v) => ponerDetalle(c.clave, v)}
                          opciones={c.opciones}
                          permitirOtro={c.permitirOtro}
                        />
                      ) : (
                        <input className={inputCls} value={val} onChange={(ev) => ponerDetalle(c.clave, ev.target.value)} />
                      )}
                    </div>
                  );
                })}

                <div>
                  <Label>Fecha de compra</Label>
                  <input
                    className={inputCls}
                    type="date"
                    value={nuevo.fecha_compra}
                    onChange={(ev) => setNuevo((n) => ({ ...n, fecha_compra: ev.target.value }))}
                  />
                </div>
                <div>
                  <Label>Costo (MXN)</Label>
                  <input
                    className={inputCls}
                    type="number"
                    step="0.01"
                    value={nuevo.costo}
                    onChange={(ev) => setNuevo((n) => ({ ...n, costo: ev.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label>Notas</Label>
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={nuevo.notas}
                    onChange={(ev) => setNuevo((n) => ({ ...n, notas: ev.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
                {pendiente ? "Asignando…" : modo === "existente" ? "Asignar al empleado" : "Dar de alta y asignar"}
              </button>
              <button className={btnGhost} onClick={cerrar} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
