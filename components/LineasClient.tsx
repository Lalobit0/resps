"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  /** Cuenta de la tienda del teléfono (iCloud / Google). */
  cuenta: string | null;
  /** Su contraseña. Se tapa en la tabla: no tiene que leerse al pasar. */
  cuenta_password: string | null;
  pin: string | null;
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
  // Las contraseñas se tapan por omisión y se destapan de una en una. Están
  // en la misma pantalla que todo lo demás, pero no a la vista de quien pase
  // por detrás ni en una captura de pantalla hecha sin pensar.
  const [destapadas, setDestapadas] = useState<Set<number>>(new Set());
  const alternar = (id: number) =>
    setDestapadas((previo) => {
      const copia = new Set(previo);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });

  const columnas = useMemo<Columna<Linea>[]>(
    () => [
      { clave: "codigo", titulo: "Código", ancho: "6%", valor: (l) => l.codigo, claseCelda: `${tdCls} mono text-xs font-semibold` },
      {
        clave: "numero_empleado",
        titulo: "No. empleado",
        ancho: "5%",
        valor: (l) => l.asignado_numero ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.asignado_numero ?? "—",
      },
      {
        clave: "nombre",
        titulo: "Nombre",
        ancho: "11%",
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
        ancho: "8%",
        valor: (l) => [l.asignado_departamento, l.asignado_area].filter(Boolean).join(" · "),
        claseCelda: `${tdCls} text-xs text-soft`,
        celda: (l) => [l.asignado_departamento, l.asignado_area].filter(Boolean).join(" · ") || "—",
      },
      {
        clave: "numero",
        titulo: "Número",
        ancho: "7%",
        valor: (l) => l.numero ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.numero ?? "—",
      },
      {
        clave: "plan",
        titulo: "Plan",
        ancho: "8%",
        valor: (l) => l.plan ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (l) => l.plan ?? "—",
      },
      {
        clave: "renta",
        titulo: "Renta",
        ancho: "5%",
        valor: (l) => l.precio ?? "",
        claseCelda: `${tdCls} text-xs`,
        celda: (l) => l.precio ?? "—",
      },
      {
        clave: "telefono",
        titulo: "Teléfono",
        ancho: "10%",
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
        ancho: "8%",
        valor: (l) => l.imei ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.imei ?? "—",
      },
      {
        clave: "cuenta",
        titulo: "Cuenta",
        ancho: "10%",
        valor: (l) => l.cuenta ?? "",
        claseCelda: `${tdCls} text-xs`,
        ayuda: "La cuenta de iCloud o Google con la que está dado de alta el teléfono",
        celda: (l) => (l.cuenta ? <span className="break-all">{l.cuenta}</span> : <span className="text-soft">—</span>),
      },
      {
        clave: "password",
        titulo: "Contraseña",
        ancho: "8%",
        // Para ordenar y filtrar basta con saber si tiene o no: el menú de la
        // columna no es lugar para una lista de contraseñas.
        valor: (l) => (l.cuenta_password ? "Tiene" : "Sin contraseña"),
        claseCelda: `${tdCls} text-xs`,
        ayuda: "Oculta. Se destapa una por una con el botón",
        celda: (l) =>
          !l.cuenta_password ? (
            <span className="text-soft">—</span>
          ) : (
            <button
              type="button"
              onClick={() => alternar(l.id)}
              className="mono rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink hover:bg-paper"
              title={destapadas.has(l.id) ? "Volver a taparla" : "Mostrar la contraseña"}
            >
              {destapadas.has(l.id) ? l.cuenta_password : "••••••••"}
            </button>
          ),
      },
      {
        clave: "pin",
        titulo: "PIN",
        ancho: "4%",
        valor: (l) => l.pin ?? "",
        claseCelda: `${tdCls} mono text-xs`,
        celda: (l) => l.pin ?? "—",
      },
      {
        clave: "estado",
        titulo: "Estado",
        ancho: "5%",
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
    // `destapadas` va en las dependencias: sin ella las columnas se arman una
    // sola vez y el botón de la contraseña se queda mirando el estado del
    // primer render, así que el clic no destapaba nada.
    [destapadas]
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
