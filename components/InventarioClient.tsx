"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { EquipoConAsignado } from "../lib/types";
import { CAMPOS_DETALLE, ETIQUETA_ESTADO, ETIQUETA_TIPO, TIPOS_EQUIPO, type TipoEquipo } from "../lib/constants";
import { dinero, fechaCorta } from "../lib/helpers";
import { eliminarEquipo, guardarEquipo, importarInventario } from "../app/inventario/actions";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls, tonoEstadoEquipo } from "./ui";

type Formulario = {
  id?: number;
  tipo: TipoEquipo;
  codigo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  fecha_compra: string;
  costo: string;
  estado: string;
  notas: string;
  detalles: Record<string, string>;
};

const FORM_VACIO: Formulario = {
  tipo: "COMPUTO",
  codigo: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  fecha_compra: "",
  costo: "",
  estado: "DISPONIBLE",
  notas: "",
  detalles: {},
};

function parseDetalles(d: string | null): Record<string, string> {
  try {
    return d ? (JSON.parse(d) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const IMPORTABLES: { tipo: TipoEquipo; etiqueta: string }[] = [
  { tipo: "COMPUTO", etiqueta: "Cómputo" },
  { tipo: "CELULAR", etiqueta: "Teléfonos" },
  { tipo: "RADIO", etiqueta: "Radios" },
];

export default function InventarioClient({ equipos }: { equipos: EquipoConAsignado[] }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const tipoImport = useRef<TipoEquipo>("COMPUTO");

  const setC = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const setDetalle = (clave: string) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, detalles: { ...f.detalles, [clave]: ev.target.value } } : f));

  const enviar = () => {
    if (!form) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await guardarEquipo(form);
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const abrirImport = (tipo: TipoEquipo) => {
    tipoImport.current = tipo;
    fileRef.current?.click();
  };

  const importar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    fd.append("archivo", archivo);
    const tipo = tipoImport.current;
    iniciar(async () => {
      const res = await importarInventario(tipo, fd);
      if (res.ok) setMensaje(res.mensaje ?? "Inventario importado.");
      else setError(res.error ?? "No se pudo importar.");
    });
  };

  const camposDetalle = form ? CAMPOS_DETALLE[form.tipo] : [];

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btnPrimary}
          onClick={() => {
            setForm({ ...FORM_VACIO, detalles: {} });
            setError("");
            setMensaje("");
          }}
        >
          + Registrar equipo
        </button>
        <span className="mx-1 text-xs text-soft">Importar Excel:</span>
        {IMPORTABLES.map((imp) => (
          <button key={imp.tipo} className={btnGhost} disabled={pendiente} onClick={() => abrirImport(imp.tipo)}>
            ↥ {imp.etiqueta}
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
      </div>

      {form ? (
        <Card>
          <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar equipo" : "Nuevo equipo"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Tipo de equipo *</Label>
              <select className={inputCls} value={form.tipo} onChange={setC("tipo")}>
                {TIPOS_EQUIPO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Código interno</Label>
              <input className={`${inputCls} mono`} value={form.codigo} onChange={setC("codigo")} placeholder="Vacío = se genera solo" />
            </div>
            <div>
              <Label>Estado</Label>
              <select className={inputCls} value={form.estado} onChange={setC("estado")}>
                <option value="DISPONIBLE">Disponible</option>
                <option value="MANTENIMIENTO">En mantenimiento</option>
                <option value="BAJA">Baja</option>
                {form.estado === "ASIGNADO" ? <option value="ASIGNADO">Asignado (cámbialo a Disponible para liberar)</option> : null}
              </select>
            </div>
            <div>
              <Label>Marca</Label>
              <input className={inputCls} value={form.marca} onChange={setC("marca")} placeholder="Dell, HP, TXPRO…" />
            </div>
            <div>
              <Label>Modelo</Label>
              <input className={inputCls} value={form.modelo} onChange={setC("modelo")} />
            </div>
            <div>
              <Label>Número de serie</Label>
              <input className={`${inputCls} mono`} value={form.numero_serie} onChange={setC("numero_serie")} />
            </div>

            {camposDetalle.map((c) => (
              <div key={c.clave}>
                <Label>{c.etiqueta}</Label>
                <input className={inputCls} value={form.detalles[c.clave] ?? ""} onChange={setDetalle(c.clave)} />
              </div>
            ))}

            <div>
              <Label>Fecha de compra</Label>
              <input className={inputCls} type="date" value={form.fecha_compra} onChange={setC("fecha_compra")} />
            </div>
            <div>
              <Label>Costo (MXN)</Label>
              <input className={inputCls} type="number" step="0.01" value={form.costo} onChange={setC("costo")} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notas</Label>
              <textarea className={inputCls} rows={2} value={form.notas} onChange={setC("notas")} />
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
        <Empty>No hay equipos con estos filtros. Registra uno nuevo o importa tu Excel.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Tipo</th>
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
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</td>
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
                            tipo: ((TIPOS_EQUIPO as readonly string[]).includes(e.tipo) ? e.tipo : "OTRO") as TipoEquipo,
                            codigo: e.codigo,
                            marca: e.marca,
                            modelo: e.modelo,
                            numero_serie: e.numero_serie ?? "",
                            fecha_compra: e.fecha_compra ?? "",
                            costo: e.costo !== null ? String(e.costo) : "",
                            estado: e.estado,
                            notas: e.notas ?? "",
                            detalles: parseDetalles(e.detalles),
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
