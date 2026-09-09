"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ETIQUETA_ESTADO } from "../lib/constants";
import { Badge, Card, Empty, tdCls, tonoEstadoEquipo } from "./ui";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";

/** Una línea telefónica con el equipo y la persona que la trae. */
export type Linea = {
  id: number;
  codigo: string;
  estado: string;
  numero: string | null;
  plan: string | null;
  precio: string | null;
  imei: string | null;
  condicion: string | null;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  asignado_id: number | null;
  asignado_nombre: string | null;
  asignado_numero: string | null;
  asignado_departamento: string | null;
  asignado_area: string | null;
};

/** La tabla de líneas, con sus columnas ajustables y su menú por columna. */
export default function LineasClient({ lineas }: { lineas: Linea[] }) {
  const columnas = useMemo<Columna<Linea>[]>(
    () => [
      { clave: "codigo", titulo: "Código", ancho: "8%", valor: (l) => l.codigo, claseCelda: `${tdCls} mono text-xs font-semibold` },
      {
        clave: "numero_empleado",
        titulo: "No. empleado",
        ancho: "7%",
        valor: (l) => l.asignado_numero ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.asignado_numero ?? "—",
      },
      {
        clave: "nombre",
        titulo: "Nombre",
        ancho: "14%",
        valor: (l) => l.asignado_nombre ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (l) =>
          l.asignado_nombre ? (
            // Al nombre se le da clic para ir a su histórico.
            <Link
              href={`/empleados/${l.asignado_id}`}
              className="font-medium text-ink hover:text-kraft hover:underline"
              title="Ver su histórico"
            >
              {l.asignado_nombre}
            </Link>
          ) : (
            <span className="text-soft">Sin asignar</span>
          ),
      },
      {
        clave: "departamento",
        titulo: "Departamento",
        ancho: "11%",
        valor: (l) => [l.asignado_departamento, l.asignado_area].filter(Boolean).join(" · "),
        claseCelda: `${tdCls} text-xs text-soft`,
        celda: (l) => [l.asignado_departamento, l.asignado_area].filter(Boolean).join(" · ") || "—",
      },
      {
        clave: "numero",
        titulo: "Número",
        ancho: "9%",
        valor: (l) => l.numero ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.numero ?? "—",
      },
      {
        clave: "plan",
        titulo: "Plan",
        ancho: "11%",
        valor: (l) => l.plan ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (l) => l.plan ?? "—",
      },
      {
        clave: "renta",
        titulo: "Renta",
        ancho: "6%",
        valor: (l) => l.precio ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (l) => l.precio ?? "—",
      },
      {
        clave: "telefono",
        titulo: "Teléfono",
        ancho: "13%",
        valor: (l) => `${l.marca} ${l.modelo}`,
        claseCelda: `${tdCls} text-xs`,
        celda: (l) => (
          <>
            <span className="font-medium">
              {l.marca} {l.modelo}
            </span>
            {l.numero_serie ? <span className="mono block text-[11px] text-soft">Serie {l.numero_serie}</span> : null}
          </>
        ),
      },
      {
        clave: "imei",
        titulo: "IMEI",
        ancho: "9%",
        valor: (l) => l.imei ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.imei ?? "—",
      },
      {
        clave: "estado",
        titulo: "Estado",
        ancho: "7%",
        valor: (l) => ETIQUETA_ESTADO[l.estado] ?? l.estado,
        claseCelda: tdCls,
        celda: (l) => <Badge tono={tonoEstadoEquipo(l.estado)}>{ETIQUETA_ESTADO[l.estado] ?? l.estado}</Badge>,
      },
      {
        clave: "acciones",
        titulo: "Acciones",
        ancho: "5%",
        claseCelda: tdCls,
        celda: (l) => (
          <Link
            href={`/inventario?editar=${l.id}`}
            className="rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper"
            title="Editar los datos del teléfono y de la línea"
          >
            Editar
          </Link>
        ),
      },
    ],
    []
  );

  const tabla = useTabla({ id: "lineas", columnas, filas: lineas });

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          {tabla.filas.length} de {lineas.length} líneas · haz clic en el título de una columna para ordenarla y
          filtrarla.
        </p>
        <AvisoTabla estado={tabla} />
      </div>
      <Card className="p-0">
        <Tabla
          estado={tabla}
          claveFila={(l) => l.id}
          minAncho={1120}
          vacio={
            <Empty>No hay líneas registradas. Impórtalas o regístralas como equipo de tipo Teléfono / Celular.</Empty>
          }
        />
      </Card>
    </>
  );
}
