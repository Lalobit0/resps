import type { EquipoConAsignado } from "./types";

/**
 * Lo que se subió por Excel, para poder volver a revisarlo.
 *
 * Después de una importación de 60 renglones no hay forma de acordarse de
 * cuáles eran entre 165 equipos, y el resumen —"44 nuevos, 1 omitido"— se va
 * de la pantalla en cuanto se recarga. Cada carga queda registrada y cada
 * equipo se queda marcado con la que lo trajo, así que se puede volver a ella
 * y ver qué quedó a medias.
 *
 * El Excel de origen nunca trae todo: el área, la clasificación y a quién se
 * le entregó suelen quedar en blanco. Eso no es un error de la importación, es
 * trabajo pendiente, y esta pantalla es la lista de ese trabajo.
 */

export type Importacion = {
  id: number;
  fecha: string;
  tipo: string;
  archivo: string | null;
  usuario: string | null;
  renglones: number;
  nuevos: number;
  actualizados: number;
  vinculados: number;
  omitidos: number;
  omitidos_detalle: string | null;
  /** Solo en la plantilla de personal: cuántos ya no vinieron. */
  ausentes?: number;
  ausentes_detalle?: string | null;
};

export type RenglonOmitido = { renglon: number; motivo: string; datos: Record<string, string> };

export const ETIQUETA_ORIGEN: Record<string, string> = {
  COMPUTO: "Equipo de cómputo",
  CELULAR: "Teléfonos",
  RADIO: "Radios",
  ESCANEO: "Escaneo de PCs",
};

// -------------------------------------------------------------------- huecos

/** Un dato que le falta al equipo y que alguien tiene que capturar a mano. */
export type Hueco = { clave: string; etiqueta: string };

export const HUECOS: Hueco[] = [
  { clave: "serie", etiqueta: "Sin número de serie" },
  { clave: "asignado", etiqueta: "Sin asignar a nadie" },
  { clave: "area", etiqueta: "Sin área" },
  { clave: "clasificacion", etiqueta: "Sin clasificación" },
  { clave: "imei", etiqueta: "Sin IMEI" },
  { clave: "linea", etiqueta: "Sin número de línea" },
  { clave: "activo", etiqueta: "Sin no. de activo" },
  { clave: "nombre_pc", etiqueta: "Sin nombre de computadora" },
  { clave: "num_equipo", etiqueta: "Sin no. de equipo" },
];

const vacio = (v: string | null | undefined) => !String(v ?? "").trim();

function detallesDe(json: string | null): Record<string, string> {
  try {
    const d = json ? (JSON.parse(json) as Record<string, unknown>) : {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) out[k] = v == null ? "" : String(v);
    return out;
  } catch {
    return {};
  }
}

/**
 * Qué le falta a este equipo para estar completo.
 *
 * No todo aplica a todos: a un radio no se le pide IMEI ni nombre de
 * computadora. Se revisa lo que de verdad corresponde a su tipo.
 */
export function huecosDe(e: EquipoConAsignado): Hueco[] {
  const d = detallesDe(e.detalles);
  const faltan: string[] = [];

  if (vacio(e.numero_serie)) faltan.push("serie");
  if (!e.asignado_a) faltan.push("asignado");
  // El área del equipo puede venir de su dueño; solo falta si no hay ninguna.
  if (vacio(e.area) && vacio(e.departamento) && vacio(e.asignado_area) && vacio(e.asignado_departamento)) {
    faltan.push("area");
  }
  if (vacio(e.clasificacion)) faltan.push("clasificacion");

  if (e.tipo === "CELULAR") {
    if (vacio(d.imei)) faltan.push("imei");
    if (vacio(d.numero)) faltan.push("linea");
  }
  if (e.tipo === "COMPUTO") {
    if (vacio(d.activo)) faltan.push("activo");
    if (vacio(d.nombre_computadora)) faltan.push("nombre_pc");
  }
  if (e.tipo === "RADIO" && vacio(d.num_equipo)) faltan.push("num_equipo");

  return HUECOS.filter((h) => faltan.includes(h.clave));
}

/** Cuántos equipos de la carga tienen cada hueco, para las pastillas de filtro. */
export function conteoDeHuecos(equipos: EquipoConAsignado[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const e of equipos) {
    for (const h of huecosDe(e)) cuenta[h.clave] = (cuenta[h.clave] ?? 0) + 1;
  }
  return cuenta;
}
