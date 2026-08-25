"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarUbicaciones, ubicarEquipos } from "../app/inventario/actions";
import { CLASIFICACIONES_EQUIPO } from "../lib/constants";
import { Badge, Card, btnGhost, btnPrimary, inputCls } from "./ui";

export type EquipoPorUbicar = {
  id: number;
  codigo: string;
  tipo: string;
  equipo: string;
  serie: string | null;
  nombre_pc: string;
  estado: string;
  asignado: string | null;
  departamento: string;
  area: string;
  clasificacion: string;
  /** Folios de sus cartas de asignación, si las tiene. */
  responsiva: string | null;
  /** Tiene dueño y carta: son los que ya están formalmente entregados. */
  con_responsiva: boolean;
  /** Departamento propuesto por el nombre de la computadora. */
  sugerido: string;
  motivo: string;
};

/**
 * Repartir los equipos por área, de corrido.
 *
 * Todo se edita en la misma tabla y no se guarda nada hasta el final: se puede
 * aceptar la propuesta de un renglón, la de todos, o escribir el área a mano.
 */
export default function UbicarClient({
  equipos,
  departamentos,
  vista,
}: {
  equipos: EquipoPorUbicar[];
  departamentos: string[];
  /** Nombre de la vista abierta, para decirlo en los textos. */
  vista: string;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<number, { departamento: string; clasificacion: string }>>(() =>
    Object.fromEntries(equipos.map((e) => [e.id, { departamento: e.departamento, clasificacion: e.clasificacion }]))
  );
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);

  /** Sube el Excel del actualizador y aplica lo que traiga lleno. */
  const importar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    fd.append("archivo", f);
    iniciar(async () => {
      const res = await importarUbicaciones(fd);
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else setError(res.error ?? "No se pudo importar.");
    });
  };

  const poner = (id: number, campo: "departamento" | "clasificacion", texto: string) =>
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: texto } }));

  const conSugerencia = equipos.filter((e) => e.sugerido && !valores[e.id]?.departamento);

  const aceptarTodas = () =>
    setValores((v) => {
      const nuevo = { ...v };
      for (const e of equipos) if (e.sugerido && !nuevo[e.id]?.departamento) nuevo[e.id] = { ...nuevo[e.id], departamento: e.sugerido };
      return nuevo;
    });

  const todos = elegidos.size === equipos.length && equipos.length > 0;
  const alternarTodos = () => setElegidos(todos ? new Set() : new Set(equipos.map((e) => e.id)));
  const alternar = (id: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  /**
   * Pone la misma clasificación a los renglones marcados; si no hay ninguno
   * marcado, a los que todavía no tienen. Así el caso normal —"a todos estos,
   * Administrativo"— es un clic sin tener que marcar uno por uno.
   */
  const clasificarEnBloque = (valor: string) => {
    if (!valor) return;
    setValores((v) => {
      const nuevo = { ...v };
      const destino = elegidos.size ? equipos.filter((e) => elegidos.has(e.id)) : equipos.filter((e) => !nuevo[e.id]?.clasificacion);
      for (const e of destino) nuevo[e.id] = { ...nuevo[e.id], clasificacion: valor };
      return nuevo;
    });
  };

  // Solo se manda lo que cambió respecto a como estaba.
  const cambios = equipos
    .map((e) => ({
      id: e.id,
      departamento: valores[e.id]?.departamento ?? "",
      clasificacion: valores[e.id]?.clasificacion ?? "",
    }))
    .filter((c) => {
      const orig = equipos.find((e) => e.id === c.id);
      if (!orig) return false;
      return (c.departamento && c.departamento !== orig.departamento) || (c.clasificacion && c.clasificacion !== orig.clasificacion);
    });

  const guardar = () => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      // El área del equipo y su departamento son el mismo dato en la práctica.
      const res = await ubicarEquipos(cambios.map((c) => ({ ...c, area: c.departamento })));
      if (res.ok) {
        setMensaje(res.mensaje ?? "Listo.");
        router.refresh();
      } else setError(res.error ?? "No se pudo guardar.");
    });
  };

  return (
    <div className="space-y-3">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✅ {mensaje}</div>
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper/60 px-4 py-3 text-sm">
        <button className={btnGhost} onClick={aceptarTodas} disabled={pendiente || conSugerencia.length === 0}>
          Aceptar las {conSugerencia.length} propuestas
        </button>
        <span className="text-soft">·</span>
        <button className={btnGhost} onClick={alternarTodos} disabled={pendiente || equipos.length === 0}>
          {todos ? "Quitar la selección" : `Marcar los ${equipos.length}`}
        </button>
        <span className="text-xs text-soft">
          Clasificar {elegidos.size ? <b>los {elegidos.size} marcados</b> : "los que no tienen"}:
        </span>
        <select
          className={`${inputCls} max-w-[220px]`}
          defaultValue=""
          onChange={(e) => {
            clasificarEnBloque(e.target.value);
            e.target.value = "";
          }}
          disabled={pendiente}
        >
          <option value="">— Clasificación —</option>
          {CLASIFICACIONES_EQUIPO.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        <input ref={archivo} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
        <button
          className={btnGhost}
          onClick={() => archivo.current?.click()}
          disabled={pendiente}
          title="Sube el Excel del actualizador: pone el área y la clasificación de golpe"
        >
          ↥ Importar Excel
        </button>
        <span className="ml-auto text-xs text-soft">
          {cambios.length ? `${cambios.length} renglón(es) por guardar` : "Sin cambios todavía"}
        </span>
        <button className={btnPrimary} onClick={guardar} disabled={pendiente || cambios.length === 0}>
          {pendiente ? "Guardando…" : `Guardar ${cambios.length || ""}`}
        </button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead className="border-b border-line bg-paper/70">
            <tr>
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-kraft"
                  checked={todos}
                  onChange={alternarTodos}
                  title="Marcar o desmarcar todos"
                />
              </th>
              {["Código", "Equipo", "Nombre del equipo", "Quién lo tiene", "Responsiva", "Propuesta", "Área / Departamento", "Clasificación"].map(
                (t) => (
                  <th key={t} className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft">
                    {t}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {equipos.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-soft" colSpan={9}>
                  No hay equipos en “{vista}”. 🎉
                </td>
              </tr>
            ) : null}
            {equipos.map((e) => {
              const v = valores[e.id] ?? { departamento: "", clasificacion: "" };
              return (
                <tr
                  key={e.id}
                  className={`border-b border-line/70 last:border-0 hover:bg-paper/40 ${
                    elegidos.has(e.id) ? "bg-kraft/5" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-kraft"
                      checked={elegidos.has(e.id)}
                      onChange={() => alternar(e.id)}
                      disabled={pendiente}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <span className="mono text-xs font-semibold text-ink">{e.codigo}</span>
                  </td>
                  <td className="px-2 py-1.5 align-middle text-sm">
                    <div className="truncate">{e.equipo}</div>
                    <div className="text-[11px] text-soft">{e.tipo}</div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {e.nombre_pc ? (
                      <span className="mono text-xs text-kraft-dark">{e.nombre_pc}</span>
                    ) : (
                      <span className="text-xs italic text-soft">sin nombre</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle text-xs">
                    {e.asignado ?? <span className="text-soft">Disponible</span>}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {e.responsiva ? (
                      <span className="mono text-[11px] text-kraft-dark">{e.responsiva}</span>
                    ) : (
                      <span className="text-xs text-soft">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {e.sugerido ? (
                      <button
                        type="button"
                        className="rounded border border-kraft bg-kraft/10 px-2 py-0.5 text-xs font-semibold text-ink hover:bg-kraft/20"
                        onClick={() => poner(e.id, "departamento", e.sugerido)}
                        title={`Se propone porque ${e.motivo}`}
                        disabled={pendiente}
                      >
                        {e.sugerido} ↦
                      </button>
                    ) : (
                      <span className="text-[11px] italic text-soft" title="No hay de dónde sacarlo">
                        {e.motivo || "a mano"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      className={`${inputCls} min-w-[170px] py-1 text-sm`}
                      list="departamentos-conocidos"
                      value={v.departamento}
                      onChange={(ev) => poner(e.id, "departamento", ev.target.value.toUpperCase())}
                      placeholder="Escribe o elige…"
                      disabled={pendiente}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      className={`${inputCls} min-w-[170px] py-1 text-sm`}
                      value={v.clasificacion}
                      onChange={(ev) => poner(e.id, "clasificacion", ev.target.value)}
                      disabled={pendiente}
                    >
                      <option value="">— Sin clasificar —</option>
                      {CLASIFICACIONES_EQUIPO.map((c) => (
                        <option key={c.valor} value={c.valor}>
                          {c.etiqueta}
                        </option>
                      ))}
                      {v.clasificacion && !CLASIFICACIONES_EQUIPO.some((c) => c.valor === v.clasificacion) ? (
                        <option value={v.clasificacion}>{v.clasificacion}</option>
                      ) : null}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <datalist id="departamentos-conocidos">
        {departamentos.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {vista === "Asignados con responsiva" && equipos.length ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          Estos {equipos.length} equipos ya están entregados y con su carta. Para clasificarlos todos igual: <b>Marcar
          los {equipos.length}</b>, elige la clasificación y <b>Guardar</b>.
        </p>
      ) : null}
      {equipos.some((e) => e.estado === "ASIGNADO") ? (
        <p className="text-xs text-soft">
          Los equipos que ya tienen dueño traen el departamento de esa persona. Cambiarlo aquí solo cambia el del{" "}
          <b>equipo</b>: el del empleado se edita en su ficha.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Badge tono="gris">Nada se guarda hasta pulsar “Guardar”</Badge>
      </div>
    </div>
  );
}
