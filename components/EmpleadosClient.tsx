"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { EmpleadoConEquipos } from "../lib/types";
import { cambiarActivoEmpleado, datosBajaEmpleado, eliminarEmpleado, guardarEmpleado, importarEmpleados, type DatosBaja } from "../app/empleados/actions";
import { ETIQUETA_TIPO } from "../lib/constants";
import ExportarBotones from "./ExportarBotones";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls } from "./ui";

type Formulario = {
  id?: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  area: string;
  clase: string;
  supervisor: string;
  fecha_alta: string;
  correo: string;
  telefono: string;
};

const FORM_VACIO: Formulario = {
  numero_empleado: "",
  nombre: "",
  puesto: "",
  departamento: "",
  area: "",
  clase: "",
  supervisor: "",
  fecha_alta: "",
  correo: "",
  telefono: "",
};

const celda = "px-2 py-1 text-sm text-ink align-middle whitespace-nowrap";
const thc = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft whitespace-nowrap";
const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniDanger = "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50";

export default function EmpleadosClient({ empleados }: { empleados: EmpleadoConEquipos[] }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [baja, setBaja] = useState<{ empleado: EmpleadoConEquipos; datos: DatosBaja } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const departamentos = useMemo(
    () => Array.from(new Set(empleados.map((e) => e.departamento).filter(Boolean))).sort(),
    [empleados]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empleados.filter((e) => {
      if (filtroEstado === "activos" && !e.activo) return false;
      if (filtroEstado === "inactivos" && e.activo) return false;
      if (filtroDepto && e.departamento !== filtroDepto) return false;
      if (
        q &&
        ![e.nombre, e.numero_empleado, e.puesto, e.departamento, e.area ?? "", e.supervisor ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [empleados, busqueda, filtroDepto, filtroEstado]);

  const set = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const enviar = () => {
    if (!form) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await guardarEmpleado(form);
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error desconocido.");
    });
  };

  // Al desactivar: si trae equipos, se muestra el aviso con las devoluciones pendientes.
  const alternarActivo = (e: EmpleadoConEquipos) => {
    if (e.activo && e.equipos_asignados > 0) {
      setError("");
      iniciar(async () => {
        const datos = await datosBajaEmpleado(e.id);
        setBaja({ empleado: e, datos });
      });
      return;
    }
    ejecutar(() => cambiarActivoEmpleado(e.id, !e.activo));
  };

  const importar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    fd.append("archivo", archivo);
    iniciar(async () => {
      const res = await importarEmpleados(fd);
      if (res.ok) setMensaje(res.mensaje ?? "Empleados importados.");
      else setError(res.error ?? "No se pudo importar.");
    });
  };

  return (
    <div className="space-y-4">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, número, puesto…"
          className={`${inputCls} max-w-xs`}
        />
        <select className={`${inputCls} max-w-[200px]`} value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}>
          <option value="">Todos los departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[150px]`} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
        <button className={btnGhost} disabled={pendiente} onClick={() => fileRef.current?.click()}>
          {pendiente ? "Procesando…" : "↥ Importar Excel"}
        </button>
        <button
          className={btnPrimary}
          onClick={() => {
            setForm(FORM_VACIO);
            setError("");
            setMensaje("");
          }}
        >
          + Nuevo empleado
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {filtrados.length} de {empleados.length} empleados · haz clic en un nombre para ver su histórico.
        </p>
        <ExportarBotones tabla="empleados" params={{ q: busqueda, depto: filtroDepto, estado: filtroEstado }} />
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
              <Label>Área</Label>
              <input className={inputCls} value={form.area} onChange={set("area")} />
            </div>
            <div>
              <Label>Jefe directo / Supervisor</Label>
              <input className={inputCls} value={form.supervisor} onChange={set("supervisor")} />
            </div>
            <div>
              <Label>Clase de empleado</Label>
              <input className={inputCls} value={form.clase} onChange={set("clase")} placeholder="ADMINISTRATIVOS…" />
            </div>
            <div>
              <Label>Fecha de alta</Label>
              <input className={inputCls} type="date" value={form.fecha_alta} onChange={set("fecha_alta")} />
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
        <Empty>No hay empleados que coincidan. Ajusta el filtro, registra uno o importa tu Excel.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[680px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thc}>No.</th>
                <th className={`${thc} w-full`}>Nombre</th>
                <th className={thc}>Puesto</th>
                <th className={thc}>Depto / Área</th>
                <th className={thc}>Jefe directo</th>
                <th className={`${thc} text-center`}>Eq.</th>
                <th className={thc}>Estado</th>
                <th className={thc}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-paper/40">
                  <td className={`${celda} mono text-xs`}>{e.numero_empleado}</td>
                  <td className={celda}>
                    <Link
                      href={`/empleados/${e.id}`}
                      className="font-medium text-ink hover:text-kraft hover:underline"
                      title="Ver histórico"
                    >
                      {e.nombre}
                    </Link>
                  </td>
                  <td className={`${celda} max-w-[190px] truncate text-xs`} title={e.puesto}>
                    {e.puesto}
                  </td>
                  <td className={`${celda} text-xs`}>
                    {e.departamento}
                    {e.area && e.area !== e.departamento ? <span className="text-soft"> · {e.area}</span> : null}
                  </td>
                  <td className={`${celda} max-w-[160px] truncate text-xs text-soft`} title={e.supervisor ?? ""}>
                    {e.supervisor ?? "—"}
                  </td>
                  <td className={`${celda} text-center`}>
                    {e.equipos_asignados > 0 ? (
                      <Link href={`/empleados/${e.id}`}>
                        <Badge tono="petrol">{e.equipos_asignados}</Badge>
                      </Link>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  <td className={celda}>
                    {e.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="gris">Inactivo</Badge>}
                  </td>
                  <td className={celda}>
                    <div className="flex flex-nowrap items-center gap-1">
                      <button
                        className={mini}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            numero_empleado: e.numero_empleado,
                            nombre: e.nombre,
                            puesto: e.puesto,
                            departamento: e.departamento,
                            area: e.area ?? "",
                            clase: e.clase ?? "",
                            supervisor: e.supervisor ?? "",
                            fecha_alta: e.fecha_alta ?? "",
                            correo: e.correo ?? "",
                            telefono: e.telefono ?? "",
                          })
                        }
                      >
                        Editar
                      </button>
                      <button className={mini} disabled={pendiente} onClick={() => alternarActivo(e)}>
                        {e.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        className={miniDanger}
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

      {baja ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setBaja(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-ink">Baja de {baja.empleado.nombre}</h2>
            <p className="mt-1 text-sm text-soft">
              Antes de darlo de baja, este empleado debe devolver {baja.empleado.equipos_asignados} equipo(s). Registra
              la devolución de cada carta responsiva; al terminar podrás desactivarlo.
            </p>

            {baja.datos.responsivas.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-soft">Responsivas por devolver</p>
                <div className="space-y-2">
                  {baja.datos.responsivas.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-paper/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="mono text-xs font-semibold text-kraft-dark">{r.folio}</p>
                        <p className="mono truncate text-[11px] text-soft">{r.equipos ?? "—"}</p>
                      </div>
                      <Link href={`/responsivas/${r.id}/devolucion`} className={`${btnPrimary} shrink-0 px-3 py-1.5 text-xs`}>
                        Registrar devolución
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {baja.datos.equipos.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-soft">Equipos asignados</p>
                <ul className="space-y-1 text-sm">
                  {baja.datos.equipos.map((eq) => (
                    <li key={eq.id} className="flex items-center gap-2">
                      <span className="mono text-xs font-semibold text-kraft-dark">{eq.codigo}</span>
                      <span className="text-soft">
                        {ETIQUETA_TIPO[eq.tipo] ?? eq.tipo} · {eq.marca} {eq.modelo}
                      </span>
                    </li>
                  ))}
                </ul>
                {baja.datos.responsivas.length === 0 ? (
                  <p className="mt-2 text-xs text-soft">
                    Estos equipos están asignados sin una responsiva del sistema (probablemente importados). Libéralos
                    en el inventario (cambia su estado a Disponible) para poder dar de baja al empleado.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Link href={`/empleados/${baja.empleado.id}`} className={btnGhost}>
                Ver histórico
              </Link>
              <button className={btnGhost} onClick={() => setBaja(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
