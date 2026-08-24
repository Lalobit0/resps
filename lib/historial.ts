import { db } from "./db";

/**
 * Por dónde ha pasado un equipo.
 *
 * La historia sale de dos sitios y aquí se juntan: las cartas responsivas
 * —que son la parte firmada, y de las que ya hay años cargados— y la tabla
 * `equipo_historial`, donde se anotan los movimientos que no generan papel
 * (una baja de empleado, una liberación, un cambio de área).
 */

export type AccionHistorial =
  | "ALTA"
  | "ASIGNADO"
  | "LIBERADO"
  | "BAJA_EMPLEADO"
  | "AREA"
  | "ESTADO"
  | "FUSION"
  | "RESPONSIVA"
  | "DEVOLUCION"
  | "MANTENIMIENTO";

export type Movimiento = {
  fecha: string;
  accion: AccionHistorial;
  titulo: string;
  detalle: string;
  /** Persona implicada, cuando la hay. */
  empleado_id: number | null;
  empleado: string | null;
  area: string | null;
  /** Folio de la carta, para poder abrirla. */
  folio: string | null;
  responsiva_id: number | null;
};

/** Cómo se llama a alguien en el histórico: número y nombre, congelados. */
export function textoEmpleado(e: { numero_empleado?: string | null; nombre?: string | null } | undefined | null): string {
  if (!e) return "";
  return [e.numero_empleado, e.nombre].filter(Boolean).join(" ").trim();
}

/**
 * Anota un movimiento del equipo. Nunca tumba la operación que lo llamó: el
 * histórico es para consultar, no para bloquear una entrega.
 */
export function anotarMovimiento(datos: {
  equipoId: number;
  accion: AccionHistorial;
  empleadoId?: number | null;
  detalle?: string;
  /** Si no se pasa, se toma del empleado. */
  departamento?: string | null;
  area?: string | null;
  fecha?: string;
}) {
  try {
    const emp = datos.empleadoId
      ? (db.prepare("SELECT numero_empleado, nombre, departamento, area FROM empleados WHERE id = ?").get(datos.empleadoId) as
          | { numero_empleado: string; nombre: string; departamento: string | null; area: string | null }
          | undefined)
      : undefined;
    db.prepare(
      `INSERT INTO equipo_historial (equipo_id, fecha, accion, empleado_id, empleado_texto, departamento, area, detalle)
       VALUES (?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?, ?)`
    ).run(
      datos.equipoId,
      datos.fecha ?? null,
      datos.accion,
      datos.empleadoId ?? null,
      textoEmpleado(emp) || null,
      datos.departamento ?? emp?.departamento ?? null,
      datos.area ?? emp?.area ?? null,
      datos.detalle ?? null
    );
  } catch (e) {
    console.error("No se pudo anotar el movimiento del equipo:", e);
  }
}

const TITULO: Record<string, string> = {
  ALTA: "Alta en el inventario",
  ASIGNADO: "Entregado",
  LIBERADO: "Devuelto al inventario",
  BAJA_EMPLEADO: "Liberado por baja del empleado",
  AREA: "Cambio de área",
  ESTADO: "Cambio de estado",
  FUSION: "Registros unidos",
  RESPONSIVA: "Carta responsiva",
  DEVOLUCION: "Carta de devolución",
  MANTENIMIENTO: "Mantenimiento",
};

