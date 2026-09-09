"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ResponsivaLista } from "../lib/types";
import { ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { Badge, Card, btnGhost } from "./ui";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";
import EliminarResponsivaBtn from "./EliminarResponsivaBtn";
import SubirFirmadaBtn from "./SubirFirmadaBtn";
import { EditarClaseBtn } from "./ClaseResponsiva";
import CorregirResponsivaBtn from "./CorregirResponsivaBtn";
import VerPdfBtn from "./VerPdfBtn";
import RegenerarResponsivaBtn from "./RegenerarResponsivaBtn";

/**
 * Listado de cartas responsivas.
 *
 * Las columnas se ajustan de ancho y el título de cada una abre su menú para
 * ordenar y para dejar solo los valores que se palomeen; los desplegables de
 * arriba siguen sirviendo para lo mismo desde la URL.
 */

const tdc = "text-sm text-ink align-top py-2";

/** La carta se firma en papel: falta mientras no se suba el escaneo. */
const faltaFirma = (r: ResponsivaLista) => r.origen !== "CARGADA" && !r.pdf_firmado;

const textoEstado = (r: ResponsivaLista) =>
  r.tipo === "DEVOLUCION" ? "" : r.estado === "VIGENTE" ? "Vigente" : "Cerrada";

export default function ResponsivasClient({ responsivas }: { responsivas: ResponsivaLista[] }) {
  const columnas = useMemo<Columna<ResponsivaLista>[]>(
    () => [
      {
        clave: "folio",
        titulo: "Folio",
        ancho: "9%",
        valor: (r) => r.folio,
        claseCelda: `${tdc} mono text-xs font-semibold`,
        celda: (r) => (
          <>
            {r.folio}
            {(r.es_duplicado ?? 0) > 0 ? (
              <div className="mt-1">
                <Badge tono="rojo">Posible duplicado</Badge>
              </div>
            ) : null}
          </>
        ),
      },
      {
        clave: "tipo",
        titulo: "Tipo",
        ancho: "8%",
        valor: (r) => (r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"),
        claseCelda: tdc,
        celda: (r) =>
          r.tipo === "ASIGNACION" ? <Badge tono="petrol">Asignación</Badge> : <Badge tono="kraft">Devolución</Badge>,
      },
      {
        clave: "carta",
        titulo: "Carta",
        ancho: "8%",
        valor: (r) => ETIQUETA_CLASE[r.clase] ?? r.clase,
        claseCelda: `${tdc} text-xs`,
      },
      { clave: "numero", titulo: "No.", ancho: "4%", valor: (r) => r.empleado_numero, claseCelda: `${tdc} mono text-xs` },
      {
        clave: "empleado",
        titulo: "Empleado",
        ancho: "14%",
        valor: (r) => r.empleado_nombre,
        claseCelda: `${tdc} font-medium`,
        celda: (r) => (
          <Link
            href={`/empleados/${r.empleado_id}`}
            className="text-ink hover:text-kraft hover:underline"
            title="Ver histórico"
          >
            {r.empleado_nombre}
          </Link>
        ),
      },
      {
        clave: "equipos",
        titulo: "Equipos",
        ancho: "8%",
        valor: (r) => r.equipos ?? "",
        claseCelda: `${tdc} mono text-xs`,
        celda: (r) => r.equipos ?? "—",
      },
      { clave: "fecha", titulo: "Fecha", ancho: "7%", valor: (r) => r.fecha, claseCelda: tdc, celda: (r) => fechaCorta(r.fecha) },
      {
        clave: "estado",
        titulo: "Estado",
        ancho: "7%",
        valor: textoEstado,
        claseCelda: tdc,
        celda: (r) =>
          r.tipo === "DEVOLUCION" ? (
            <span className="text-soft">—</span>
          ) : r.estado === "VIGENTE" ? (
            <Badge tono="verde">Vigente</Badge>
          ) : (
            <Badge tono="gris">Cerrada</Badge>
          ),
      },
      {
        clave: "firma",
        titulo: "Firma",
        ancho: "7%",
        valor: (r) => (faltaFirma(r) ? "Sin firmar" : "Firmada"),
        claseCelda: tdc,
        celda: (r) =>
          faltaFirma(r) ? (
            <Badge tono="rojo">Sin firmar</Badge>
          ) : (
            <>
              <Badge tono="verde">Firmada</Badge>
              {r.origen === "CARGADA" ? <div className="mt-1 text-[11px] text-soft">escaneo cargado</div> : null}
            </>
          ),
      },
      {
        clave: "acciones",
        titulo: "Acciones",
        ancho: "28%",
        claseCelda: tdc,
        celda: (r) => (
          <div className="flex flex-wrap gap-1.5">
            {r.pdf_path || r.pdf_firmado ? (
              <VerPdfBtn
                id={r.id}
                folio={r.folio}
                className={btnGhost}
                subtitulo={`${r.empleado_numero} ${r.empleado_nombre} · ${fechaCorta(r.fecha)}`}
              />
            ) : null}
            {faltaFirma(r) ? (
              <>
                <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                  Imprimir
                </a>
                <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
              </>
            ) : null}
            <EditarClaseBtn id={r.id} folio={r.folio} clase={r.clase} tipo={r.tipo} />
            <CorregirResponsivaBtn id={r.id} folio={r.folio} tipo={r.tipo} />
            <RegenerarResponsivaBtn id={r.id} folio={r.folio} origen={r.origen} firmada={!!r.pdf_firmado} />
            {r.tipo === "ASIGNACION" && r.estado === "VIGENTE" && r.clase !== "WIFI" && r.clase !== "VALE" ? (
              <Link href={`/responsivas/${r.id}/devolucion`} className={btnGhost}>
                Registrar devolución
              </Link>
            ) : null}
            <EliminarResponsivaBtn id={r.id} folio={r.folio} />
          </div>
        ),
      },
    ],
    []
  );

  const tabla = useTabla({ id: "responsivas", columnas, filas: responsivas });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {tabla.filas.length} de {responsivas.length} documentos · haz clic en el título de una columna para ordenarla
          y filtrarla.
        </p>
        <AvisoTabla estado={tabla} />
      </div>
      <Card className="p-0">
        <Tabla
          estado={tabla}
          claveFila={(r) => r.id}
          minAncho={1250}
          vacio={
            <p className="py-6 text-center text-sm text-soft">
              Ningún documento cumple con estos filtros. Quita el filtro del título de la columna o el de arriba.
            </p>
          }
        />
      </Card>
    </div>
  );
}
