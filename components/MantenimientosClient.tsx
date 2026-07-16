"use client";

import { useState, useTransition } from "react";
import type { MantenimientoConEquipo } from "../lib/types";
import { ESTADOS_MANTENIMIENTO, ETIQUETA_MANTENIMIENTO, TIPOS_MANTENIMIENTO } from "../lib/constants";
import { diasPara, dinero, fechaCorta, hoyISO } from "../lib/helpers";
import {
  cancelarMantenimiento,
  completarMantenimiento,
  eliminarMantenimiento,
  guardarMantenimiento,
} from "../app/mantenimientos/actions";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

type EquipoOpcion = { id: number; codigo: string; marca: string; modelo: string; estado: string };

type Formulario = {
  id?: number;
  equipo_id: string;
  tipo: string;
  descripcion: string;
  fecha_programada: string;
  tecnico: string;
  notas: string;
  ponerEnMantenimiento: boolean;
};

const FORM_VACIO: Formulario = {
  equipo_id: "",
  tipo: "PREVENTIVO",
  descripcion: "",
  fecha_programada: "",
  tecnico: "",
  notas: "",
  ponerEnMantenimiento: false,
};

export default function MantenimientosClient({
  mantenimientos,
  equipos,
}: {
  mantenimientos: MantenimientoConEquipo[];
  equipos: EquipoOpcion[];
}) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [completando, setCompletando] = useState<number | null>(null);
  const [cierre, setCierre] = useState({ fecha_realizada: hoyISO(), costo: "", notas: "" });
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) => {
    setError("");
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error desconocido.");
      else despues?.();
    });
  };

  const tonoEstado = (m: MantenimientoConEquipo) => {
    if (m.estado === "COMPLETADO") return <Badge tono="verde">Completado</Badge>;
    if (m.estado === "CANCELADO") return <Badge tono="gris">Cancelado</Badge>;
    const dias = diasPara(m.fecha_programada);
    if (dias < 0) return <Badge tono="rojo">Vencido {Math.abs(dias)} día(s)</Badge>;
    if (dias <= 7) return <Badge tono="ambar">En {dias} día(s)</Badge>;
    return <Badge tono="petrol">Programado</Badge>;
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
            setForm({ ...FORM_VACIO, fecha_programada: hoyISO() });
            setError("");
          }}
        >
          + Programar mantenimiento
        </button>
      </div>

      {form ? (
        <Card>
          <h2 className="mb-4 text-base font-bold text-ink">
            {form.id ? "Editar mantenimiento" : "Programar mantenimiento"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <Label>Equipo *</Label>
              <select
                className={inputCls}
                value={form.equipo_id}
                onChange={(e) => setForm((f) => (f ? { ...f, equipo_id: e.target.value } : f))}
              >
                <option value="">— Selecciona un equipo —</option>
                {equipos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo} · {e.marca} {e.modelo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                className={inputCls}
                value={form.tipo}
                onChange={(e) => setForm((f) => (f ? { ...f, tipo: e.target.value } : f))}
              >
                {TIPOS_MANTENIMIENTO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_MANTENIMIENTO[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Fecha programada *</Label>
              <input
                className={inputCls}
                type="date"
                value={form.fecha_programada}
                onChange={(e) => setForm((f) => (f ? { ...f, fecha_programada: e.target.value } : f))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Descripción *</Label>
              <input
                className={inputCls}
                value={form.descripcion}
                onChange={(e) => setForm((f) => (f ? { ...f, descripcion: e.target.value } : f))}
                placeholder="Ej. Limpieza interna, cambio de pasta térmica y actualización de Windows"
              />
            </div>
            <div>
              <Label>Técnico / proveedor</Label>
              <input
                className={inputCls}
                value={form.tecnico}
                onChange={(e) => setForm((f) => (f ? { ...f, tecnico: e.target.value } : f))}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notas</Label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.notas}
                onChange={(e) => setForm((f) => (f ? { ...f, notas: e.target.value } : f))}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="accent-kraft"
                  checked={form.ponerEnMantenimiento}
                  onChange={(e) => setForm((f) => (f ? { ...f, ponerEnMantenimiento: e.target.checked } : f))}
                />
                Marcar el equipo como “En mantenimiento” desde ahora
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className={btnPrimary}
              disabled={pendiente}
              onClick={() =>
                ejecutar(
                  () =>
                    guardarMantenimiento({
                      id: form.id,
                      equipo_id: Number(form.equipo_id),
                      tipo: form.tipo,
                      descripcion: form.descripcion,
                      fecha_programada: form.fecha_programada,
                      tecnico: form.tecnico,
                      notas: form.notas,
                      ponerEnMantenimiento: form.ponerEnMantenimiento,
                    }),
                  () => setForm(null)
                )
              }
            >
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      {mantenimientos.length === 0 ? (
        <Empty>No hay mantenimientos registrados con estos filtros.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Descripción</th>
                <th className={thCls}>Programado</th>
                <th className={thCls}>Realizado</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Costo</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {mantenimientos.map((m) => (
                <tr key={m.id} className="border-b border-line/70 last:border-0 align-top hover:bg-paper/40">
                  <td className={tdCls}>
                    <span className="mono text-xs font-semibold text-kraft-dark">{m.equipo_codigo}</span>
                    <div className="text-xs text-soft">{m.equipo_desc}</div>
                  </td>
                  <td className={tdCls}>{ETIQUETA_MANTENIMIENTO[m.tipo] ?? m.tipo}</td>
                  <td className={tdCls}>
                    {m.descripcion}
                    {m.tecnico ? <div className="text-xs text-soft">Técnico: {m.tecnico}</div> : null}
                    {m.notas ? <div className="text-xs text-soft">{m.notas}</div> : null}
                  </td>
                  <td className={tdCls}>{fechaCorta(m.fecha_programada)}</td>
                  <td className={tdCls}>{fechaCorta(m.fecha_realizada)}</td>
                  <td className={tdCls}>{tonoEstado(m)}</td>
                  <td className={tdCls}>{dinero(m.costo)}</td>
                  <td className={tdCls}>
                    {completando === m.id ? (
                      <div className="w-56 space-y-2">
                        <input
                          className={inputCls}
                          type="date"
                          value={cierre.fecha_realizada}
                          onChange={(e) => setCierre((c) => ({ ...c, fecha_realizada: e.target.value }))}
                        />
                        <input
                          className={inputCls}
                          type="number"
                          step="0.01"
                          placeholder="Costo (opcional)"
                          value={cierre.costo}
                          onChange={(e) => setCierre((c) => ({ ...c, costo: e.target.value }))}
                        />
                        <input
                          className={inputCls}
                          placeholder="Notas del cierre (opcional)"
                          value={cierre.notas}
                          onChange={(e) => setCierre((c) => ({ ...c, notas: e.target.value }))}
                        />
                        <div className="flex gap-1.5">
                          <button
                            className={btnPrimary}
                            disabled={pendiente}
                            onClick={() =>
                              ejecutar(
                                () => completarMantenimiento({ id: m.id, ...cierre }),
                                () => setCompletando(null)
                              )
                            }
                          >
                            Confirmar
                          </button>
                          <button className={btnGhost} onClick={() => setCompletando(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {m.estado === "PROGRAMADO" ? (
                          <>
                            <button
                              className={btnGhost}
                              onClick={() => {
                                setCompletando(m.id);
                                setCierre({ fecha_realizada: hoyISO(), costo: "", notas: "" });
                              }}
                            >
                              Completar
                            </button>
                            <button
                              className={btnGhost}
                              onClick={() =>
                                setForm({
                                  id: m.id,
                                  equipo_id: String(m.equipo_id),
                                  tipo: m.tipo,
                                  descripcion: m.descripcion,
                                  fecha_programada: m.fecha_programada,
                                  tecnico: m.tecnico ?? "",
                                  notas: m.notas ?? "",
                                  ponerEnMantenimiento: false,
                                })
                              }
                            >
                              Editar
                            </button>
                            <button
                              className={btnGhost}
                              disabled={pendiente}
                              onClick={() => ejecutar(() => cancelarMantenimiento(m.id))}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : null}
                        <button
                          className={btnDanger}
                          disabled={pendiente}
                          onClick={() => {
                            if (confirm("¿Eliminar este registro de mantenimiento?")) {
                              ejecutar(() => eliminarMantenimiento(m.id));
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-soft">
        Estados: {Object.values(ESTADOS_MANTENIMIENTO).join(" · ")}. Al completar un mantenimiento, el equipo regresa
        solo a “Disponible” o “Asignado” según corresponda.
      </p>
    </div>
  );
}
