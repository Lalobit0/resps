import { db } from "./db";
import { usuarioActual, ipDeLaPeticion } from "./auth";

/**
 * El rastro de quién hizo qué.
 *
 * La bitácora ya existía para poder deshacer movimientos de inventario. Con
 * expedientes de personal cambia de papel: ahora tiene que contestar preguntas
 * de auditoría —quién abrió el certificado médico de fulano, quién validó su
 * contrato, quién le cambió los permisos a alguien— y para eso necesita
 * responsable, origen y qué había antes.
 *
 * Registrar nunca debe tumbar la operación: si falla el registro, el trabajo
 * del usuario ya se hizo. Por eso todo va dentro de un try.
 */

export type Anotacion = {
  accion: string;
  descripcion: string;
  /** Sobre qué se actuó: EXPEDIENTE, DOCUMENTO, USUARIO, EQUIPO… */
  entidad?: string;
  entidadId?: number;
  antes?: unknown;
  despues?: unknown;
  /** OK | DENEGADO | ERROR */
  resultado?: string;
  snapshot?: string | null;
  revertible?: boolean;
};

const recorta = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    // Un renglón de bitácora no es un respaldo: se guarda lo que sirve para
    // entender el cambio, no el expediente entero.
    return s.length > 4000 ? `${s.slice(0, 4000)}…` : s;
  } catch {
    return null;
  }
};

export async function anotar(a: Anotacion): Promise<void> {
  try {
    const u = await usuarioActual();
    const ip = await ipDeLaPeticion();
    db.prepare(
      `INSERT INTO bitacora
         (accion, descripcion, snapshot, revertible, usuario_id, usuario, ip, entidad, entidad_id, antes, despues, resultado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      a.accion,
      a.descripcion,
      a.snapshot ?? null,
      a.revertible ? 1 : 0,
      u?.id ?? null,
      u ? `${u.nombre} (${u.usuario})` : null,
      ip || null,
      a.entidad ?? null,
      a.entidadId ?? null,
      recorta(a.antes),
      recorta(a.despues),
      a.resultado ?? "OK"
    );
  } catch {
    // El registro no puede impedir el trabajo.
  }
}

/**
 * Un intento que se rechazó por permisos. Se anota igual —o con más razón—
 * que lo que sí ocurrió: el punto 44 pide registrar el resultado, no solo los
 * aciertos.
 */
export async function anotarDenegado(accion: string, descripcion: string, entidad?: string, entidadId?: number) {
  await anotar({ accion, descripcion, entidad, entidadId, resultado: "DENEGADO" });
}
