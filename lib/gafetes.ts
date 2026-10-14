import { db } from "./db";
import { ESTADOS_VIVOS, TITULO_GAFETE } from "./gafetes-comun";
import type { AccionGafete, EtapaGafete, Gafete, MovimientoGafete, PerfilGafete, Puerta } from "./gafetes-comun";

/**
 * Las consultas de la matriz de gafetes.
 *
 * Lo que decide qué abre un gafete vive en `gafetes-comun.ts`, sin tocar la
 * base: así la pantalla lo puede usar sin arrastrar el motor de SQLite al
 * navegador.
 */

export * from "./gafetes-comun";

// ---------------------------------------------------------------- catálogos

export function puertas(soloActivas = false): Puerta[] {
  return db
    .prepare(`SELECT * FROM puertas ${soloActivas ? "WHERE activo = 1" : ""} ORDER BY numero`)
    .all() as Puerta[];
}

export function perfiles(soloActivos = false): PerfilGafete[] {
  const lista = db
    .prepare(`SELECT * FROM gafete_perfiles ${soloActivos ? "WHERE activo = 1" : ""} ORDER BY clave`)
    .all() as Omit<PerfilGafete, "puertas">[];

  const ligas = db
    .prepare(
      `SELECT pp.perfil_id, p.numero FROM perfil_puertas pp JOIN puertas p ON p.id = pp.puerta_id ORDER BY p.numero`
    )
    .all() as { perfil_id: number; numero: number }[];

  const porPerfil = new Map<number, number[]>();
  for (const l of ligas) porPerfil.set(l.perfil_id, [...(porPerfil.get(l.perfil_id) ?? []), l.numero]);

  return lista.map((p) => ({ ...p, puertas: porPerfil.get(p.id) ?? [] }));
}

// ------------------------------------------------------------------ gafetes

const SELECT_GAFETE = `
  SELECT g.*, em.numero_empleado, em.nombre, em.puesto, em.departamento, em.clase,
         em.activo AS empleado_activo
  FROM gafetes g LEFT JOIN empleados em ON em.id = g.empleado_id`;

/** Le pega a cada gafete sus perfiles y sus puertas. */
function conDetalle(filas: Omit<Gafete, "perfiles" | "puertas">[]): Gafete[] {
  if (!filas.length) return [];
  const ids = filas.map((g) => g.id);
  const marcas = ids.map(() => "?").join(",");

  const perf = db
    .prepare(
      `SELECT gp.gafete_id, p.clave FROM gafete_perfil gp JOIN gafete_perfiles p ON p.id = gp.perfil_id
       WHERE gp.gafete_id IN (${marcas}) ORDER BY p.clave`
    )
    .all(...ids) as { gafete_id: number; clave: string }[];

  const puer = db
    .prepare(
      `SELECT gp.gafete_id, p.numero FROM gafete_puertas gp JOIN puertas p ON p.id = gp.puerta_id
       WHERE gp.gafete_id IN (${marcas}) ORDER BY p.numero`
    )
    .all(...ids) as { gafete_id: number; numero: number }[];

  const porGafete = new Map<number, { perfiles: string[]; puertas: number[] }>();
  for (const g of filas) porGafete.set(g.id, { perfiles: [], puertas: [] });
  for (const r of perf) porGafete.get(r.gafete_id)?.perfiles.push(r.clave);
  for (const r of puer) porGafete.get(r.gafete_id)?.puertas.push(r.numero);

  return filas.map((g) => ({ ...g, ...(porGafete.get(g.id) ?? { perfiles: [], puertas: [] }) }));
}

export function gafetes(): Gafete[] {
  const filas = db
    .prepare(
      `${SELECT_GAFETE}
       ORDER BY CASE WHEN em.nombre IS NULL THEN 1 ELSE 0 END, em.departamento, em.nombre, g.numero`
    )
    .all() as Omit<Gafete, "perfiles" | "puertas">[];
  return conDetalle(filas);
}

export function gafete(id: number): Gafete | null {
  const fila = db.prepare(`${SELECT_GAFETE} WHERE g.id = ?`).get(id) as
    | Omit<Gafete, "perfiles" | "puertas">
    | undefined;
  return fila ? (conDetalle([fila])[0] ?? null) : null;
}

/** Los gafetes de una persona. Se usa en su ficha y al darla de baja. */
export function gafetesDe(empleadoId: number): Gafete[] {
  const filas = db
    .prepare(`${SELECT_GAFETE} WHERE g.empleado_id = ? ORDER BY g.estado, g.numero`)
    .all(empleadoId) as Omit<Gafete, "perfiles" | "puertas">[];
  return conDetalle(filas);
}

// -------------------------------------------------------------------- altas

