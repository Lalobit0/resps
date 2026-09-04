/**
 * Lo del vale de descuento que no toca la base.
 *
 * Vive aparte para que las pantallas lo puedan usar sin arrastrar el motor de
 * SQLite al navegador.
 */

/**
 * Cuál de las dos cláusulas lleva el vale.
 *
 * EQUIPO: "Se omitirá el descuento en caso de entregar el equipo" —lo que se
 * puede devolver—. CONSUMIBLE: la ropa y lo que por sanidad ya no se recibe
 * de vuelta.
 */
export const CLAUSULAS_VALE = [
  {
    clave: "EQUIPO",
    etiqueta: "Equipo que se puede devolver",
    plantilla: "vale_descuento",
    resumen: "Se omite el descuento si entrega el equipo.",
  },
  {
    clave: "CONSUMIBLE",
    etiqueta: "Uniforme o consumible",
    plantilla: "vale_descuento_consumible",
    resumen: "Por sanidad no se recibe a devolución.",
  },
] as const;

export type ClausulaVale = (typeof CLAUSULAS_VALE)[number]["clave"];

/** La plantilla que le toca a una cláusula; sin ella, la de equipo. */
export function plantillaDeClausula(clausula: string | null | undefined): string {
  return CLAUSULAS_VALE.find((c) => c.clave === clausula)?.plantilla ?? CLAUSULAS_VALE[0].plantilla;
}

/** Cómo se llama una cláusula en pantalla. */
export function etiquetaClausula(clausula: string | null | undefined): string {
  return CLAUSULAS_VALE.find((c) => c.clave === clausula)?.etiqueta ?? CLAUSULAS_VALE[0].etiqueta;
}

export type ConceptoVale = {
  id: number;
  concepto: string;
  monto: number;
  /** El precio como se escribe en el vale. Vacío = se arma del número. */
  texto: string | null;
  /** EQUIPO | CONSUMIBLE. Vacío = la de equipo. */
  clausula: string | null;
  activo: number;
};
