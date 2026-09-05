import { db } from "./db";
import type { Gafete, PerfilGafete, Puerta } from "./gafetes-comun";

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
export function marcarGafetesPorRecoger(empleadoId: number, fecha: string): number {
  const res = db
    .prepare(
      `UPDATE gafetes SET estado = 'POR_RECOGER', fecha_baja = COALESCE(fecha_baja, ?)
       WHERE empleado_id = ? AND estado = 'ACTIVO'`
    )
    .run(fecha, empleadoId);
  return res.changes;
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
