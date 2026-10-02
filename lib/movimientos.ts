import { db } from "./db";
import { textoEmpleado } from "./historial";

/**
 * Cancelar un movimiento del equipo.
 *
 * Pasa a diario: se reasigna un radio, se le genera su carta, y al probarlo
 * resulta que no sirve. Lo que se necesita entonces no es otro movimiento en
 * sentido contrario —eso deja el histórico contando una entrega que nunca
 * ocurrió— sino deshacer el que se acaba de hacer.
 *
 * Tres reglas sostienen esto:
 *
 * - Solo se cancela el **último** movimiento del equipo. Deshacer uno de hace
 *   tres meses significaría pisar todo lo que pasó después, así que si alguien
 *   más lo movió, primero se cancela ese.
 * - La carta del que lo recibió se va a la papelera, porque documenta una
 *   entrega que se está borrando. Si ya está firmada en papel, no: ahí hay una
 *   firma de verdad y esa decisión se toma a mano.
 * - El movimiento no se borra. Queda marcado como cancelado, porque sí ocurrió
 *   y la auditoría tiene derecho a verlo.
 */

/** Cómo estaba el equipo justo antes del movimiento. */
export type SnapMovimiento = {
  equipoId: number;
  codigo: string;
  estadoPrev: string;
  asignadoPrev: number | null;
  departamentoPrev: string | null;
  areaPrev: string | null;
  /** Quién recibió el equipo. Null si el movimiento lo devolvió al inventario. */
  recibio: number | null;
  /** Carta que el movimiento dejó de considerar vigente, para volver a abrirla. */
  cartaCerrada: { id: number; folio: string; estadoPrev: string } | null;
};

/** Qué pasaría al cancelar, dicho antes de hacerlo. */
export type PlanCancelacion = {
  historialId: number;
  /** "Pasó a otra persona", "Entregado"… */
  titulo: string;
  fecha: string;
  /** Quién lo tiene hoy por culpa de este movimiento. */
  loTiene: string | null;
  /** A quién vuelve el equipo. */
  volverA: string | null;
  /** Carta que se vuelve a poner vigente. */
  cartaReabre: string | null;
  /** Carta que se iría a la papelera. */
  cartaPapelera: string | null;
  cartaPapeleraId: number | null;
  /** Por qué no se puede, cuando no se puede. */
  impedimento: string | null;
};

/** Movimientos que mueven el equipo de manos y por eso se pueden deshacer. */
export const ACCIONES_CANCELABLES = ["ASIGNADO", "REASIGNADO", "LIBERADO"] as const;

type RenglonHistorial = {
  id: number;
  equipo_id: number;
  fecha: string;
  accion: string;
  empleado_id: number | null;
  empleado_texto: string | null;
  snapshot: string | null;
  cancelado: string | null;
};

const TITULOS: Record<string, string> = {
  ASIGNADO: "Entregado",
  REASIGNADO: "Pasó a otra persona",
  LIBERADO: "Devuelto al inventario",
};

function nombreDe(id: number | null): string | null {
  if (!id) return null;
  const e = db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(id) as
    | { numero_empleado: string; nombre: string }
    | undefined;
  return textoEmpleado(e) || null;
}

