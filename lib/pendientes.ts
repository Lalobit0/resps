import { db } from "./db";

/**
 * Equipos entregados a un empleado que no tienen una carta responsiva vigente
 * que los respalde. Son los que hay que generar y mandar a firmar.
 */
export type EquipoSinResponsiva = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  asignado_a: number;
  empleado_numero: string;
  empleado_nombre: string;
};

const CONSULTA = `
  SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.numero_serie, e.asignado_a,
         em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre
  FROM equipos e
  JOIN empleados em ON em.id = e.asignado_a
  WHERE e.estado = 'ASIGNADO'
    AND e.asignado_a IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM responsiva_items ri
      JOIN responsivas r ON r.id = ri.responsiva_id
      WHERE ri.equipo_id = e.id
        AND r.tipo = 'ASIGNACION'
        AND r.estado = 'VIGENTE'
        AND r.empleado_id = e.asignado_a
    )
`;

/** Lista completa de equipos asignados sin responsiva vigente. */
export function equiposSinResponsiva(): EquipoSinResponsiva[] {
  return db.prepare(`${CONSULTA} ORDER BY e.tipo ASC, e.codigo ASC`).all() as EquipoSinResponsiva[];
}

/** Solo el conteo, para los avisos del tablero. */
export function totalSinResponsiva(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM (${CONSULTA})`).get() as { c: number }).c;
}

/** Ids de los equipos sin responsiva, para marcarlos en un listado. */
export function idsSinResponsiva(): Set<number> {
  const filas = db.prepare(`SELECT e.id FROM (${CONSULTA}) AS e`).all() as { id: number }[];
  return new Set(filas.map((f) => f.id));
}
