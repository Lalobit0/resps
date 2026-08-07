"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generarResponsivasEnLote, type ResultadoGeneracion } from "../app/responsivas/actions";
import { ETIQUETA_TIPO, TIPOS_EQUIPO } from "../lib/constants";
import type { EquipoSinResponsiva, LoteGenerado } from "../lib/pendientes";
import { Badge, Card, Empty, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

/** Departamento + área, que es como se reparten las cartas en piso. */
function seccionDe(e: EquipoSinResponsiva): string {
  const area = (e.empleado_area ?? "").trim();
  return area ? `${e.empleado_departamento} · ${area}` : e.empleado_departamento;
}

export default function GenerarLoteClient({
  equipos,
  lotes,
  hoy,
}: {
  equipos: EquipoSinResponsiva[];
  lotes: LoteGenerado[];
  hoy: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState("");
  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [observaciones, setObservaciones] = useState("");
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<ResultadoGeneracion | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const secciones = useMemo(() => [...new Set(equipos.map(seccionDe))].sort((a, b) => a.localeCompare(b)), [equipos]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return equipos.filter((e) => {
      if (seccion && seccionDe(e) !== seccion) return false;
      if (tipo && e.tipo !== tipo) return false;
      if (!texto) return true;
      return [e.codigo, e.marca, e.modelo, e.numero_serie, e.empleado_nombre, e.empleado_numero, e.empleado_puesto]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texto));
    });
  }, [equipos, q, seccion, tipo]);

  // Agrupado por sección para poder marcar un área completa de un clic.
  const grupos = useMemo(() => {
    const mapa = new Map<string, EquipoSinResponsiva[]>();
    for (const e of visibles) {
      const k = seccionDe(e);
      const lista = mapa.get(k);
      if (lista) lista.push(e);
      else mapa.set(k, [e]);
    }
    return [...mapa.entries()];
  }, [visibles]);

  const alternar = (id: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const marcar = (ids: number[], valor: boolean) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      for (const id of ids) {
        if (valor) s.add(id);
        else s.delete(id);
      }
      return s;
    });

  const idsVisibles = visibles.map((e) => e.id);
  const todosVisiblesMarcados = idsVisibles.length > 0 && idsVisibles.every((id) => elegidos.has(id));

  const generar = () => {
    const ids = [...elegidos];
    if (!ids.length) {
      setError("Marca las responsivas que quieres generar.");
      return;
    }
    if (!confirm(`Se van a generar ${ids.length} responsiva(s) sin firma, listas para imprimir.\n\n¿Continuar?`)) return;
    setError("");
    setResultado(null);
    iniciar(async () => {
      const res = await generarResponsivasEnLote(ids, { fecha, observaciones });
      if (res.ok && res.resultado) {
        setResultado(res.resultado);
        setElegidos(new Set());
        router.refresh();
      } else {
        setError(res.error ?? "No se pudieron generar.");
        if (res.resultado) setResultado(res.resultado);
      }
    });
  };

  return (
    <div className="space-y-5">
      {resultado && resultado.generadas.length ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
          <h2 className="text-base font-bold text-emerald-900">
            Listas {resultado.generadas.length} responsiva(s) · lote {resultado.lote}
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            Imprime el paquete, junta las firmas y súbelo escaneado. Mientras tanto aparecen como pendientes de firma.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className={btnPrimary}
              href={`/api/impresion/${resultado.lote}`}
              target="_blank"
              rel="noreferrer"
            >
              ↧ Abrir el PDF para imprimir ({resultado.generadas.length} hojas)
            </a>
            <Link className={btnGhost} href={`/responsivas/lote?lote=${resultado.lote}`}>
              Subir las firmadas
            </Link>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Ver los folios generados</summary>
            <ul className="mt-2 space-y-1 text-xs text-emerald-900">
              {resultado.generadas.map((g) => (
                <li key={g.folio}>
                  <span className="mono font-semibold">{g.folio}</span> · {g.empleado} · {g.equipo}
                </li>
              ))}
            </ul>
          </details>
          {resultado.omitidas.length ? (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-900">
                {resultado.omitidas.length} no se generaron:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
                {resultado.omitidas.map((o, i) => (
                  <li key={i}>
                    {o.equipo} ({o.empleado}) — {o.motivo}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {equipos.length === 0 ? (
        <Empty>Todos los equipos entregados ya tienen su carta responsiva. No hay nada que generar.</Empty>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">Buscar</label>
              <input
                className={inputCls}
                placeholder="Empleado, número, equipo, serie…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">Sección</label>
              <select className={inputCls} value={seccion} onChange={(e) => setSeccion(e.target.value)}>
                <option value="">Todas las secciones</option>
                {secciones.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">Tipo de equipo</label>
              <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {TIPOS_EQUIPO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[150px]">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">Fecha de las cartas</label>
              <input type="date" className={inputCls} max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">
              Observaciones (van en todas las cartas del lote, opcional)
            </label>
            <input
              className={inputCls}
              placeholder="Ej. Entrega de equipo en sitio"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button className={btnGhost} onClick={() => marcar(idsVisibles, !todosVisiblesMarcados)}>
              {todosVisiblesMarcados ? "Quitar la marca de" : "Marcar"} las {visibles.length} que se ven
            </button>
            {elegidos.size ? (
              <button className={btnGhost} onClick={() => setElegidos(new Set())}>
                Limpiar la selección
              </button>
            ) : null}
            <span className="text-sm text-soft">
              {elegidos.size} de {equipos.length} marcadas
            </span>
            <button className={`${btnPrimary} ml-auto`} disabled={pendiente || !elegidos.size} onClick={generar}>
              {pendiente ? "Generando…" : `Generar ${elegidos.size || ""} responsiva(s) e imprimir`}
            </button>
          </div>
        </Card>
      )}

      {grupos.map(([nombre, lista]) => {
        const ids = lista.map((e) => e.id);
        const todos = ids.every((id) => elegidos.has(id));
        return (
          <Card key={nombre} className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-kraft"
                  checked={todos}
                  onChange={() => marcar(ids, !todos)}
                  aria-label={`Marcar ${nombre}`}
                />
                <span className="text-sm font-bold text-ink">{nombre}</span>
                <Badge tono="gris">{lista.length}</Badge>
              </div>
              <button className="text-xs font-semibold text-kraft-dark hover:underline" onClick={() => marcar(ids, !todos)}>
                {todos ? "Quitar toda la sección" : "Marcar toda la sección"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-paper/70">
                  <tr>
                    <th className={`${thCls} w-10`}></th>
                    <th className={thCls}>Empleado</th>
                    <th className={thCls}>Puesto</th>
                    <th className={thCls}>Equipo</th>
                    <th className={thCls}>Serie</th>
                    <th className={thCls}>Carta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lista.map((e) => (
                    <tr key={e.id} className={elegidos.has(e.id) ? "bg-kraft/5" : undefined}>
                      <td className={tdCls}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-kraft"
                          checked={elegidos.has(e.id)}
                          onChange={() => alternar(e.id)}
                          aria-label={`Marcar ${e.codigo}`}
                        />
                      </td>
                      <td className={tdCls}>
                        <Link href={`/empleados/${e.asignado_a}`} className="font-semibold text-ink hover:underline">
                          {e.empleado_numero} · {e.empleado_nombre}
                        </Link>
                        {e.empleado_clase ? <div className="text-xs text-soft">{e.empleado_clase}</div> : null}
                      </td>
                      <td className={`${tdCls} text-xs text-soft`}>{e.empleado_puesto}</td>
                      <td className={tdCls}>
                        <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>
                        <div className="text-xs text-soft">
                          {e.marca} {e.modelo}
                        </div>
                      </td>
                      <td className={`${tdCls} mono text-xs`}>{e.numero_serie || "—"}</td>
                      <td className={tdCls}>
                        <Badge tono="petrol">{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {equipos.length && !visibles.length ? <Empty>Ningún equipo coincide con el filtro.</Empty> : null}

      {lotes.length ? (
        <Card>
          <h2 className="text-base font-bold text-ink">Lotes generados</h2>
          <p className="mt-1 text-sm text-soft">
            Vuelve a imprimir un paquete completo, solo lo que falta por firmar, o sube el escaneo ya firmado.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-paper/70">
                <tr>
                  <th className={thCls}>Lote</th>
                  <th className={thCls}>Secciones</th>
                  <th className={thCls}>Cartas</th>
                  <th className={thCls}>Sin firmar</th>
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lotes.map((l) => (
                  <tr key={l.lote}>
                    <td className={tdCls}>
                      <span className="mono text-xs font-semibold text-kraft-dark">{l.lote}</span>
                      <div className="text-xs text-soft">{l.creado?.slice(0, 16)}</div>
                    </td>
                    <td className={`${tdCls} text-xs text-soft`}>{l.departamentos || "—"}</td>
                    <td className={tdCls}>{l.total}</td>
                    <td className={tdCls}>
                      {l.sin_firma ? <Badge tono="ambar">{l.sin_firma}</Badge> : <Badge tono="verde">Todas firmadas</Badge>}
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1.5">
                        <a className={btnGhost} href={`/api/impresion/${l.lote}`} target="_blank" rel="noreferrer">
                          Imprimir todo
                        </a>
                        {l.sin_firma ? (
                          <a className={btnGhost} href={`/api/impresion/${l.lote}?pendientes=1`} target="_blank" rel="noreferrer">
                            Solo las {l.sin_firma} sin firmar
                          </a>
                        ) : null}
                        <Link className={btnGhost} href={`/responsivas/lote?lote=${l.lote}`}>
                          Subir firmadas
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