/** El último movimiento del equipo que todavía se puede deshacer, si hay. */
export function ultimoMovimientoCancelable(equipoId: number): RenglonHistorial | null {
  const huecos = ACCIONES_CANCELABLES.map(() => "?").join(",");
  return (
    (db
      .prepare(
        `SELECT * FROM equipo_historial
         WHERE equipo_id = ? AND accion IN (${huecos}) AND snapshot IS NOT NULL AND cancelado IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(equipoId, ...ACCIONES_CANCELABLES) as RenglonHistorial | undefined) ?? null
  );
}

/**
 * Qué pasaría al cancelar el último movimiento del equipo.
 *
 * Devuelve null cuando no hay nada que cancelar. Cuando hay movimiento pero
 * algo lo impide, devuelve el plan con `impedimento` puesto: así la pantalla
 * puede ofrecer el botón y explicar en su lugar qué hay que hacer primero, en
 * vez de esconder la opción y dejar a la persona adivinando.
 */
export function planDeCancelacion(equipoId: number): PlanCancelacion | null {
  const mov = ultimoMovimientoCancelable(equipoId);
  if (!mov || !mov.snapshot) return null;

  let snap: SnapMovimiento;
  try {
    snap = JSON.parse(mov.snapshot) as SnapMovimiento;
  } catch {
    return null;
  }

  const eq = db.prepare("SELECT codigo, estado, asignado_a FROM equipos WHERE id = ?").get(equipoId) as
    | { codigo: string; estado: string; asignado_a: number | null }
    | undefined;
  if (!eq) return null;

  const base: PlanCancelacion = {
    historialId: mov.id,
    titulo: TITULOS[mov.accion] ?? mov.accion,
    fecha: mov.fecha.slice(0, 10),
    loTiene: nombreDe(snap.recibio),
    volverA: nombreDe(snap.asignadoPrev),
    cartaReabre: null,
    cartaPapelera: null,
    cartaPapeleraId: null,
    impedimento: null,
  };

  const impedido = (impedimento: string) => ({ ...base, impedimento });

  // Si el equipo ya no está como lo dejó el movimiento, deshacerlo pisaría lo
  // que pasó después.
  if (eq.estado === "PRESTADO") {
    return impedido(`${eq.codigo} está prestado. Cierra primero su pase de préstamo.`);
  }
  if (eq.estado === "BAJA") {
    return impedido(`${eq.codigo} está dado de baja. Reactívalo antes de mover sus entregas.`);
  }
  // Se compara contra `recibio` —a nombre de quién lo dejó el movimiento— y no
  // contra el empleado del renglón: en una liberación ese campo guarda a quien
  // se le quitó, que es justo lo contrario.
  if (eq.asignado_a !== (snap.recibio ?? null)) {
    const ahora = nombreDe(eq.asignado_a);
    return impedido(
      ahora
        ? `Desde entonces ${eq.codigo} pasó a ${ahora}. Cancela ese movimiento primero.`
        : `Desde entonces ${eq.codigo} volvió al inventario. Cancela ese movimiento primero.`
    );
  }

  // La carta del que lo recibió documenta la entrega que se va a borrar.
  if (snap.recibio) {
    const carta = db
      .prepare(
        `SELECT r.id, r.folio, r.origen, r.pdf_firmado,
                (SELECT COUNT(*) FROM responsiva_items x WHERE x.responsiva_id = r.id) AS equipos
         FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
         WHERE ri.equipo_id = ? AND r.empleado_id = ? AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'
         ORDER BY r.id DESC LIMIT 1`
      )
      .get(equipoId, snap.recibio) as
      | { id: number; folio: string; origen: string; pdf_firmado: string | null; equipos: number }
      | undefined;

    if (carta) {
      if (carta.origen === "CARGADA" || carta.pdf_firmado) {
        return impedido(
          `La carta ${carta.folio} ya está firmada. Elimínala desde Responsivas —queda en la papelera y se puede revertir— y vuelve a intentarlo.`
        );
      }
      if (carta.equipos > 1) {
        return impedido(
          `La carta ${carta.folio} cubre ${carta.equipos} equipos. Quítale este equipo o elimínala desde Responsivas y vuelve a intentarlo.`
        );
      }
      base.cartaPapelera = carta.folio;
      base.cartaPapeleraId = carta.id;
    }
  }

  // La del anterior se vuelve a abrir, si sigue cerrada por este movimiento.
  if (snap.cartaCerrada) {
    const c = db.prepare("SELECT folio, estado FROM responsivas WHERE id = ?").get(snap.cartaCerrada.id) as
      | { folio: string; estado: string }
      | undefined;
    if (c && c.estado === "CERRADA") base.cartaReabre = c.folio;
  }

  return base;
}

/** Devuelve el equipo a como estaba y marca el movimiento como cancelado. */
export function deshacerMovimiento(mov: { id: number; snap: SnapMovimiento }) {
  const { snap } = mov;
  const tx = db.transaction(() => {
    db.prepare("UPDATE equipos SET estado = ?, asignado_a = ?, departamento = ?, area = ? WHERE id = ?").run(
      snap.estadoPrev,
      snap.asignadoPrev,
      snap.departamentoPrev,
      snap.areaPrev,
      snap.equipoId
    );
    // Solo se reabre si sigue cerrada: si alguien ya la devolvió o la eliminó
    // a mano, esa decisión manda.
    if (snap.cartaCerrada) {
      db.prepare("UPDATE responsivas SET estado = ? WHERE id = ? AND estado = 'CERRADA'").run(
        snap.cartaCerrada.estadoPrev || "VIGENTE",
        snap.cartaCerrada.id
      );
    }
    db.prepare("UPDATE equipo_historial SET cancelado = datetime('now','localtime') WHERE id = ?").run(mov.id);
  });
  tx();
}
