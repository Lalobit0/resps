/**
 * Adivina a qué área pertenece un equipo por el nombre de su computadora.
 *
 * Las máquinas se nombraron con el puesto o el área dentro: SPK-TRAFICO-W,
 * SPK-GTECALIDAD-W, SPK-COORSC-L. Eso alcanza para proponer un departamento y
 * que la persona confirme, en vez de ubicar 120 equipos a ciegas. Las que se
 * nombraron con el número de serie (SPKW80KL4) no dicen nada: para esas no hay
 * sugerencia y se avisa, en vez de inventar una.
 *
 * Nunca decide sola: devuelve la propuesta y por qué, y quien revisa acepta o
 * cambia.
 */

const normalizar = (v: string) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Palabras del nombre de la empresa que aparecen en todos los equipos. */
const PREFIJOS = ["SPK", "SPL", "SP", "DESKTOP", "LAPTOP", "PC"];

/** Fragmentos del nombre, ya sin el prefijo de la empresa ni la letra final. */
function trozos(nombrePc: string): string[] {
  return (nombrePc || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 1 && !PREFIJOS.includes(t));
}

export type Sugerencia = {
  departamento: string;
  /** Qué hizo que se propusiera: se enseña para poder desconfiar de ella. */
  motivo: string;
};

/**
 * Propone un departamento comparando el nombre del equipo con los que ya
 * existen en la plantilla. Solo se apoya en datos reales: si el nombre no se
 * parece a ningún departamento, no propone nada.
 */
export function sugerirDepartamento(nombrePc: string | null | undefined, departamentos: string[]): Sugerencia | null {
  const plano = normalizar(nombrePc ?? "");
  if (plano.length < 4) return null;

  const candidatos: { departamento: string; motivo: string; peso: number }[] = [];

  for (const depto of departamentos) {
    const limpio = (depto || "").trim();
    if (!limpio) continue;
    const planoDepto = normalizar(limpio);
    if (planoDepto.length < 4) continue;

    // 1. El nombre del departamento completo dentro del nombre del equipo.
    if (plano.includes(planoDepto)) {
      candidatos.push({ departamento: limpio, motivo: `el nombre trae “${limpio}”`, peso: 100 + planoDepto.length });
      continue;
    }

    // 2. Alguna palabra larga del departamento (CALIDAD en RECURSOS DE CALIDAD).
    const palabras = limpio.split(/\s+/).filter((p) => p.length >= 5);
    const palabra = palabras.find((p) => plano.includes(normalizar(p)));
    if (palabra) {
      candidatos.push({ departamento: limpio, motivo: `el nombre trae “${palabra}”`, peso: 60 + palabra.length });
      continue;
    }

    // 3. Las primeras letras de una palabra del departamento, como trozo suelto
    //    del nombre: PROD- para PRODUCCION, ESTIM para ESTIMACIONES.
    const partes = trozos(nombrePc ?? "");
    const raiz = limpio
      .split(/\s+/)
      .map((p) => normalizar(p))
      .filter((p) => p.length >= 5);
    const trozo = partes.find((t) => t.length >= 4 && raiz.some((r) => r.startsWith(t) || t.startsWith(r.slice(0, 5))));
    if (trozo) {
      candidatos.push({ departamento: limpio, motivo: `“${trozo}” se parece a ${limpio}`, peso: 30 + trozo.length });
    }
  }

  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.peso - a.peso || a.departamento.localeCompare(b.departamento));
  return { departamento: candidatos[0].departamento, motivo: candidatos[0].motivo };
}

/**
 * Si el nombre parece generado a partir del número de serie, no hay nada que
 * leer en él. Sirve para decir "este hay que ubicarlo a mano" en vez de dejar
 * la sugerencia vacía sin explicación.
 */
export function nombreSinPistas(nombrePc: string | null | undefined, serie: string | null | undefined): boolean {
  const plano = normalizar(nombrePc ?? "");
  if (!plano) return true;
  const serieP = normalizar(serie ?? "");
  if (serieP.length >= 5 && plano.includes(serieP)) return true;
  // Un nombre que es casi todo dígitos y letras sueltas tampoco dice nada.
  const letras = plano.replace(/[0-9]/g, "");
  return letras.length < 4;
}
