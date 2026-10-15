import { db } from "./db";

/**
 * Cerrar cartas sin firma de devolución.
 *
 * Lo normal es que una carta se cierre cuando la persona devuelve el equipo y
 * firma la devolución. Pero en una baja eso muchas veces no pasa: ya no viene,
 * no hay a quién pedirle la firma, y la carta se quedaba vigente para siempre.
 * El caso más claro es la carta de uso de red Wi-Fi, que no tiene equipo
 * colgando, así que el cierre por equipos nunca la alcanzaba.
 *
 * Aquí se cierran esas, pero **nunca en silencio**: la carta queda marcada con
 * por qué se cerró, porque una "Cerrada" a secas se lee como "devolvió y
 * firmó", y eso sería mentir en el único lugar donde importa no hacerlo.
 *
 * La regla de qué se puede cerrar así: una carta sigue vigente mientras
 * respalde algo que la persona todavía tiene. Si ya no le queda ningún equipo
 * de esa carta, la carta no está documentando nada y se puede cerrar. Si
 * todavía le queda uno, no: esa carta es justamente la prueba de que lo tiene,
 * y lo que hay que resolver antes es el equipo.
 */

export type CartaSinRespaldo = {
  id: number;
  folio: string;
  clase: string;
  fecha: string;
};

/**
 * Cartas vigentes de la persona que ya no respaldan nada suyo.
 *
 * Son las que se pueden cerrar sin pedirle la firma: o nunca tuvieron equipo
 * —la de Wi-Fi— o el equipo que amparaban ya no está a su nombre.
 */
export function cartasSinRespaldo(empleadoId: number): CartaSinRespaldo[] {
  return db
    .prepare(
      `SELECT r.id, r.folio, r.clase, r.fecha
       FROM responsivas r
       WHERE r.empleado_id = ? AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE' AND r.clase != 'VALE'
         AND NOT EXISTS (
           SELECT 1 FROM responsiva_items ri JOIN equipos q ON q.id = ri.equipo_id
           WHERE ri.responsiva_id = r.id AND q.asignado_a = r.empleado_id
         )
       ORDER BY r.fecha, r.id`
    )
    .all(empleadoId) as CartaSinRespaldo[];
}

/**
 * Las cierra dejando escrito por qué. Devuelve los folios que cerró.
 *
 * Los vales nunca entran aquí: son dinero que se sigue debiendo y cerrarlos
 * borraría la deuda.
 */
export function cerrarCartasSinFirma(empleadoId: number, motivo: string): string[] {
  const cartas = cartasSinRespaldo(empleadoId);
  if (!cartas.length) return [];

  const cerrar = db.prepare("UPDATE responsivas SET estado = 'CERRADA', cierre_motivo = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const c of cartas) cerrar.run(motivo, c.id);
  });
  tx();
  return cartas.map((c) => c.folio);
}
