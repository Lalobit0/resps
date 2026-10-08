import { db } from "./db";
import type { Equipo } from "./types";

/**
 * Los equipos libres del inventario, con de dónde vienen.
 *
 * Cuando alguien entrega su computadora o se da de baja, el equipo vuelve al
 * inventario pero **conserva su área**: sigue siendo de Contabilidad aunque ya
 * no lo tenga nadie. Eso está bien para los números del área, pero al ir a
 * entregarle algo a una persona la lista no decía nada de eso: todos los
 * equipos se veían igual, y no había forma de ver que esa PC de Compras lleva
 * dos meses libre y se puede aprovechar.
 *
 * Aquí se junta lo que hace falta para distinguirlos: de qué área es cada uno,
 * desde cuándo está libre y quién lo traía.
 */

export type EquipoLibre = Equipo & {
  /** Desde cuándo está libre. */
  libre_desde: string | null;
  /** Quién lo traía antes. */
  venia_de: string | null;
};

export function equiposLibres(): EquipoLibre[] {
  return db
    .prepare(
      `SELECT e.*,
              -- Desde cuándo está libre: el movimiento de salida, y si es de
              -- antes de que existiera el histórico, su carta de devolución.
              COALESCE(
                (SELECT h.fecha FROM equipo_historial h
                  WHERE h.equipo_id = e.id AND h.accion IN ('LIBERADO','BAJA_EMPLEADO') AND h.cancelado IS NULL
                  ORDER BY h.id DESC LIMIT 1),
                (SELECT r.fecha FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                  WHERE ri.equipo_id = e.id AND r.tipo = 'DEVOLUCION' AND r.estado != 'ELIMINADA'
                  ORDER BY r.fecha DESC, r.id DESC LIMIT 1)
              ) AS libre_desde,
              -- Quién lo traía: del histórico, y si no, de la última carta que
              -- se le hizo. Hay años de cartas cargadas que no tienen
              -- movimiento anotado.
              COALESCE(
                (SELECT h.empleado_texto FROM equipo_historial h
                  WHERE h.equipo_id = e.id AND h.accion IN ('LIBERADO','BAJA_EMPLEADO')
                    AND h.cancelado IS NULL AND h.empleado_texto IS NOT NULL
                  ORDER BY h.id DESC LIMIT 1),
                (SELECT TRIM(COALESCE(em.numero_empleado,'') || ' ' || em.nombre)
                   FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                   JOIN empleados em ON em.id = r.empleado_id
                  WHERE ri.equipo_id = e.id AND r.tipo = 'ASIGNACION' AND r.estado != 'ELIMINADA'
                  ORDER BY r.fecha DESC, r.id DESC LIMIT 1)
              ) AS venia_de
       FROM equipos e
       WHERE e.estado = 'DISPONIBLE' AND e.asignado_a IS NULL
       ORDER BY e.tipo ASC, e.codigo ASC`
    )
    .all() as EquipoLibre[];
}

export type StockDeDepartamento = {
  /** "SIN" cuando el equipo no tiene área, para que case con el filtro. */
  valor: string;
  etiqueta: string;
  n: number;
};

/**
 * Cuánto equipo libre tiene cada departamento, para poder repartirlo.
 *
 * Cuando a alguien le quitan su computadora, el aparato vuelve al inventario
 * pero conserva su área: sigue siendo de Servicio a Ventas aunque no lo tenga
 * nadie. Sin verlo junto, ese stock se queda parado mientras otra área pide
 * equipo nuevo.
 *
 * No depende de los demás filtros de la pantalla a propósito: es el punto de
 * entrada, así que siempre dice la verdad de lo que hay libre. El tipo sí se
 * respeta, porque buscar "un radio libre" es una pregunta distinta a buscar
 * "una laptop libre".
 */
export function stockPorDepartamento(tipo?: string): { total: number; departamentos: StockDeDepartamento[] } {
  const condiciones = ["estado = 'DISPONIBLE'", "asignado_a IS NULL"];
  const valores: string[] = [];
  if (tipo) {
    condiciones.push("tipo = ?");
    valores.push(tipo);
  }
  const filas = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(departamento), ''), NULLIF(TRIM(area), ''), 'SIN') AS valor,
              COUNT(*) AS n
       FROM equipos WHERE ${condiciones.join(" AND ")}
       GROUP BY valor`
    )
    .all(...valores) as { valor: string; n: number }[];

  const departamentos = filas
    .map((f) => ({ valor: f.valor, etiqueta: f.valor === "SIN" ? "Sin área" : f.valor, n: f.n }))
    // El de más stock primero, que es por donde se empieza a repartir; los que
    // no tienen área al final, porque ahí falta capturar antes de decidir.
    .sort((a, b) => (a.valor === "SIN" ? 1 : b.valor === "SIN" ? -1 : b.n - a.n || a.etiqueta.localeCompare(b.etiqueta)));

  return { total: departamentos.reduce((s, d) => s + d.n, 0), departamentos };
}

/**
 * Equipos que siguen a nombre de gente que ya no trabaja aquí.
 *
 * No son equipos libres —nadie ha registrado que los entregaran— así que no se
 * pueden ofrecer para reasignar. Pero quien va buscando "la laptop que quedó
 * cuando se fue fulano" necesita saber que está ahí y por qué no aparece.
 */
export function equiposDeGenteQueYaNoEsta(): { total: number; codigos: string[] } {
  const filas = db
    .prepare(
      `SELECT q.codigo FROM equipos q JOIN empleados em ON em.id = q.asignado_a
       WHERE em.activo = 0 AND q.estado != 'BAJA'
       ORDER BY q.codigo`
    )
    .all() as { codigo: string }[];
  return { total: filas.length, codigos: filas.map((f) => f.codigo) };
}
