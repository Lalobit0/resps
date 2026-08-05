"use client";

import Link from "next/link";
import { useState } from "react";
import type { Equipo } from "../lib/types";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import type { ResponsivaDeEquipo } from "./InventarioClient";
import { Badge, Card, btnGhost, tdCls, thCls, tonoEstadoEquipo } from "./ui";

const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniAzul = "rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-100";

/**
 * Equipos que tiene el empleado, con todo lo que se necesita hacer desde aquí:
 * editar el equipo, ver su carta responsiva y cargar la firmada, sin tener que
 * ir a buscarlo al inventario.
 */
export default function EquiposEmpleado({
  empleadoId,
  equipos,
  responsivas,
  sinResponsiva,
}: {
  empleadoId: number;
  equipos: Equipo[];
  responsivas: Record<number, ResponsivaDeEquipo[]>;
  sinResponsiva: number[];
}) {
  const falta = new Set(sinResponsiva);
  const [ver, setVer] = useState<ResponsivaDeEquipo | null>(null);

  return (
    <>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="border-b border-line bg-paper/70">
            <tr>
              <th className={thCls}>Código</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>Equipo</th>
              <th className={thCls}>Serie</th>
              <th className={thCls}>Detalle</th>
              <th className={thCls}>Estado</th>
              <th className={thCls}>Responsiva</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => {
              const cartas = responsivas[e.id] ?? [];
              return (
                <tr key={e.id} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{e.codigo}</td>
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</td>
                  <td className={tdCls}>
                    {e.marca} {e.modelo}
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{e.numero_serie ?? "—"}</td>
                  <td className={`${tdCls} text-xs text-soft`}>{e.specs ?? "—"}</td>
                  <td className={tdCls}>
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                  </td>
                  <td className={tdCls}>
                    {cartas.length ? (
                      <div className="flex flex-wrap gap-1">
                        {cartas.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!r.pdf_path}
                            onClick={() => r.pdf_path && setVer(r)}
                            title={
                              r.pdf_path
                                ? `${r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · ${fechaCorta(r.fecha)} · ver documento`
                                : "Esta responsiva no tiene documento guardado"
                            }
                            className={`mono rounded border px-1.5 py-0.5 text-[11px] ${
                              r.pdf_path
                                ? "border-line bg-white text-kraft-dark hover:bg-paper"
                                : "cursor-default border-line bg-white text-soft opacity-70"
                            }`}
                          >
                            {r.folio}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-soft">Sin responsiva</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap items-center gap-1">
                      <Link className={mini} href={`/inventario?editar=${e.id}`} title="Editar los datos del equipo">
                        Editar
                      </Link>
                      <Link
                        className={mini}
                        href={`/responsivas/cargar?empleado=${empleadoId}&equipo=${e.id}`}
                        title="Subir la carta ya firmada de este equipo"
                      >
                        Cargar responsiva
                      </Link>
                      {falta.has(e.id) ? (
                        <Link
                          className={miniAzul}
                          href={`/responsivas/nueva?equipo=${e.id}`}
                          title="Generar la carta para que la firme"
                        >
                          + Responsiva
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {ver ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setVer(null)}>
          <div
            className="flex h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-line bg-white p-3 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="mono text-xs font-semibold text-kraft-dark">{ver.folio}</p>
                <p className="text-xs text-soft">
                  {ver.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {fechaCorta(ver.fecha)} ·{" "}
                  {ver.estado === "VIGENTE" ? "Vigente" : "Cerrada"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <a href={`/api/pdf/${ver.id}`} target="_blank" className={btnGhost}>
                  Abrir en pestaña ↗
                </a>
                <button className={btnGhost} onClick={() => setVer(null)}>
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <iframe
              title={`Responsiva ${ver.folio}`}
              src={`/api/pdf/${ver.id}`}
              className="h-full w-full rounded-md border border-line bg-white"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
