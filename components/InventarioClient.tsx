"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { EquipoConAsignado } from "../lib/types";
import { CATEGORIAS, ETIQUETA_ESTADO } from "../lib/constants";
import { dinero, fechaCorta } from "../lib/helpers";
import { eliminarEquipo, guardarEquipo } from "../app/inventario/actions";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls, tonoEstadoEquipo } from "./ui";

type Formulario = {
  id?: number;
  codigo: string;
  categoria: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  specs: string;
  fecha_compra: string;
  costo: string;
  estado: string;
  notas: string;
};

const FORM_VACIO: Formulario = {
  codigo: "",
  categoria: "Laptop",
  marca: "",
  modelo: "",
  numero_serie: "",
  specs: "",
  fecha_compra: "",
  costo: "",
  estado: "DISPONIBLE",
  notas: "",
};

export default function InventarioClient({ equipos }: { equipos: EquipoConAsignado[] }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const set = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const enviar = () => {
    if (!form) return;
    setError("");
    iniciar(async () => {
      const res = await guardarEquipo(form);
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div>
        <button
          className={btnPrimary}
          onClick={() => {
            setForm(FORM_VACIO);
            setError("");
          }}
        >
          + Registrar equipo
        </button>
      </div>

      {form ? (
        <Card>
          <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar equipo" : "Nuevo equipo"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Categoría *</Label>
              <select className={inputCls} value={form.categoria} onChange={set("categoria")}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Código interno</Label>
              <input className={`${inputCls} mono`} value={form.codigo} onChange={set("codigo")} placeholder="Vacío = se genera solo" />
            </div>
            <div>
              <Label>Estado</Label>
              <select className={inputCls} value={form.estado} onChange={set("estado")} disabled={form.estado === "ASIGNADO"}>
                <option value="DISPONIBLE">Disponible</option>
                <option value="MANTENIMIENTO">En mantenimiento</option>
                <option value="BAJA">Baja</option>
                {form.estado === "ASIGNADO" ? <option value="ASIGNADO">Asignado (vía responsiva)</option> : null}
              </select>
            </div>
            <div>
              <Label>Marca *</Label>
              <input className={inputCls} value={form.marca} onChange={set("marca")} placeholder="Dell, HP, Samsung…" />
            </div>
            <div>
              <Label>Modelo *</Label>
              <input className={inputCls} value={form.modelo} onChange={set("modelo")} />
            </div>
            <div>
              <Label>Número de serie</Label>
              <input className={`${inputCls} mono`} value={form.numero_serie} onChange={set("numero_serie")} />
            </div>
            <div>
              <Label>Fecha de compra</Label>
              <input className={inputCls} type="date" value={form.fecha_compra} onChange={set("fecha_compra")} />
            </div>
            <div>
              <Label>Costo (MXN)</Label>
              <input className={inputCls} type="number" step="0.01" value={form.costo} onChange={set("costo")} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Label>Especificaciones</Label>
              <input className={inputCls} value={form.specs} onChange={set("specs")} placeholder="i5 · 16 GB RAM · 512 GB SSD" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notas</Label>
              <textarea className={inputCls} rows={2} value={form.notas} onChange={set("notas")} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar equipo"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      {equipos.length === 0 ? (
        <Empty>No hay equipos con estos filtros. Registra uno nuevo o ajusta la búsqueda.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Categoría</th>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>Serie</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Asignado a</th>
                <th className={thCls}>Compra</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{e.codigo}</td>
                  <td className={tdCls}>{e.categoria}</td>
                  <td className={tdCls}>
                    <div className="font-medium">
                      {e.marca} {e.modelo}
                    </div>
                    {e.specs ? <div className="text-xs text-soft">{e.specs}</div> : null}
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{e.numero_serie ?? "—"}</td>
                  <td className={tdCls}>
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                  </td>
                  <td className={tdCls}>{e.asignado_nombre ?? <span className="text-soft">—</span>}</td>
                  <td className={`${tdCls} text-xs text-soft`}>
                    {fechaCorta(e.fecha_compra)}
                    {e.costo !== null ? <div>{dinero(e.costo)}</div> : null}
                  </td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={btnGhost}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            codigo: e.codigo,
                            categoria: e.categoria,
                            marca: e.marca,
                            modelo: e.modelo,
                            numero_serie: e.numero_serie ?? "",
                            specs: e.specs ?? "",
                            fecha_compra: e.fecha_compra ?? "",
                            costo: e.costo !== null ? String(e.costo) : "",
                            estado: e.estado,
                            notas: e.notas ?? "",
                          })
                        }
                      >
                        Editar
                      </button>
                      <Link className={btnGhost} href={`/mantenimientos?equipo=${e.id}`}>
                        Historial
                      </Link>
                      <button
                        className={btnDanger}
                        disabled={pendiente}
                        onClick={() => {
                          if (confirm(`¿Eliminar el equipo ${e.codigo}?`)) {
                            setError("");
                            iniciar(async () => {
                              const res = await eliminarEquipo(e.id);
                              if (!res.ok) setError(res.error ?? "Error desconocido.");
                            });
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
