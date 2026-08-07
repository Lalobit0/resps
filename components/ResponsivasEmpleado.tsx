"use client";

import Link from "next/link";
import { ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import EliminarResponsivaBtn from "./EliminarResponsivaBtn";
import SubirFirmadaBtn from "./SubirFirmadaBtn";
import { EditarClaseBtn } from "./ClaseResponsiva";
import VerPdfBtn from "./VerPdfBtn";
import CorregirResponsivaBtn from "./CorregirResponsivaBtn";
import { Badge, Card, Empty, btnGhost, tdCls, thCls } from "./ui";

function puedeDevolver(r: { tipo: string; estado: string; clase: string }): boolean {
  return r.tipo === "ASIGNACION" && r.estado === "VIGENTE" && r.clase !== "WIFI" && r.clase !== "VALE";
}

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
  /** Escaneo de la carta firmada en papel; sin él la responsiva está pendiente de firma. */
  pdf_firmado?: string | null;
};

/** Una responsiva cuenta como firmada si hay documento firmado o llegó ya firmada. */
export function estaFirmada(r: FilaResponsiva): boolean {
  return !!r.pdf_firmado || r.origen === "CARGADA";
}

/**
 * Tabla de responsivas del empleado con vista previa del documento DENTRO de
 * la app: al dar "Ver" el PDF (o imagen escaneada) se abre a un lado, sin
 * salir a otra pestaña.
 */
export default function ResponsivasEmpleado({ responsivas }: { responsivas: FilaResponsiva[] }) {
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
            <th className={thCls}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {responsivas.map((r) => (
            <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-paper/40">
              <td className={`${tdCls} mono text-xs font-semibold`}>{r.folio}</td>
              <td className={`${tdCls} text-xs`}>
                {r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {ETIQUETA_CLASE[r.clase] ?? r.clase}{" "}
                {r.origen === "CARGADA" ? <Badge tono="ambar">Cargada</Badge> : null}
                {estaFirmada(r) ? null : <Badge tono="rojo">Sin firmar</Badge>}
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
                <div className="flex flex-wrap gap-1.5">
                  {r.pdf_path || r.pdf_firmado ? (
                    <VerPdfBtn
                      id={r.id}
                      folio={r.folio}
                      etiqueta="Ver"
                      className={btnGhost}
                      subtitulo={`${r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · ${ETIQUETA_CLASE[r.clase] ?? r.clase} · ${fechaCorta(r.fecha)}`}
                    />
                  ) : null}
                  {estaFirmada(r) ? null : (
                    <>
                      <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                        Imprimir
                      </a>
                      <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
                    </>
                  )}
                  <EditarClaseBtn id={r.id} folio={r.folio} clase={r.clase} tipo={r.tipo} className={btnGhost} />
                  <CorregirResponsivaBtn id={r.id} folio={r.folio} tipo={r.tipo} className={btnGhost} />
                  {puedeDevolver(r) ? (
                    <Link href={`/responsivas/${r.id}/devolucion`} className={btnGhost}>
                      Devolución
                    </Link>
                  ) : null}
                  <EliminarResponsivaBtn id={r.id} folio={r.folio} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return tabla;
}