/** Toda la historia del equipo, de lo más nuevo a lo más viejo. */
export function historialDeEquipo(equipoId: number): Movimiento[] {
  const movs: Movimiento[] = [];

  const equipo = db.prepare("SELECT codigo, created_at FROM equipos WHERE id = ?").get(equipoId) as
    | { codigo: string; created_at: string }
    | undefined;
  if (!equipo) return [];

  // 1. Lo anotado por el sistema.
  const anotados = db
    .prepare("SELECT * FROM equipo_historial WHERE equipo_id = ? ORDER BY fecha DESC, id DESC")
    .all(equipoId) as {
    fecha: string;
    accion: string;
    empleado_id: number | null;
    empleado_texto: string | null;
    departamento: string | null;
    area: string | null;
    detalle: string | null;
  }[];
  for (const a of anotados) {
    movs.push({
      fecha: a.fecha.slice(0, 10),
      accion: a.accion as AccionHistorial,
      titulo: TITULO[a.accion] ?? a.accion,
      detalle: a.detalle ?? "",
      empleado_id: a.empleado_id,
      empleado: a.empleado_texto,
      area: a.area || a.departamento,
      folio: null,
      responsiva_id: null,
    });
  }

  // 2. Las cartas, que son la parte firmada de la historia.
  const cartas = db
    .prepare(
      `SELECT r.id, r.folio, r.tipo, r.fecha, r.estado, r.origen, r.pdf_firmado,
              em.id AS empleado_id, em.numero_empleado, em.nombre, em.departamento, em.area
       FROM responsiva_items ri
       JOIN responsivas r ON r.id = ri.responsiva_id
       JOIN empleados em ON em.id = r.empleado_id
       WHERE ri.equipo_id = ? AND r.estado != 'ELIMINADA'
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all(equipoId) as {
    id: number;
    folio: string;
    tipo: string;
    fecha: string;
    estado: string;
    origen: string;
    pdf_firmado: string | null;
    empleado_id: number;
    numero_empleado: string;
    nombre: string;
    departamento: string | null;
    area: string | null;
  }[];
  for (const c of cartas) {
    const devolucion = c.tipo === "DEVOLUCION";
    const firmada = c.origen === "CARGADA" || !!c.pdf_firmado;
    movs.push({
      fecha: c.fecha,
      accion: devolucion ? "DEVOLUCION" : "RESPONSIVA",
      titulo: devolucion ? "Devuelto con carta" : "Entregado con carta",
      detalle: firmada ? "Carta firmada" : "Carta sin firmar",
      empleado_id: c.empleado_id,
      empleado: textoEmpleado(c),
      area: c.area || c.departamento,
      folio: c.folio,
      responsiva_id: c.id,
    });
  }

  // 3. Sus mantenimientos.
  const mantenimientos = db
    .prepare("SELECT tipo, descripcion, fecha_programada, fecha_realizada, estado FROM mantenimientos WHERE equipo_id = ?")
    .all(equipoId) as {
    tipo: string;
    descripcion: string;
    fecha_programada: string;
    fecha_realizada: string | null;
    estado: string;
  }[];
  for (const m of mantenimientos) {
    movs.push({
      fecha: m.fecha_realizada || m.fecha_programada,
      accion: "MANTENIMIENTO",
      titulo: m.fecha_realizada ? "Mantenimiento realizado" : "Mantenimiento programado",
      detalle: [m.tipo, m.descripcion].filter(Boolean).join(" · "),
      empleado_id: null,
      empleado: null,
      area: null,
      folio: null,
      responsiva_id: null,
    });
  }

  // 4. El día que entró al inventario cierra la lista por abajo.
  if (!movs.some((m) => m.accion === "ALTA")) {
    movs.push({
      fecha: equipo.created_at.slice(0, 10),
      accion: "ALTA",
      titulo: "Alta en el inventario",
      detalle: `${equipo.codigo} se registró en el sistema`,
      empleado_id: null,
      empleado: null,
      area: null,
      folio: null,
      responsiva_id: null,
    });
  }

  return movs.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Quiénes han tenido el equipo, del más reciente al primero. */
export function duenosDeEquipo(equipoId: number): { empleado_id: number; empleado: string; area: string | null; desde: string; hasta: string | null }[] {
  const movs = historialDeEquipo(equipoId)
    .filter((m) => m.empleado_id && (m.accion === "ASIGNADO" || m.accion === "RESPONSIVA"))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const salida: { empleado_id: number; empleado: string; area: string | null; desde: string; hasta: string | null }[] = [];
  for (const m of movs) {
    const ultimo = salida[salida.length - 1];
    // Dos cartas seguidas de la misma persona son la misma etapa, no dos.
    if (ultimo && ultimo.empleado_id === m.empleado_id) continue;
    if (ultimo) ultimo.hasta = m.fecha;
    salida.push({
      empleado_id: m.empleado_id as number,
      empleado: m.empleado ?? "",
      area: m.area,
      desde: m.fecha,
      hasta: null,
    });
  }

  // Si ya no lo tiene nadie, la última etapa se cierra con lo que diga el
  // movimiento de salida.
  const actual = db.prepare("SELECT asignado_a FROM equipos WHERE id = ?").get(equipoId) as { asignado_a: number | null } | undefined;
  const ultimo = salida[salida.length - 1];
  if (ultimo && actual && actual.asignado_a !== ultimo.empleado_id) {
    const salida_ = historialDeEquipo(equipoId).find(
      (m) => (m.accion === "LIBERADO" || m.accion === "DEVOLUCION" || m.accion === "BAJA_EMPLEADO") && m.fecha >= ultimo.desde
    );
    ultimo.hasta = salida_?.fecha ?? ultimo.hasta;
  }

  return salida.reverse();
}
