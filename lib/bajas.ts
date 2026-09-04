import { db } from "./db";

/**
 * Las bajas de personal, vistas desde la plantilla.
 *
 * El Excel que manda Recursos Humanos trae a los que siguen trabajando, y
 * nada más: quien se fue simplemente deja de aparecer. Hasta ahora la
 * importación solo daba de alta y actualizaba, así que el que faltaba se
 * quedaba activo en el sistema para siempre, con su computadora y su radio a
 * su nombre.
 *
 * Aquí se contesta la otra mitad: quién estaba y ya no viene, qué trae
 * colgando y qué hay que resolver antes de cerrarle el expediente.
 */

export type LigadoAlEmpleado = {
  equipos: {
    id: number;
    codigo: string;
    tipo: string;
    marca: string;
    modelo: string;
    numero_serie: string | null;
    area: string | null;
  }[];
  /** Cartas de asignación vigentes: quedarán cerradas al dar la baja. */
  cartas: { folio: string; clase: string }[];
  /** Vales de descuento vigentes. No se cierran solos: son dinero. */
  vales: { folio: string; concepto: string | null; monto: number | null }[];
  /** Mantenimientos programados de sus equipos. */
  mantenimientos: number;
  /** Documentos del expediente que ya tiene cargados. */
  documentos: number;
};

export type Ausente = {
  id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  area: string | null;
  fecha_alta: string | null;
} & LigadoAlEmpleado;

/** Todo lo que un empleado trae colgando, en una sola pasada. */
export function ligadoA(empleadoId: number): LigadoAlEmpleado {
  const equipos = db
    .prepare(
      `SELECT id, codigo, tipo, marca, modelo, numero_serie, COALESCE(area, departamento) AS area
       FROM equipos WHERE asignado_a = ? ORDER BY tipo, codigo`
    )
    .all(empleadoId) as LigadoAlEmpleado["equipos"];

  const cartas = db
    .prepare(
      `SELECT folio, clase FROM responsivas
       WHERE empleado_id = ? AND tipo = 'ASIGNACION' AND estado = 'VIGENTE' AND clase != 'VALE'
       ORDER BY id DESC`
    )
    .all(empleadoId) as LigadoAlEmpleado["cartas"];

  // Los vales van aparte de las cartas: cerrar una carta es papeleo, pero un
  // descuento pendiente es dinero que alguien tiene que decidir qué hacer con
  // él antes de que la persona salga de nómina.
  const vales = db
    .prepare(
      `SELECT folio, concepto, monto FROM responsivas
       WHERE empleado_id = ? AND clase = 'VALE' AND estado = 'VIGENTE' ORDER BY id DESC`
    )
    .all(empleadoId) as LigadoAlEmpleado["vales"];

  const mantenimientos = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
         WHERE e.asignado_a = ? AND m.estado = 'PROGRAMADO'`
      )
      .get(empleadoId) as { c: number }
  ).c;

  const documentos = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM documentos d WHERE d.empleado_id = ? AND d.situacion = 'ACTIVO'`
      )
      .get(empleadoId) as { c: number }
  ).c;

  return { equipos, cartas, vales, mantenimientos, documentos };
}

/**
 * Quién está activo en el sistema y no viene en la lista de números que trajo
 * el Excel. Son las bajas que hay que revisar.
 */
export function ausentesDe(numerosDelArchivo: string[]): Ausente[] {
  const vienen = new Set(numerosDelArchivo.map((n) => n.trim().toUpperCase()).filter(Boolean));
  const activos = db
    .prepare(
      `SELECT id, numero_empleado, nombre, puesto, departamento, area, fecha_alta
       FROM empleados WHERE activo = 1 ORDER BY departamento, nombre`
    )
    .all() as Omit<Ausente, keyof LigadoAlEmpleado>[];

  return activos
    .filter((e) => !vienen.has((e.numero_empleado ?? "").trim().toUpperCase()))
    .map((e) => ({ ...e, ...ligadoA(e.id) }));
}

/** Los ausentes de una importación que siguen activos: los que faltan por resolver. */
export function ausentesPendientes(importacionId: number): Ausente[] {
  const imp = db.prepare("SELECT ausentes_detalle FROM importaciones WHERE id = ?").get(importacionId) as
    | { ausentes_detalle: string | null }
    | undefined;
  if (!imp?.ausentes_detalle) return [];

  let numeros: string[] = [];
  try {
    numeros = JSON.parse(imp.ausentes_detalle) as string[];
  } catch {
    return [];
  }
  if (!numeros.length) return [];

  const marcas = numeros.map(() => "?").join(",");
  const activos = db
    .prepare(
      `SELECT id, numero_empleado, nombre, puesto, departamento, area, fecha_alta
       FROM empleados WHERE activo = 1 AND numero_empleado IN (${marcas})
       ORDER BY departamento, nombre`
    )
    .all(...numeros) as Omit<Ausente, keyof LigadoAlEmpleado>[];

  return activos.map((e) => ({ ...e, ...ligadoA(e.id) }));
}

export type EmpleadoDeBaja = {
  id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  area: string | null;
  fecha_baja: string | null;
  motivo_baja: string | null;
  /** Equipos que siguen a su nombre: lo que no entregó. */
  pendientes: string | null;
  cartas_vigentes: number;
  vales_vigentes: number;
};

/** Los que ya no trabajan aquí, con lo que quedó sin resolver. */
export function bajas(limite = 300): EmpleadoDeBaja[] {
  return db
    .prepare(
      `SELECT e.id, e.numero_empleado, e.nombre, e.puesto, e.departamento, e.area,
              e.fecha_baja, e.motivo_baja,
              (SELECT GROUP_CONCAT(q.codigo, ', ') FROM equipos q WHERE q.asignado_a = e.id) AS pendientes,
              (SELECT COUNT(*) FROM responsivas r
                WHERE r.empleado_id = e.id AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE' AND r.clase != 'VALE')
                AS cartas_vigentes,
              (SELECT COUNT(*) FROM responsivas r
                WHERE r.empleado_id = e.id AND r.clase = 'VALE' AND r.estado = 'VIGENTE') AS vales_vigentes
       FROM empleados e
       WHERE e.activo = 0
       ORDER BY COALESCE(e.fecha_baja, '') DESC, e.nombre
       LIMIT ?`
    )
    .all(limite) as EmpleadoDeBaja[];
}
