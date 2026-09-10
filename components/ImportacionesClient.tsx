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
import { Badge, Card, Empty, Label, inputCls, tdCls } from "./ui";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";

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

  // Un equipo cuelga de la última carga que lo tocó, así que al volver a subir
  // el mismo archivo las cargas viejas se quedan sin equipos. No es que no
  // hayan entrado: es que ya los tiene la nueva, y hay que decirlo o parece
  // que la subida no sirvió de nada.
  const relevada = equipos.length === 0 && elegida.nuevos + elegida.actualizados > 0;

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

  const columnas = useMemo<Columna<EquipoConAsignado>[]>(
    () => [
      {
        clave: "codigo",
        titulo: "Código",
        ancho: "12%",
        valor: (e) => e.codigo,
        claseCelda: `${tdCls} whitespace-nowrap font-mono text-xs`,
      },
      {
        clave: "equipo",
        titulo: "Equipo",
        ancho: "22%",
        valor: (e) => [e.marca, e.modelo].filter(Boolean).join(" "),
        claseCelda: tdCls,
        celda: (e) => (
          <>
            <span className="font-medium">{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</span>
            <div className="text-xs text-soft">{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</div>
          </>
        ),
      },
      {
        clave: "serie",
        titulo: "Serie",
        ancho: "14%",
        valor: (e) => e.numero_serie ?? "",
        claseCelda: `${tdCls} font-mono text-xs`,
        celda: (e) => e.numero_serie || "—",
      },
      {
        clave: "asignado",
        titulo: "Asignado a",
        ancho: "20%",
        valor: (e) => e.asignado_nombre ?? "",
        claseCelda: tdCls,
        celda: (e) =>
          e.asignado_nombre ? (
            <>
              {e.asignado_nombre}
              <div className="text-xs text-soft">
                {e.asignado_numero} · {e.asignado_departamento ?? "—"}
              </div>
            </>
          ) : (
            <span className="text-soft">—</span>
          ),
      },
      {
        clave: "falta",
        titulo: "Qué le falta",
        ancho: "22%",
        valor: (e) => huecosDe(e).map((h) => h.etiqueta).join(" · ") || "Completo",
        claseCelda: tdCls,
        celda: (e) => {
          const faltan = huecosDe(e);
          return faltan.length === 0 ? (
            <Badge tono="verde">Completo</Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {faltan.map((h) => (
                <Badge key={h.clave} tono="ambar">
                  {h.etiqueta}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        clave: "completar",
        titulo: "",
        ancho: "10%",
        claseCelda: tdCls,
        celda: (e) => (
          <Link
            href={`/inventario/${e.id}`}
            className="inline-flex whitespace-nowrap rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Completar
          </Link>
        ),
      },
    ],
    []
  );

  const tabla = useTabla({ id: "importaciones", columnas, filas: visibles });

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
              {relevada
                ? "Esta carga ya la reemplazó otra más nueva"
                : completos === equipos.length
                  ? "Todo quedó completo"
                  : `${equipos.length - completos} de ${equipos.length} equipos quedaron a medias`}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-soft">
              {relevada ? (
                <>
                  Sus {elegida.nuevos + elegida.actualizados} equipos se volvieron a subir después, así que ahora
                  cuelgan de la carga más reciente. Elígela arriba para ver qué les falta; aquí solo queda constancia
                  de que esta subida se hizo.
                </>
              ) : (
                <>
                  Lo que el Excel no trae —la clasificación, y a veces el área o a quién se le entregó— el sistema no
                  lo puede adivinar. Es lo que hay que capturar a mano, y esta es la lista.
                </>
              )}
            </p>
          </div>
          <Link
            href="/inventario/ubicar"
            className="inline-flex rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Ubicar por área →
          </Link>
        </div>

        {relevada ? null : (
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
        )}
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
      {relevada ? null : (
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
            {tabla.filas.length} de {equipos.length}
          </p>
        </div>
      )}

      {relevada ? null : (
        <>
          <div className="mb-2 flex justify-end">
            <AvisoTabla estado={tabla} />
          </div>
          <div className="rounded-lg border border-line bg-card">
            <Tabla
              estado={tabla}
              claveFila={(e) => e.id}
              minAncho={900}
              vacio={
                <Empty>
                  {equipos.length === 0
                    ? "Esta carga no dejó ningún equipo en el inventario."
                    : "Ningún equipo de esta carga coincide con eso."}
                </Empty>
              }
            />
          </div>
        </>
      )}
    </>
  );
}