/** Reescribe los perfiles y las puertas de un gafete. */
export function fijarAccesos(gafeteId: number, claves: string[], numerosPuerta: number[]) {
  db.prepare("DELETE FROM gafete_perfil WHERE gafete_id = ?").run(gafeteId);
  db.prepare("DELETE FROM gafete_puertas WHERE gafete_id = ?").run(gafeteId);

  const buscarPerfil = db.prepare("SELECT id FROM gafete_perfiles WHERE clave = ?");
  const insPerfil = db.prepare("INSERT OR IGNORE INTO gafete_perfil (gafete_id, perfil_id) VALUES (?, ?)");
  for (const c of claves) {
    const p = buscarPerfil.get(c) as { id: number } | undefined;
    if (p) insPerfil.run(gafeteId, p.id);
  }

  const buscarPuerta = db.prepare("SELECT id FROM puertas WHERE numero = ?");
  const insPuerta = db.prepare("INSERT OR IGNORE INTO gafete_puertas (gafete_id, puerta_id) VALUES (?, ?)");
  for (const n of numerosPuerta) {
    const p = buscarPuerta.get(n) as { id: number } | undefined;
    if (p) insPuerta.run(gafeteId, p.id);
  }
}

/**
 * Marca los gafetes de alguien que dejó la empresa.
 *
 * No se borran ni se cancelan solos: quedan "por recoger", que es el estado
 * real —la tarjeta sigue existiendo y sigue abriendo hasta que alguien la
 * quite del lector—. Devuelve cuántos se marcaron.
 */
export function marcarGafetesPorRecoger(empleadoId: number, fecha: string): { id: number; numero: string }[] {
  const suyos = db
    .prepare("SELECT id, numero FROM gafetes WHERE empleado_id = ? AND estado = 'ACTIVO'")
    .all(empleadoId) as { id: number; numero: string }[];
  if (!suyos.length) return [];

  db.prepare(
    `UPDATE gafetes SET estado = 'POR_RECOGER', fecha_baja = COALESCE(fecha_baja, ?)
     WHERE empleado_id = ? AND estado = 'ACTIVO'`
  ).run(fecha, empleadoId);

  for (const g of suyos) {
    anotarGafete({
      gafeteId: g.id,
      accion: "BAJA_EMPLEADO",
      empleadoId,
      estadoAntes: "ACTIVO",
      estadoDespues: "POR_RECOGER",
      fecha,
      detalle: "Su dueño dejó la empresa. La tarjeta sigue abriendo hasta que alguien la quite del lector.",
    });
  }
  return suyos;
}

// ------------------------------------------------------------- su histórico

/**
 * Anota un movimiento de la tarjeta. Nunca tumba la operación que lo llamó:
 * el histórico es para consultar, no para impedir que se entregue un gafete.
 */
export function anotarGafete(datos: {
  gafeteId: number;
  accion: AccionGafete;
  empleadoId?: number | null;
  estadoAntes?: string | null;
  estadoDespues?: string | null;
  detalle?: string;
  fecha?: string;
}) {
  try {
    const emp = datos.empleadoId
      ? (db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(datos.empleadoId) as
          | { numero_empleado: string; nombre: string }
          | undefined)
      : undefined;
    db.prepare(
      `INSERT INTO gafete_historial (gafete_id, fecha, accion, empleado_id, empleado_texto, estado_antes, estado_despues, detalle)
       VALUES (?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?, ?)`
    ).run(
      datos.gafeteId,
      datos.fecha ?? null,
      datos.accion,
      datos.empleadoId ?? null,
      emp ? [emp.numero_empleado, emp.nombre].filter(Boolean).join(" ") : null,
      datos.estadoAntes ?? null,
      datos.estadoDespues ?? null,
      datos.detalle ?? null
    );
  } catch (e) {
    console.error("No se pudo anotar el movimiento del gafete:", e);
  }
}

/** Todo lo que le ha pasado a la tarjeta, de lo más nuevo a lo más viejo. */
export function historialDeGafete(gafeteId: number): MovimientoGafete[] {
  const filas = db
    .prepare("SELECT * FROM gafete_historial WHERE gafete_id = ? ORDER BY id DESC")
    .all(gafeteId) as {
    id: number;
    fecha: string;
    accion: string;
    empleado_id: number | null;
    empleado_texto: string | null;
    estado_antes: string | null;
    estado_despues: string | null;
    detalle: string | null;
  }[];
  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha.slice(0, 10),
    accion: f.accion as AccionGafete,
    titulo: TITULO_GAFETE[f.accion] ?? f.accion,
    empleado_id: f.empleado_id,
    empleado: f.empleado_texto,
    estado_antes: f.estado_antes,
    estado_despues: f.estado_despues,
    detalle: f.detalle ?? "",
  }));
}

