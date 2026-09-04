import { db } from "./db";

/**
 * Catálogo de conceptos del vale de descuento.
 *
 * Es el tarifario que Recursos Humanos trae en su formato: cada concepto con
 * su precio y con el texto tal como está escrito en el papel. El texto se
 * guarda aparte del número porque el documento lo lleva con letra —"$600
 * (SEISCIENTOS 00/100) PESOS."— y así sale palabra por palabra igual.
 */

export * from "./vales-comun";
import type { ConceptoVale } from "./vales-comun";

export function conceptosVale(soloActivos = true): ConceptoVale[] {
  return db
    .prepare(`SELECT * FROM conceptos_vale ${soloActivos ? "WHERE activo = 1" : ""} ORDER BY concepto ASC`)
    .all() as ConceptoVale[];
}

export function conceptoVale(id: number): ConceptoVale | undefined {
  return db.prepare("SELECT * FROM conceptos_vale WHERE id = ?").get(id) as ConceptoVale | undefined;
}

/** Busca por nombre, que es como llega desde el catálogo del formato. */
export function conceptoValePorNombre(nombre: string): ConceptoVale | undefined {
  return db.prepare("SELECT * FROM conceptos_vale WHERE UPPER(concepto) = UPPER(?)").get((nombre || "").trim()) as
    | ConceptoVale
    | undefined;
}
