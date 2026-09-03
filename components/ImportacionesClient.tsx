"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ETIQUETA_ORIGEN,
  HUECOS,
  conteoDeHuecos,
  huecosDe,
  type Importacion,
  type RenglonOmitido,
} from "../lib/importaciones-comun";
import { ETIQUETA_TIPO } from "../lib/constants";
import type { EquipoConAsignado } from "../lib/types";
import { Badge, Card, Empty, Label, inputCls, tdCls, thCls } from "./ui";

/**
 * La revisión de una carga de Excel.
 *
 * La pregunta que contesta no es "qué subí" sino "qué me falta de lo que
 * subí": el Excel de origen casi nunca trae el área, la clasificación ni a
 * quién se le entregó, y eso queda como trabajo pendiente que hasta ahora se
 * perdía entre todo el inventario.
 */
export default function ImportacionesClient({
  lista,
  elegida,
  equipos,
  omitidos,
}: {
  lista: Importacion[];
  elegida: Importacion;
  equipos: EquipoConAsignado[];
  omitidos: RenglonOmitido[];
}) {
  const router = useRouter();
  const [hueco, setHueco] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const conteo = useMemo(() => conteoDeHuecos(equipos), [equipos]);
  const completos = useMemo(() => equipos.filter((e) => huecosDe(e).length === 0).length, [equipos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return equipos.filter((e) => {
      if (hueco && !huecosDe(e).some((h) => h.clave === hueco)) return false;
      if (!q) return true;
      return `${e.codigo} ${e.marca} ${e.modelo} ${e.numero_serie ?? ""} ${e.asignado_nombre ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [equipos, hueco, busqueda]);

  const pastillas = [
    { clave: "", etiqueta: "Todos", valor: equipos.length, tono: "" },
    ...HUECOS.filter((h) => conteo[h.clave]).map((h) => ({
      clave: h.clave,
      etiqueta: h.etiqueta.replace(/^Sin /, ""),
      valor: conteo[h.clave],
      tono: "text-amber-700",
    })),
  ];

  return (
    <>
      {/* --- Qué carga se está viendo --- */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <Label>Carga</Label>
          <select
            value={elegida.id}
            onChange={(e) => router.push(`/inventario/importaciones?id=${e.target.value}`)}
            className={`${inputCls} w-96`}
          >
            {lista.map((i) => (
              <option key={i.id} value={i.id}>
                {i.fecha} · {ETIQUETA_ORIGEN[i.tipo] ?? i.tipo}
                {i.archivo ? ` · ${i.archivo}` : ""} ({i.nuevos + i.actualizados} equipos)
              </option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-sm text-soft">
          {elegida.renglones} renglones leídos · {elegida.nuevos} nuevos · {elegida.actualizados} actualizados ·{" "}
          {elegida.vinculados} ligados a empleado
          {elegida.usuario ? ` · la subió ${elegida.usuario}` : ""}
        </p>
      </div>

      {/* --- Cuánto falta por capturar --- */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">
              {completos === equipos.length ? "Todo quedó completo" : `${equipos.length - completos} de ${equipos.length} equipos quedaron a medias`}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-soft">
              El Excel casi nunca trae el área, la clasificación ni a quién se le entregó. Eso no lo puede adivinar el
              sistema: es lo que hay que capturar a mano, y esta es la lista.
            </p>
          </div>
          <Link
            href="/inventario/ubicar"
            className="inline-flex rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Ubicar por área →
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {pastillas.map((p) => {
            const activa = hueco === p.clave;
            return (
              <button
                key={p.etiqueta}
                onClick={() => setHueco(p.clave)}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  activa ? "border-kraft bg-white shadow-sm" : "border-line bg-paper/60 hover:border-kraft/50"
                }`}
              >
                <span className={`text-lg font-bold tabular-nums ${p.tono || "text-ink"}`}>{p.valor}</span>
                <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-soft">{p.etiqueta}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* --- Los renglones que no entraron --- */}
      {omitidos.length > 0 ? (
        <Card className="mb-5 border-amber-300 bg-amber-50">
          <h2 className="font-bold text-amber-900">
            {omitidos.length} {omitidos.length === 1 ? "renglón no entró" : "renglones no entraron"}
          </h2>
          <ul className="mt-3 space-y-2">
            {omitidos.map((o) => (
              <li key={o.renglon} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-ink">Renglón {o.renglon} del Excel</span>
                <span className="text-soft"> · {o.motivo}</span>
                {Object.keys(o.datos).length ? (
                  <div className="mt-1 font-mono text-[11px] text-soft">
                    {Object.entries(o.datos)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-soft">Venía completamente vacío.</div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- La lista --- */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>Buscar en esta carga</Label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código, marca, serie, empleado…"
            className={`${inputCls} w-72`}
          />
        </div>
        <p className="pb-2 text-sm text-soft">
          {visibles.length} de {equipos.length}
        </p>
      </div>

      {equipos.length === 0 ? (
        <Empty>Esta carga no dejó ningún equipo en el inventario.</Empty>
      ) : visibles.length === 0 ? (
        <Empty>Ningún equipo de esta carga coincide con eso.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full">
            <thead className="border-b border-line bg-paper/60">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>Serie</th>
                <th className={thCls}>Asignado a</th>
                <th className={thCls}>Qué le falta</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((e) => {
                const faltan = huecosDe(e);
                return (
                  <tr key={e.id} className="hover:bg-paper/40">
                    <td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{e.codigo}</td>
                    <td className={tdCls}>
                      <span className="font-medium">
                        {[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}
                      </span>
                      <div className="text-xs text-soft">{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</div>
                    </td>
                    <td className={`${tdCls} font-mono text-xs`}>{e.numero_serie || "—"}</td>
                    <td className={tdCls}>
                      {e.asignado_nombre ? (
                        <>
                          {e.asignado_nombre}
                          <div className="text-xs text-soft">
                            {e.asignado_numero} · {e.asignado_departamento ?? "—"}
                          </div>
                        </>
                      ) : (
                        <span className="text-soft">—</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {faltan.length === 0 ? (
                        <Badge tono="verde">Completo</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {faltan.map((h) => (
                            <Badge key={h.clave} tono="ambar">
                              {h.etiqueta}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={tdCls}>
                      <Link
                        href={`/inventario/${e.id}`}
                        className="inline-flex whitespace-nowrap rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
                      >
                        Completar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