/**
 * Quiénes han traído la tarjeta, del más reciente al primero.
 *
 * Es la respuesta a "¿quién abrió esa puerta en marzo?": sin esto solo se
 * sabe quién la trae hoy, porque al reasignarla se pisa el renglón.
 */
export function duenosDeGafete(gafeteId: number): EtapaGafete[] {
  const movs = historialDeGafete(gafeteId)
    .filter((m) => m.empleado_id)
    .sort((a, b) => a.id - b.id);

  const salida: EtapaGafete[] = [];
  for (const m of movs) {
    const ultimo = salida[salida.length - 1];
    // Dos movimientos seguidos de la misma persona son la misma etapa.
    if (ultimo && ultimo.empleado_id === m.empleado_id) continue;
    if (ultimo) ultimo.hasta = m.fecha;
    salida.push({ empleado_id: m.empleado_id as number, empleado: m.empleado ?? "", desde: m.fecha, hasta: null });
  }

  // Si ya no la trae nadie, la última etapa se cierra con la salida.
  const hoy = db.prepare("SELECT empleado_id FROM gafetes WHERE id = ?").get(gafeteId) as
    | { empleado_id: number | null }
    | undefined;
  const ultimo = salida[salida.length - 1];
  if (ultimo && hoy && hoy.empleado_id !== ultimo.empleado_id) {
    const cierre = historialDeGafete(gafeteId).find((m) => m.accion === "LIBERADO" && m.fecha >= ultimo.desde);
    ultimo.hasta = cierre?.fecha ?? ultimo.hasta;
  }

  return salida.reverse();
}

// ------------------------------------------------------------------ resumen

export type ResumenGafetes = {
  total: number;
  activos: number;
  porRecoger: number;
  sinEmpleado: number;
  deBajas: number;
};

export function resumenGafetes(): ResumenGafetes {
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN g.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS activos,
              SUM(CASE WHEN g.estado = 'POR_RECOGER' THEN 1 ELSE 0 END) AS porRecoger,
              SUM(CASE WHEN g.empleado_id IS NULL THEN 1 ELSE 0 END) AS sinEmpleado,
              SUM(CASE WHEN g.estado = 'ACTIVO' AND em.activo = 0 THEN 1 ELSE 0 END) AS deBajas
       FROM gafetes g LEFT JOIN empleados em ON em.id = g.empleado_id`
    )
    .get() as Record<string, number | null>;

  return {
    total: fila.total ?? 0,
    activos: fila.activos ?? 0,
    porRecoger: fila.porRecoger ?? 0,
    sinEmpleado: fila.sinEmpleado ?? 0,
    deBajas: fila.deBajas ?? 0,
  };
}

export type GafeteDeSalido = {
  id: number;
  numero: string;
  estado: string;
  nombre: string | null;
  numero_empleado: string | null;
  departamento: string | null;
  fecha_baja: string | null;
  perfiles: string | null;
};

/**
 * Tarjetas que siguen abriendo puertas y cuyo dueño ya no trabaja aquí.
 *
 * Es el pendiente de seguridad del módulo: el control de accesos vive en la
 * consola del lector, que no habla con nadie, así que dar de baja a alguien
 * en el sistema no le quita el acceso. Hasta que la tarjeta se recoja y se
 * borre del lector, sigue abriendo.
 *
 * Cuenta los tres estados vivos, no solo los activos: uno "por recoger" ya
 * está detectado pero sigue abriendo igual, y uno "extraviado" es peor
 * todavía porque nadie sabe dónde está. Primero los que nadie ha tocado, y
 * dentro de eso los de la baja más vieja: son los que llevan más tiempo
 * abriendo sin que nadie lo note.
 */
export function gafetesQueSiguenAbriendo(): GafeteDeSalido[] {
  const marcas = ESTADOS_VIVOS.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT g.id, g.numero, g.estado, em.nombre, em.numero_empleado, em.departamento, em.fecha_baja,
              (SELECT GROUP_CONCAT(p.clave, ', ') FROM gafete_perfil gp
                JOIN gafete_perfiles p ON p.id = gp.perfil_id WHERE gp.gafete_id = g.id) AS perfiles
       FROM gafetes g JOIN empleados em ON em.id = g.empleado_id
       WHERE em.activo = 0 AND g.estado IN (${marcas})
       ORDER BY CASE g.estado WHEN 'ACTIVO' THEN 0 WHEN 'EXTRAVIADO' THEN 1 ELSE 2 END,
                COALESCE(em.fecha_baja, '') ASC, g.numero`
    )
    .all(...ESTADOS_VIVOS) as GafeteDeSalido[];
}
