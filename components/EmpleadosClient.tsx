"use client";

import { useMemo, useState, useTransition } from "react";
import type { EmpleadoConEquipos } from "../lib/types";
import { cambiarActivoEmpleado, eliminarEmpleado, guardarEmpleado } from "../app/empleados/actions";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

type Formulario = {
  id?: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  correo: string;
  telefono: string;
};

const FORM_VACIO: Formulario = { numero_empleado: "", nombre: "", puesto: "", departamento: "", correo: "", telefono: "" };

export default function EmpleadosClient({ empleados }: { empleados: EmpleadoConEquipos[] }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return empleados;
    return empleados.filter((e) =>
      [e.nombre, e.numero_empleado, e.puesto, e.departamento, e.correo ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [empleados, busqueda]);

  const set = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const enviar = () => {
    if (!form) return;
    setError("");
    iniciar(async () => {
      const res = await guardarEmpleado(form);
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error desconocido.");
    });
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, número, puesto o departamento…"
          className={`${inputCls} max-w-md`}
        />
        <button
          className={btnPrimary}
          onClick={() => {
            setForm(FORM_VACIO);
            setError("");
          }}
        >
          + Nuevo empleado
        </button>
      </div>

      {form ? (
        <Card>
          <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar empleado" : "Nuevo empleado"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Número de empleado *</Label>
              <input className={inputCls} value={form.numero_empleado} onChange={set("numero_empleado")} placeholder="0045" />
            </div>
            <div className="lg:col-span-2">
              <Label>Nombre completo *</Label>
              <input className={inputCls} value={form.nombre} onChange={set("nombre")} placeholder="Nombre y apellidos" />
            </div>
            <div>
              <Label>Puesto *</Label>
              <input className={inputCls} value={form.puesto} onChange={set("puesto")} />
            </div>
            <div>
              <Label>Departamento *</Label>
              <input className={inputCls} value={form.departamento} onChange={set("departamento")} />
            </div>
            <div>
              <Label>Correo</Label>
              <input className={inputCls} type="email" value={form.correo} onChange={set("correo")} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <input className={inputCls} value={form.telefono} onChange={set("telefono")} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar empleado"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      {filtrados.length === 0 ? (
        <Empty>No hay empleados que coincidan. Registra el primero con “Nuevo empleado”.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>No.</th>
                <th className={thCls}>Nombre</th>
                <th className={thCls}>Puesto</th>
                <th className={thCls}>Departamento</th>
                <th className={thCls}>Contacto</th>
                <th className={thCls}>Equipos</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className={`${tdCls} mono text-xs`}>{e.numero_empleado}</td>
                  <td className={`${tdCls} font-medium`}>{e.nombre}</td>
                  <td className={tdCls}>{e.puesto}</td>
                  <td className={tdCls}>{e.departamento}</td>
                  <td className={`${tdCls} text-xs text-soft`}>
                    {e.correo ?? "—"}
                    {e.telefono ? <div>{e.telefono}</div> : null}
                  </td>
                  <td className={tdCls}>
                    {e.equipos_asignados > 0 ? <Badge tono="petrol">{e.equipos_asignados} asignado(s)</Badge> : <span className="text-soft">—</span>}
                  </td>
                  <td className={tdCls}>{e.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="gris">Inactivo</Badge>}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={btnGhost}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            numero_empleado: e.numero_empleado,
                            nombre: e.nombre,
                            puesto: e.puesto,
                            departamento: e.departamento,
                            correo: e.correo ?? "",
                            telefono: e.telefono ?? "",
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className={btnGhost}
                        disabled={pendiente}
                        onClick={() => ejecutar(() => cambiarActivoEmpleado(e.id, !e.activo))}
                      >
                        {e.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        className={btnDanger}
                        disabled={pendiente}
                        onClick={() => {
                          if (confirm(`¿Eliminar a ${e.nombre}? Esta acción no se puede deshacer.`)) {
                            ejecutar(() => eliminarEmpleado(e.id));
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
