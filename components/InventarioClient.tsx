"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { EquipoConAsignado } from "../lib/types";
import { CAMPOS_DETALLE, ETIQUETA_ESTADO, ETIQUETA_TIPO, OPCIONES_MARCA_COMPUTO, PRECIO_POR_PLAN, TIPOS_EQUIPO, type TipoEquipo } from "../lib/constants";
import { dinero, fechaCorta } from "../lib/helpers";
import type { Conflicto } from "../lib/duplicados";
import { eliminarEquipo, guardarEquipo, importarInventario } from "../app/inventario/actions";
import SelectConOtro from "./SelectConOtro";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls, tonoEstadoEquipo } from "./ui";

const tdc = "px-2 py-1.5 text-sm text-ink align-middle";
const thc = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft whitespace-nowrap";
const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniDanger = "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50";

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

/** Resumen legible de por qué un equipo está marcado como duplicado. */
function textoConflictos(conflictos: Conflicto[]): string {
  return conflictos.map((c) => `Mismo ${c.etiqueta} (${c.valor}) que ${c.otros.join(", ")}`).join("\n");
}

export type ResponsivaDeEquipo = {
  id: number;
  folio: string;
  tipo: string;
  clase: string;
  fecha: string;
  estado: string;
  pdf_path: string | null;
  empleado_numero: string;
  empleado_nombre: string;
};

/** Datos de un equipo pasados al formulario de edición. */
function formDeEquipo(e: EquipoConAsignado): Formulario {
  return {
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
  };
}

