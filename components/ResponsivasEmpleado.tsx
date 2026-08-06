"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLASES_CARTA, ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import EliminarResponsivaBtn from "./EliminarResponsivaBtn";
import SubirFirmadaBtn from "./SubirFirmadaBtn";
import { cambiarClaseResponsiva } from "../app/responsivas/actions";
import { Badge, Card, Empty, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

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
  const router = useRouter();
  const [sel, setSel] = useState<FilaResponsiva | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  /** Corrige el tipo de carta: un escaneo que no se pudo leer entra como cómputo. */
  const corregirClase = (id: number, clase: string) => {
    setError("");
    iniciar(async () => {
      const res = await cambiarClaseResponsiva(id, clase);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo cambiar el tipo.");
    });
  };

  if (responsivas.length === 0) {
    return <Empty>Este empleado no tiene responsivas registradas.</Empty>;
  }

  const tabla = (
    <Card className="overflow-x-auto p-0">
      {error ? <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div> : null}
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
            <tr
              key={r.id}
              className={`border-b border-line/60 last:border-0 ${sel?.id === r.id ? "bg-orange-50/60" : "hover:bg-paper/40"}`}
            >
              <td className={`${tdCls} mono text-xs font-semibold`}>{r.folio}</td>
              <td className={`${tdCls} text-xs`}>
                <div className="flex flex-wrap items-center gap-1">
                  <span>{r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} ·</span>
                  {r.tipo === "ASIGNACION" ? (
                    <select
                      className={`${inputCls} max-w-[160px] py-0.5 text-xs`}
                      value={r.clase}
                      disabled={pendiente}
                      onChange={(e) => corregirClase(r.id, e.target.value)}
                      title="Tipo de carta. Cámbialo si se cargó mal (por ejemplo, una de Wi-Fi que entró como cómputo)."
                    >
                      {CLASES_CARTA.map((c) => (
                        <option key={c} value={c}>
                          {ETIQUETA_CLASE[c] ?? c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{ETIQUETA_CLASE[r.clase] ?? r.clase}</span>
                  )}
                  {r.origen === "CARGADA" ? <Badge tono="ambar">Cargada</Badge> : null}
                  {estaFirmada(r) ? null : <Badge tono="rojo">Sin firmar</Badge>}
                </div>
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
                  {r.pdf_path ? (
                    <button
                      className={sel?.id === r.id ? btnPrimary : btnGhost}
                      onClick={() => setSel(sel?.id === r.id ? null : r)}
                    >
                      {sel?.id === r.id ? "Ocultar" : "Ver"}
                    </button>
                  ) : null}
                  {estaFirmada(r) ? null : (
                    <>
                      <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                        Imprimir
                      </a>
                      <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
                    </>
                  )}
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

  if (!sel) return tabla;

  // Con el preview abierto la lista se compacta a una columna angosta y el
  // documento se lleva casi todo el ancho.
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
        {responsivas.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!r.pdf_path}
            onClick={() => r.pdf_path && setSel(r)}
            className={`block w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              sel.id === r.id
                ? "border-kraft bg-orange-50/70"
                : r.pdf_path
                  ? "border-line bg-white hover:bg-paper/60"
                  : "cursor-default border-line bg-white opacity-60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-xs font-semibold text-kraft-dark">{r.folio}</span>
              {estaFirmada(r) ? null : <Badge tono="rojo">Sin firmar</Badge>}
              {r.tipo === "DEVOLUCION" ? null : r.estado === "VIGENTE" ? (
                <Badge tono="verde">Vigente</Badge>
              ) : (
                <Badge tono="gris">Cerrada</Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-soft">
              {r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {ETIQUETA_CLASE[r.clase] ?? r.clase} ·{" "}
              {fechaCorta(r.fecha)}
            </div>
            {r.equipos ? <div className="mono mt-0.5 text-[11px] text-soft">{r.equipos}</div> : null}
          </button>
        ))}
      </div>
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
          <iframe title={`Responsiva ${sel.folio}`} src={`/api/pdf/${sel.id}`} className="h-[80vh] w-full rounded-md border border-line bg-white" />
        </Card>
      </div>
    </div>
  );
}
