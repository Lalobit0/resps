"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado } from "../lib/types";
import type { TipoRevision } from "../lib/formatos/tipos";
import type { Revision } from "../lib/revisiones";
import { equiposDelEmpleado, eliminarRevision, guardarRevision } from "../app/revisiones/actions";
import { fechaCorta } from "../lib/helpers";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

/**
 * Revisiones-IT: se captura lo que se revisó y el documento del sistema de
 * calidad sale de ahí, con los datos del usuario y de su equipo puestos por el
 * sistema. No se llena a mano ni se firma: el respaldo es el registro.
 */
export default function RevisionesClient({
  tipos,
  empleados,
  revisiones,
  hoy,
}: {
  tipos: TipoRevision[];
  empleados: Empleado[];
  revisiones: Revision[];
  hoy: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoRevision | null>(null);
  const [empleadoId, setEmpleadoId] = useState<number | null>(null);
  const [equipos, setEquipos] = useState<{ id: number; codigo: string; texto: string }[]>([]);
  const [equipoId, setEquipoId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [realizadaPor, setRealizadaPor] = useState("");
  const [puntos, setPuntos] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState("");
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();

  // Al elegir empleado se traen sus equipos: la revisión es sobre uno de ellos.
  useEffect(() => {
    if (!empleadoId) {
      setEquipos([]);
      setEquipoId(null);
      return;
    }
    equiposDelEmpleado(empleadoId)
      .then(({ equipos }) => {
        setEquipos(equipos);
        setEquipoId(equipos.length === 1 ? equipos[0].id : null);
      })
      .catch(() => undefined);
  }, [empleadoId]);

  const abrir = (t: TipoRevision) => {
    setTipo(t);
    setPuntos({});
    setExtras({});
    setObservaciones("");
    setFecha(hoy);
    setError("");
    setMensaje("");
  };

  const marcarTodos = (valor: string) => {
    if (!tipo) return;
    const nuevo: Record<string, string> = {};
    for (const p of tipo.puntos) nuevo[p] = valor;
    setPuntos(nuevo);
  };

  const guardar = () => {
    if (!tipo) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await guardarRevision({
        tipo: tipo.clave,
        empleadoId,
        equipoId,
        fecha,
        realizadaPor,
        puntos,
        extras,
        observaciones,
      });
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        setTipo(null);
        setEmpleadoId(null);
        router.refresh();
        if (res.id) window.open(`/api/revision/${res.id}`, "_blank");
      } else setError(res.error ?? "No se pudo guardar.");
    });
  };

  const borrar = (r: Revision) => {
    if (!confirm(`¿Eliminar el registro ${r.folio}? Se borra del histórico y del expediente.`)) return;
    iniciar(async () => {
      const res = await eliminarRevision(r.id);
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else setError(res.error ?? "No se pudo eliminar.");
    });
  };

  const visibles = revisiones.filter((r) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return [r.folio, r.empleado_nombre, r.empleado_numero, r.equipo_codigo, r.tipo]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const nombreTipo = (clave: string) => tipos.find((t) => t.clave === clave)?.nombre ?? clave;

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error && !tipo ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {/* Los documentos que se pueden generar */}
      <div className="grid gap-3 md:grid-cols-3">
        {tipos.map((t) => (
          <Card key={t.clave} className="flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">{t.nombre}</h2>
                <span className="mono shrink-0 text-[11px] text-soft">{t.codigo}</span>
              </div>
              <p className="mt-1 text-xs text-soft">{t.descripcion}</p>
              {!t.confirmado ? (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  Los campos están puestos por lógica: falta cotejarlos contra el formato oficial.
                </p>
              ) : null}
            </div>
            <button className={`${btnPrimary} mt-3 w-full`} onClick={() => abrir(t)}>
              Registrar y generar
            </button>
          </Card>
        ))}
      </div>

      {/* Captura */}
      {tipo ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <Card className="my-6 w-full max-w-3xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">{tipo.nombre}</h2>
                <p className="mono text-xs text-soft">{tipo.codigo}</p>
              </div>
              <button className={btnGhost} onClick={() => setTipo(null)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Empleado</Label>
                <BuscadorEmpleado empleados={empleados} value={empleadoId} onChange={setEmpleadoId} />
              </div>
              <div>
                <Label>Equipo</Label>
                <select
                  className={inputCls}
                  value={equipoId ?? ""}
                  onChange={(e) => setEquipoId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!empleadoId}
                >
                  <option value="">{empleadoId ? "— Elige el equipo —" : "Elige primero al empleado"}</option>
                  {equipos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.texto}
                    </option>
                  ))}
                </select>
                {empleadoId && !equipos.length ? (
                  <p className="mt-1 text-xs text-amber-800">Ese empleado no tiene equipos entregados.</p>
                ) : null}
              </div>
              <div>
                <Label>Fecha de la revisión</Label>
                <input type="date" className={inputCls} max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <Label>Realizada por</Label>
                <input
                  className={inputCls}
                  placeholder="Quién hizo la revisión"
                  value={realizadaPor}
                  onChange={(e) => setRealizadaPor(e.target.value)}
                />
              </div>
              {tipo.extras.map((x) => (
                <div key={x.clave} className={x.tipo === "area" ? "sm:col-span-2" : ""}>
                  <Label>{x.etiqueta}</Label>
                  {x.tipo === "opciones" ? (
                    <select
                      className={inputCls}
                      value={extras[x.clave] ?? ""}
                      onChange={(e) => setExtras({ ...extras, [x.clave]: e.target.value })}
                    >
                      <option value="">— Elige —</option>
                      {(x.opciones ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : x.tipo === "area" ? (
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={extras[x.clave] ?? ""}
                      onChange={(e) => setExtras({ ...extras, [x.clave]: e.target.value })}
                    />
                  ) : (
                    <input
                      className={inputCls}
                      type={x.tipo === "fecha" ? "date" : "text"}
                      value={extras[x.clave] ?? ""}
                      onChange={(e) => setExtras({ ...extras, [x.clave]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-ink">Puntos revisados</span>
                <button className={btnGhost} onClick={() => marcarTodos("Si")}>
                  Todos en Sí
                </button>
                <button className={btnGhost} onClick={() => marcarTodos("No")}>
                  Todos en No
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {tipo.puntos.map((p) => (
                  <div
                    key={p}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 ${
                      puntos[p] === "No" ? "border-red-200 bg-red-50" : puntos[p] ? "border-emerald-200 bg-emerald-50" : "border-line bg-white"
                    }`}
                  >
                    <span className="text-sm text-ink">{p}</span>
                    <div className="flex shrink-0 gap-1">
                      {["Si", "No"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPuntos({ ...puntos, [p]: v })}
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                            puntos[p] === v
                              ? v === "Si"
                                ? "border-emerald-400 bg-emerald-100 text-emerald-900"
                                : "border-red-300 bg-red-100 text-red-800"
                              : "border-line bg-white text-soft hover:bg-paper"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-soft">
                Un “No” en cualquier punto marca el documento con hallazgos, que es lo que después se revisa.
              </p>
            </div>

            <div className="mt-4">
              <Label>Observaciones</Label>
              <textarea
                className={inputCls}
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Qué se encontró y qué se hizo"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar y generar el documento"}
              </button>
              <button className={btnGhost} onClick={() => setTipo(null)} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Histórico */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Registros ({revisiones.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} max-w-xs`}
              placeholder="Buscar folio, empleado o equipo…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            {revisiones.length ? (
              <a href="/api/revision/todas" target="_blank" rel="noreferrer" className={btnGhost}>
                ↧ Todo en un PDF
              </a>
            ) : null}
          </div>
        </div>

        {!visibles.length ? (
          <Empty>Todavía no hay revisiones registradas. Empieza con una de las tarjetas de arriba.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-paper/70">
                <tr>
                  <th className={thCls}>Folio</th>
                  <th className={thCls}>Documento</th>
                  <th className={thCls}>Empleado</th>
                  <th className={thCls}>Equipo</th>
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Resultado</th>
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibles.map((r) => (
                  <tr key={r.id}>
                    <td className={`${tdCls} mono text-xs font-semibold`}>{r.folio}</td>
                    <td className={`${tdCls} text-xs`}>{nombreTipo(r.tipo)}</td>
                    <td className={`${tdCls} text-xs`}>
                      {r.empleado_numero} {r.empleado_nombre}
                    </td>
                    <td className={`${tdCls} mono text-xs`}>{r.equipo_codigo ?? "—"}</td>
                    <td className={tdCls}>{fechaCorta(r.fecha)}</td>
                    <td className={tdCls}>
                      {r.resultado === "CON_HALLAZGOS" ? (
                        <Badge tono="rojo">Con hallazgos</Badge>
                      ) : (
                        <Badge tono="verde">Sin hallazgos</Badge>
                      )}
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/api/revision/${r.id}`} target="_blank" rel="noreferrer" className={btnGhost}>
                          Ver PDF
                        </a>
                        <button
                          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                          onClick={() => borrar(r)}
                          disabled={pendiente}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