export default function InventarioClient({
  equipos,
  duplicados = {},
  sinResponsiva = [],
  responsivas = {},
  editarId = null,
}: {
  equipos: EquipoConAsignado[];
  duplicados?: Record<number, Conflicto[]>;
  sinResponsiva?: number[];
  responsivas?: Record<number, ResponsivaDeEquipo[]>;
  editarId?: number | null;
}) {
  const faltaResponsiva = new Set(sinResponsiva);
  // Con ?editar=<id> el formulario se abre solo: así se puede editar un equipo
  // desde la ficha del empleado sin tener que buscarlo aquí.
  const [form, setForm] = useState<Formulario | null>(() => {
    const e = editarId ? equipos.find((x) => x.id === editarId) : undefined;
    return e ? formDeEquipo(e) : null;
  });
  const [verEq, setVerEq] = useState<EquipoConAsignado | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const tipoImport = useRef<TipoEquipo>("COMPUTO");

  const setC = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const ponerDetalle = (clave: string, valor: string) =>
    setForm((f) => {
      if (!f) return f;
      const detalles = { ...f.detalles, [clave]: valor };
      // Al elegir el plan se autollena su precio del tarifario.
      if (clave === "plan" && PRECIO_POR_PLAN[valor]) detalles.plan_precio = PRECIO_POR_PLAN[valor];
      return { ...f, detalles };
    });
  const setDetalle = (clave: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    ponerDetalle(clave, ev.target.value);
  const setMarca = (v: string) => setForm((f) => (f ? { ...f, marca: v } : f));

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
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
        <Card className="my-6 w-full max-w-4xl">
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
              {form.tipo === "COMPUTO" ? (
                <SelectConOtro value={form.marca} onChange={setMarca} opciones={OPCIONES_MARCA_COMPUTO} permitirOtro placeholder="Escribe la marca" />
              ) : (
                <input className={inputCls} value={form.marca} onChange={setC("marca")} placeholder="Dell, HP, TXPRO…" />
              )}
            </div>
            <div>
              <Label>Modelo</Label>
              <input className={inputCls} value={form.modelo} onChange={setC("modelo")} />
            </div>
            <div>
              <Label>Número de serie</Label>
              <input className={`${inputCls} mono`} value={form.numero_serie} onChange={setC("numero_serie")} />
            </div>

            {camposDetalle.map((c) => {
              const val = form.detalles[c.clave] ?? "";
              return (
                <div key={c.clave}>
                  <Label>{c.etiqueta}</Label>
                  {c.opciones ? (
                    <SelectConOtro value={val} onChange={(v) => ponerDetalle(c.clave, v)} opciones={c.opciones} permitirOtro={c.permitirOtro} />
                  ) : (
                    <input className={inputCls} value={val} onChange={setDetalle(c.clave)} />
                  )}
                </div>
              );
            })}

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
        </div>
      ) : null}

      {equipos.length === 0 ? (
        <Empty>No hay equipos con estos filtros. Registra uno nuevo o importa tu Excel.</Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thc}>Código</th>
                <th className={thc}>Tipo</th>
                <th className={thc}>Equipo</th>
                <th className={thc}>Serie</th>
                <th className={thc}>Estado</th>
                <th className={thc}>Asignado a</th>
                <th className={thc}>Responsivas</th>
                <th className={thc}>Compra</th>
                <th className={thc}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className={`${tdc} text-xs font-semibold`}>
                    <div className="flex items-center gap-1">
                      <span className="mono truncate" title={e.codigo}>
                        {e.codigo}
                      </span>
                      {duplicados[e.id] ? (
                        <span
                          className="shrink-0 cursor-help text-amber-600"
                          title={textoConflictos(duplicados[e.id])}
                          aria-label="Datos repetidos"
                        >
                          ⚠️
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={`${tdc} truncate text-xs`}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</td>
                  <td className={`${tdc} truncate`} title={`${e.marca} ${e.modelo}${e.specs ? " · " + e.specs : ""}`}>
                    <div className="truncate font-medium">
                      {e.marca} {e.modelo}
                    </div>
                    {e.specs ? <div className="truncate text-xs text-soft">{e.specs}</div> : null}
                  </td>
                  <td className={`${tdc} mono truncate text-xs`} title={e.numero_serie ?? ""}>{e.numero_serie ?? "—"}</td>
                  <td className={tdc}>
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                    {faltaResponsiva.has(e.id) ? (
                      <div className="mt-1">
                        <Badge tono="petrol">Sin responsiva</Badge>
                      </div>
                    ) : null}
                  </td>
                  <td className={`${tdc} truncate text-xs`} title={e.asignado_nombre ? `${e.asignado_numero} ${e.asignado_nombre}` : ""}>
                    {e.asignado_nombre ? (
                      <>
                        <span className="mono text-kraft-dark">{e.asignado_numero}</span> {e.asignado_nombre}
                      </>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  <td className={tdc}>
                    {(responsivas[e.id] ?? []).length ? (
                      <div className="flex flex-wrap gap-1">
                        {(responsivas[e.id] ?? []).map((r) =>
                          r.pdf_path ? (
                            <a
                              key={r.id}
                              href={`/api/pdf/${r.id}`}
                              target="_blank"
                              className="mono rounded border border-line bg-white px-1.5 py-0.5 text-[11px] text-kraft-dark hover:bg-paper"
                              title={`${r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · ${fechaCorta(r.fecha)} · abrir PDF`}
                            >
                              {r.folio}
                            </a>
                          ) : (
                            <span key={r.id} className="mono text-[11px] text-soft" title="Sin archivo PDF">
                              {r.folio}
                            </span>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-soft">—</span>
                    )}
                  </td>
                  <td className={`${tdc} whitespace-nowrap text-xs text-soft`}>
                    {fechaCorta(e.fecha_compra)}
                    {e.costo !== null ? <div>{dinero(e.costo)}</div> : null}
                  </td>
                  <td className={tdc}>
                    <div className="flex flex-wrap items-center gap-1">
                      <button className={mini} onClick={() => setVerEq(e)}>
                        Ver
                      </button>
                      <button
                        className={mini}
                        onClick={() =>
                          setForm(formDeEquipo(e))
                        }
                      >
                        Editar
                      </button>
                      {faltaResponsiva.has(e.id) ? (
                        <Link
                          className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                          href={`/responsivas/nueva?equipo=${e.id}`}
                          title="Generar la carta responsiva para que el empleado la firme"
                        >
                          + Responsiva
                        </Link>
                      ) : null}
                      <Link className={mini} href={`/mantenimientos?equipo=${e.id}`}>
                        Historial
                      </Link>
                      <button
                        className={miniDanger}
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

      {verEq ? (
        <DetalleEquipo
          equipo={verEq}
          conflictos={duplicados[verEq.id] ?? []}
          cartas={responsivas[verEq.id] ?? []}
          onCerrar={() => setVerEq(null)}
        />
      ) : null}
    </div>
  );
}

/** Etiqueta legible para una clave de detalle (busca en el tipo del equipo y luego en todos). */
function etiquetaDetalle(tipo: string, clave: string): string {
  const propio = (CAMPOS_DETALLE[tipo as TipoEquipo] ?? []).find((c) => c.clave === clave);
  if (propio) return propio.etiqueta;
  for (const t of TIPOS_EQUIPO) {
    const c = CAMPOS_DETALLE[t].find((x) => x.clave === clave);
    if (c) return c.etiqueta;
  }
  return clave;
}

/** Modal con TODOS los campos del equipo (básicos + detalles por tipo). */
function DetalleEquipo({
  equipo: e,
  conflictos,
  cartas,
  onCerrar,
}: {
  equipo: EquipoConAsignado;
  conflictos: Conflicto[];
  cartas: ResponsivaDeEquipo[];
  onCerrar: () => void;
}) {
  const detalles = parseDetalles(e.detalles);
  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div key={etiqueta}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{etiqueta}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{valor ?? "—"}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</p>
            <h2 className="text-lg font-bold text-ink">
              {e.marca} {e.modelo}
            </h2>
          </div>
          <button className={btnGhost} onClick={onCerrar}>
            ✕ Cerrar
          </button>
        </div>
        {conflictos.length ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">⚠️ Datos repetidos en el inventario</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {conflictos.map((c) => (
                <li key={`${c.campo}-${c.valor}`}>
                  Mismo {c.etiqueta} <span className="mono">{c.valor}</span> que {c.otros.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dato("Tipo", ETIQUETA_TIPO[e.tipo] ?? e.tipo)}
          {dato("Categoría", e.categoria)}
          {dato("Número de serie", e.numero_serie ? <span className="mono">{e.numero_serie}</span> : null)}
          {dato("Estado", <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>)}
          {dato(
            "Asignado a",
            e.asignado_nombre ? (
              <>
                <span className="mono text-xs text-kraft-dark">{e.asignado_numero}</span> {e.asignado_nombre}
              </>
            ) : null
          )}
          {dato("Fecha de compra", e.fecha_compra ? fechaCorta(e.fecha_compra) : null)}
          {dato("Costo", e.costo !== null ? dinero(e.costo) : null)}
          {Object.entries(detalles)
            .filter(([, v]) => v && String(v).trim())
            .map(([clave, valor]) => dato(etiquetaDetalle(e.tipo, clave), String(valor)))}
          {e.specs ? dato("Specs", e.specs) : null}
        </div>
        {e.notas ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Notas</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{e.notas}</p>
          </div>
        ) : null}

        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-soft">Cartas responsivas</p>
          {cartas.length === 0 ? (
            <p className="text-sm text-soft">Este equipo no tiene carta responsiva registrada.</p>
          ) : (
            <div className="space-y-1.5">
              {cartas.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="mono text-xs font-semibold text-kraft-dark">{r.folio}</p>
                    <p className="text-xs text-soft">
                      {r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {fechaCorta(r.fecha)} ·{" "}
                      <span className="mono">{r.empleado_numero}</span> {r.empleado_nombre}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.estado === "VIGENTE" ? <Badge tono="verde">Vigente</Badge> : <Badge tono="gris">Cerrada</Badge>}
                    {r.pdf_path ? (
                      <a href={`/api/pdf/${r.id}`} target="_blank" className={mini}>
                        Abrir PDF
                      </a>
                    ) : (
                      <span className="text-xs text-soft">sin archivo</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
