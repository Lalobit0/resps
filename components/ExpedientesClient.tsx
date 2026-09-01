"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ResumenExpediente } from "../lib/expedientes";
import { Badge, Empty, Label, inputCls, tdCls, thCls } from "./ui";

/**
 * Barra de cumplimiento.
 *
 * El color va acompañado siempre del número: el punto 24 pide que el color
 * nunca sea la única forma de leer el estado.
 */
function Barra({ porcentaje, nivel }: { porcentaje: number; nivel: string }) {
  const color = nivel === "CRITICO" ? "bg-red-500" : nivel === "COMPLETO" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={`h-full ${color}`} style={{ width: `${Math.max(porcentaje, 2)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{porcentaje}%</span>
    </div>
  );
}

const ETIQUETA_NIVEL: Record<string, string> = {
  COMPLETO: "Completo",
  INCOMPLETO: "Incompleto",
  CRITICO: "Crítico",
};

type Orden = "atencion" | "nombre" | "cumplimiento" | "departamento";

export default function ExpedientesClient({
  filas,
  sinMatriz,
  puedeConfigurar,
}: {
  filas: ResumenExpediente[];
  sinMatriz: boolean;
  puedeConfigurar: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [nivel, setNivel] = useState("");
  const [problema, setProblema] = useState("");
  const [orden, setOrden] = useState<Orden>("atencion");

  const departamentos = useMemo(
    () => [...new Set(filas.map((f) => f.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [filas]
  );

  const totales = useMemo(() => {
    const t = { faltantes: 0, vencidos: 0, porVencer: 0, porValidar: 0, rechazados: 0, criticos: 0, completos: 0 };
    for (const f of filas) {
      t.faltantes += f.cumplimiento.faltantes;
      t.vencidos += f.cumplimiento.vencidos;
      t.porVencer += f.cumplimiento.porVencer;
      t.porValidar += f.cumplimiento.porValidar;
      t.rechazados += f.cumplimiento.rechazados;
      if (f.cumplimiento.nivel === "CRITICO") t.criticos++;
      if (f.cumplimiento.nivel === "COMPLETO") t.completos++;
    }
    return t;
  }, [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = filas.filter((f) => {
      if (departamento && f.departamento !== departamento) return false;
      if (nivel && f.cumplimiento.nivel !== nivel) return false;
      if (problema === "faltantes" && f.cumplimiento.faltantes === 0) return false;
      if (problema === "vencidos" && f.cumplimiento.vencidos === 0) return false;
      if (problema === "porVencer" && f.cumplimiento.porVencer === 0) return false;
      if (problema === "porValidar" && f.cumplimiento.porValidar === 0) return false;
      if (problema === "rechazados" && f.cumplimiento.rechazados === 0) return false;
      if (!q) return true;
      return `${f.nombre} ${f.numero_empleado} ${f.puesto} ${f.departamento} ${f.area ?? ""}`.toLowerCase().includes(q);
    });

    const gravedad = (f: ResumenExpediente) =>
      f.cumplimiento.criticosPendientes * 1000 + f.cumplimiento.vencidos * 100 + f.cumplimiento.faltantes * 10;

    return [...lista].sort((a, b) => {
      switch (orden) {
        case "nombre":
          return a.nombre.localeCompare(b.nombre);
        case "cumplimiento":
          return a.cumplimiento.porcentaje - b.cumplimiento.porcentaje || a.nombre.localeCompare(b.nombre);
        case "departamento":
          return a.departamento.localeCompare(b.departamento) || a.nombre.localeCompare(b.nombre);
        default:
          // Primero quien más necesita atención hoy.
          return gravedad(b) - gravedad(a) || a.cumplimiento.porcentaje - b.cumplimiento.porcentaje;
      }
    });
  }, [filas, busqueda, departamento, nivel, problema, orden]);

  if (sinMatriz) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
        <h2 className="font-bold text-amber-900">Los expedientes están vacíos porque todavía no se pide nada</h2>
        <p className="mt-2 max-w-3xl text-sm text-amber-900">
          El sistema sabe quién es cada persona, pero no qué documentos debe tener. Esa decisión está en la{" "}
          <b>matriz de requisitos</b>: mientras esté vacía, todos aparecen al 100% simplemente porque no se les está
          pidiendo nada.
        </p>
        {puedeConfigurar ? (
          <Link
            href="/configuracion/matriz"
            className="mt-4 inline-flex rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
          >
            Definir qué se le pide a quién
          </Link>
        ) : (
          <p className="mt-3 text-sm text-amber-900">Pídele a quien administra RH que configure la matriz.</p>
        )}
      </div>
    );
  }

  const tarjetas = [
    { clave: "", etiqueta: "Todos", valor: filas.length, tono: "" },
    { clave: "vencidos", etiqueta: "Vencidos", valor: totales.vencidos, tono: "text-red-700" },
    { clave: "faltantes", etiqueta: "Faltantes", valor: totales.faltantes, tono: "text-red-700" },
    { clave: "porVencer", etiqueta: "Por vencer", valor: totales.porVencer, tono: "text-amber-700" },
    { clave: "porValidar", etiqueta: "Por validar", valor: totales.porValidar, tono: "text-amber-700" },
    { clave: "rechazados", etiqueta: "Rechazados", valor: totales.rechazados, tono: "text-red-700" },
  ];

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        {tarjetas.map((t) => {
          const activa = problema === t.clave;
          return (
            <button
              key={t.etiqueta}
              onClick={() => setProblema(t.clave)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                activa ? "border-kraft bg-white shadow-sm" : "border-line bg-card hover:border-kraft/50"
              }`}
            >
              <div className={`text-2xl font-bold tabular-nums ${t.tono || "text-ink"}`}>{t.valor}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-soft">{t.etiqueta}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>Buscar</Label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, número, puesto…"
            className={`${inputCls} w-60`}
          />
        </div>
        <div>
          <Label>Departamento</Label>
          <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={`${inputCls} w-52`}>
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Estado</Label>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={`${inputCls} w-40`}>
            <option value="">Cualquiera</option>
            <option value="CRITICO">Crítico</option>
            <option value="INCOMPLETO">Incompleto</option>
            <option value="COMPLETO">Completo</option>
          </select>
        </div>
        <div>
          <Label>Ordenar por</Label>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={`${inputCls} w-52`}>
            <option value="atencion">Lo que necesita atención</option>
            <option value="cumplimiento">Menor cumplimiento</option>
            <option value="nombre">Nombre</option>
            <option value="departamento">Departamento</option>
          </select>
        </div>
        <p className="pb-2 text-sm text-soft">
          {visibles.length} de {filas.length}
        </p>
      </div>

      {visibles.length === 0 ? (
        <Empty>Nadie coincide con eso. Prueba quitando algún filtro.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full">
            <thead className="border-b border-line bg-paper/60">
              <tr>
                <th className={thCls}>Empleado</th>
                <th className={thCls}>Departamento</th>
                <th className={thCls}>Puesto</th>
                <th className={thCls}>Cumplimiento</th>
                <th className={thCls}>Qué le pasa</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((f) => {
                const c = f.cumplimiento;
                return (
                  <tr key={f.empleado_id} className="hover:bg-paper/40">
                    <td className={tdCls}>
                      <Link href={`/expedientes/${f.empleado_id}`} className="font-medium text-ink hover:underline">
                        {f.nombre}
                      </Link>
                      <div className="font-mono text-[11px] text-soft">{f.numero_empleado}</div>
                    </td>
                    <td className={tdCls}>
                      {f.departamento}
                      {f.area ? <div className="text-xs text-soft">{f.area}</div> : null}
                    </td>
                    <td className={`${tdCls} text-soft`}>{f.puesto}</td>
                    <td className={tdCls}>
                      <Barra porcentaje={c.porcentaje} nivel={c.nivel} />
                      <div className="mt-1 text-xs text-soft">
                        {c.obligatoriosCubiertos} de {c.obligatorios} obligatorios
                      </div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        {/* "Completo" solo dice algo cuando de verdad se le pidió algo. */}
                        {c.nivel === "COMPLETO" && c.total > 0 ? <Badge tono="verde">Completo</Badge> : null}
                        {c.criticosPendientes ? <Badge tono="rojo">{c.criticosPendientes} críticos</Badge> : null}
                        {c.vencidos ? <Badge tono="rojo">{c.vencidos} vencidos</Badge> : null}
                        {c.rechazados ? <Badge tono="rojo">{c.rechazados} rechazados</Badge> : null}
                        {c.faltantes ? <Badge tono="ambar">{c.faltantes} faltantes</Badge> : null}
                        {c.porVencer ? <Badge tono="ambar">{c.porVencer} por vencer</Badge> : null}
                        {c.porValidar ? <Badge tono="ambar">{c.porValidar} por validar</Badge> : null}
                        {c.noAplica ? <Badge tono="gris">{c.noAplica} no aplican</Badge> : null}
                        {c.total === 0 ? <Badge tono="gris">Sin requisitos</Badge> : null}
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Link
                        href={`/expedientes/${f.empleado_id}`}
                        className="inline-flex rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-soft">
        {totales.completos} de {filas.length} expedientes completos · {ETIQUETA_NIVEL.CRITICO}: {totales.criticos}
      </p>
    </>
  );
}
