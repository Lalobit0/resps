"use client";

import { useState } from "react";
import { ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { Badge, Card, Empty, btnGhost, btnPrimary, tdCls, thCls } from "./ui";

export type FilaResponsiva = {
  id: number;
  folio: string;
  tipo: string;
  clase: string;
  origen: string | null;
  equipos: string | null;
  fecha: string;
  estado: string;
  pdf_path: string | null;
};

/**
 * Tabla de responsivas del empleado con vista previa del documento DENTRO de
 * la app: al dar "Ver" el PDF (o imagen escaneada) se abre a un lado, sin
 * salir a otra pestaña.
 */
export default function ResponsivasEmpleado({ responsivas }: { responsivas: FilaResponsiva[] }) {
  const [sel, setSel] = useState<FilaResponsiva | null>(null);

  if (responsivas.length === 0) {
    return <Empty>Este empleado no tiene responsivas registradas.</Empty>;
  }

  const tabla = (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] border-collapse">
        <thead className="border-b border-line bg-paper/70">
          <tr>
            <th className={thCls}>Folio</th>
            <th className={thCls}>Tipo</th>
            <th className={thCls}>Equipos</th>
            <th className={thCls}>Fecha</th>
            <th className={thCls}>Estado</th>
            <th className={thCls}>PDF</th>
          </tr>
        </thead>
        <tbody>
          {responsivas.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-line/60 last:border-0 ${sel?.id === r.id ? "bg-orange-50/60" : "hover:bg-paper/40"}`}
            >
              <td className={`${tdCls} mono text-xs font-semibold`}>{r.folio}</td>
              <td className={`${tdCls} text-xs`}>
                {r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {ETIQUETA_CLASE[r.clase] ?? r.clase}{" "}
                {r.origen === "CARGADA" ? <Badge tono="ambar">Cargada</Badge> : null}
              </td>
              <td className={`${tdCls} mono text-xs`}>{r.equipos ?? "—"}</td>
              <td className={tdCls}>{fechaCorta(r.fecha)}</td>
              <td className={tdCls}>
                {r.tipo === "DEVOLUCION" ? (
                  <span className="text-soft">—</span>
                ) : r.estado === "VIGENTE" ? (
                  <Badge tono="verde">Vigente</Badge>
                ) : (
                  <Badge tono="gris">Cerrada</Badge>
                )}
              </td>
              <td className={tdCls}>
                {r.pdf_path ? (
                  <button
                    className={sel?.id === r.id ? btnPrimary : btnGhost}
                    onClick={() => setSel(sel?.id === r.id ? null : r)}
                  >
                    {sel?.id === r.id ? "Ocultar" : "Ver"}
                  </button>
                ) : (
                  <span className="text-soft">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  if (!sel) return tabla;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>{tabla}</div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="mono text-xs font-semibold text-kraft-dark">{sel.folio}</p>
            <div className="flex gap-1.5">
              <a href={`/api/pdf/${sel.id}`} target="_blank" className={btnGhost}>
                Abrir en pestaña ↗
              </a>
              <button className={btnGhost} onClick={() => setSel(null)}>
                ✕ Cerrar
              </button>
            </div>
          </div>
          <iframe title={`Responsiva ${sel.folio}`} src={`/api/pdf/${sel.id}`} className="h-[75vh] w-full rounded-md border border-line bg-white" />
        </Card>
      </div>
    </div>
  );
}
