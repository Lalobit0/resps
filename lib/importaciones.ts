import { db } from "./db";
import type { EquipoConAsignado } from "./types";
import type { Importacion, RenglonOmitido } from "./importaciones-comun";

/**
 * Las consultas de las importaciones.
 *
 * Lo que decide qué le falta a un equipo vive en `importaciones-comun.ts`, sin
 * tocar la base: así la pantalla lo puede usar sin arrastrar el motor de SQLite
 * al navegador.
 */

export * from "./importaciones-comun";

// ------------------------------------------------------------------ registro

export function registrarImportacion(datos: {
  tipo: string;
  archivo: string | null;
  usuario: string | null;
  renglones: number;
}): number {
  const res = db
    .prepare("INSERT INTO importaciones (tipo, archivo, usuario, renglones) VALUES (?, ?, ?, ?)")
    .run(datos.tipo, datos.archivo, datos.usuario, datos.renglones);
  return Number(res.lastInsertRowid);
}

export function cerrarImportacion(
  id: number,
  resumen: {
    nuevos: number;
    actualizados: number;
    vinculados: number;
    omitidos: RenglonOmitido[];
    /** Solo en la plantilla de personal: los números que ya no vinieron. */
    ausentes?: string[];
  }
) {
  const ausentes = resumen.ausentes ?? [];
  db.prepare(
    `UPDATE importaciones SET nuevos = ?, actualizados = ?, vinculados = ?, omitidos = ?, omitidos_detalle = ?,
            ausentes = ?, ausentes_detalle = ?
     WHERE id = ?`
  ).run(
    resumen.nuevos,
    resumen.actualizados,
    resumen.vinculados,
    resumen.omitidos.length,
    resumen.omitidos.length ? JSON.stringify(resumen.omitidos) : null,
    ausentes.length,
    ausentes.length ? JSON.stringify(ausentes) : null,
    id
  );
}

// ----------------------------------------------------------------- consultas

export function importaciones(limite = 30): Importacion[] {
  return db.prepare("SELECT * FROM importaciones ORDER BY id DESC LIMIT ?").all(limite) as Importacion[];
}

export function importacion(id: number): Importacion | null {
  return (db.prepare("SELECT * FROM importaciones WHERE id = ?").get(id) as Importacion | undefined) ?? null;
}

export function ultimaImportacion(): Importacion | null {
  return (db.prepare("SELECT * FROM importaciones ORDER BY id DESC LIMIT 1").get() as Importacion | undefined) ?? null;
}

export function omitidosDe(imp: Importacion): RenglonOmitido[] {
  if (!imp.omitidos_detalle) return [];
  try {
    return JSON.parse(imp.omitidos_detalle) as RenglonOmitido[];
  } catch {
    return [];
  }
}

export function equiposDeImportacion(id: number): EquipoConAsignado[] {
  return db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero,
              em.departamento AS asignado_departamento, em.area AS asignado_area
       FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a
       WHERE e.importacion_id = ?
       ORDER BY e.tipo, e.codigo`
    )
    .all(id) as EquipoConAsignado[];
}

