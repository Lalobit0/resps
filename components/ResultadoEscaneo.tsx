"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado } from "../lib/types";
import type { LineaEscaneo, ResultadoEscaneo } from "../app/inventario/actions";
import { asignarEquipo } from "../app/empleados/actions";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { Badge, Card, btnGhost, tdCls, thCls } from "./ui";

const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniAzul = "rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-100";

const ETIQUETA_ACCION: Record<LineaEscaneo["accion"], { texto: string; tono: "verde" | "petrol" | "gris" }> = {
  NUEVO: { texto: "Alta nueva", tono: "verde" },
  ACTUALIZADO: { texto: "Actualizado", tono: "petrol" },
  IGUAL: { texto: "Ya estaba al día", tono: "gris" },
};

/**
 * Resultado del escaneo de las PCs, equipo por equipo y con qué hacer en cada
 * caso: ver al empleado, corregir el equipo, generar su responsiva o —cuando el
 * usuario del escaneo no existe— elegir ahí mismo a quién se le asigna.
 */
export default function ResultadoEscaneo({
  escaneo,
  empleados,
  onCerrar,
}: {
  escaneo: ResultadoEscaneo;
  empleados: Empleado[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaEscaneo[]>(escaneo.lineas);
  const [eligiendo, setEligiendo] = useState<Record<number, number | null>>({});
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const asignar = (linea: LineaEscaneo) => {
    const empId = eligiendo[linea.equipoId];
    if (!empId) {
      setError(`Elige al empleado de ${linea.codigo}.`);
      return;
    }
    setError("");
    iniciar(async () => {
      const res = await asignarEquipo(empId, linea.equipoId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo asignar.");
        return;
      }
      const emp = empleados.find((e) => e.id === empId);
      setLineas((ls) =>
        ls.map((l) =>
          l.equipoId === linea.equipoId
            ? {
                ...l,
                empleadoId: empId,
                empleadoTexto: emp ? `${emp.numero_empleado} ${emp.nombre}` : "asignado",
                ligadoAhora: true,
                aviso: "",
                sinResponsiva: true,
              }
            : l
        )
      );
      router.refresh();
    });
  };

  const pendientesDeElegir = lineas.filter((l) => !l.empleadoId).length;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Resultado del escaneo</h2>
          <p className="mt-0.5 text-sm text-soft">
            Se leyeron <b>{escaneo.leidos}</b> equipos: <b>{escaneo.nuevos}</b> nuevos, <b>{escaneo.actualizados}</b>{" "}
            actualizados, <b>{escaneo.iguales}</b> ya estaban al día, <b>{escaneo.ligados}</b> ligados a su empleado.
            {pendientesDeElegir > 0 ? (
              <>
                {" "}
                Faltan <b>{pendientesDeElegir}</b> por asignar.
              </>
            ) : null}
          </p>
        </div>
        <button className={btnGhost} onClick={onCerrar}>
          ✕ Cerrar
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="border-b border-line bg-paper/70">
            <tr>
              <th className={thCls}>Equipo</th>
              <th className={thCls}>Qué pasó</th>
              <th className={thCls}>Empleado</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.equipoId} className="border-b border-line/60 last:border-0 align-top">
                <td className={tdCls}>
                  <div className="mono text-xs font-semibold text-kraft-dark">{l.codigo}</div>
                  <div className="text-sm">{l.descripcion}</div>
                  <div className="mono text-xs text-soft">Serie {l.serie}</div>
                </td>
                <td className={tdCls}>
                  <Badge tono={ETIQUETA_ACCION[l.accion].tono}>{ETIQUETA_ACCION[l.accion].texto}</Badge>
                  {l.cambios.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-soft">
                      {l.cambios.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className={tdCls}>
                  {l.empleadoId && l.empleadoTexto ? (
                    <Link href={`/empleados/${l.empleadoId}`} className="text-sm hover:text-kraft hover:underline">
                      {l.empleadoTexto}
                      {l.ligadoAhora ? <span className="ml-1 text-xs text-emerald-700">(ligado)</span> : null}
                    </Link>
                  ) : (
                    <div className="space-y-1">
                      {l.aviso ? <p className="text-xs text-amber-800">{l.aviso}</p> : null}
                      <div className="w-64">
                        <BuscadorEmpleado
                          empleados={empleados}
                          value={eligiendo[l.equipoId] ?? null}
                          onChange={(id) => setEligiendo((p) => ({ ...p, [l.equipoId]: id }))}
                        />
                      </div>
                      <button className={miniAzul} disabled={pendiente} onClick={() => asignar(l)}>
                        {pendiente ? "Asignando…" : "Asignar a este empleado"}
                      </button>
                    </div>
                  )}
                </td>
                <td className={tdCls}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Link className={mini} href={`/inventario?editar=${l.equipoId}`} title="Corregir los datos del equipo">
                      Editar
                    </Link>
                    {l.sinResponsiva ? (
                      <Link className={miniAzul} href={`/responsivas/nueva?equipo=${l.equipoId}`}>
                        + Responsiva
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {escaneo.sinSerie.length || escaneo.ilegibles.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <p className="font-semibold">No se pudieron cargar:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {escaneo.sinSerie.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {escaneo.ilegibles.map((x) => (
              <li key={x}>{x} — no se reconoció el formato</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
