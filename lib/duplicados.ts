/**
 * Detección de datos repetidos en el inventario.
 *
 * Se revisan los campos que identifican físicamente a un equipo (serie, IMEI y
 * línea) y los que deberían ser únicos por control interno (no. de activo y
 * nombre de la computadora). Los valores de relleno ("N/A", "-", ceros…) se
 * ignoran para no marcar como duplicado lo que en realidad está vacío.
 */

export type CampoDuplicable = "serie" | "imei" | "linea" | "activo" | "nombre_computadora";

export type Conflicto = {
  campo: CampoDuplicable;
  etiqueta: string;
  valor: string;
  otros: string[]; // códigos de los demás equipos con ese mismo valor
};

export type EquipoRevisable = {
  id: number;
  codigo: string;
  numero_serie: string | null;
  detalles: string | null;
};

export const ETIQUETA_CAMPO_DUP: Record<CampoDuplicable, string> = {
  serie: "número de serie",
  imei: "IMEI",
  linea: "número de línea",
  activo: "no. de activo",
  nombre_computadora: "nombre de la computadora",
};

/** Repetir estos datos es un error de captura: no se permite guardar. */
export const CAMPOS_BLOQUEANTES: CampoDuplicable[] = ["serie", "imei", "linea"];

const normalizar = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");
const soloDigitos = (v: string) => v.replace(/\D/g, "");

// Marcadores de "sin dato" que aparecen en los Excel de origen.
const RELLENO = new Set(["", "N/A", "NA", "#N/A", "NA/", "-", "--", "---", "0", "SIN", "SINSERIE", "SINDATO", "NINGUNO", "NOAPLICA", "X", "XX", "XXX"]);

const utilizable = (v: string) => v.length > 1 && !RELLENO.has(v);
const numeroUtil = (v: string, minimo: number) => v.length >= minimo && !/^0+$/.test(v);

function parseDetalles(json: string | null): Record<string, string> {
  try {
    const d = json ? (JSON.parse(json) as Record<string, unknown>) : {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) out[k] = v == null ? "" : String(v);
    return out;
  } catch {
    return {};
  }
}

/** Valores comparables de un equipo, ya normalizados y sin repetir. */
export function valoresComparables(
  numeroSerie: string | null,
  detalles: Record<string, string>
): { campo: CampoDuplicable; valor: string }[] {
  const vals: { campo: CampoDuplicable; valor: string }[] = [];

  const serie = normalizar(numeroSerie ?? "");
  if (utilizable(serie)) vals.push({ campo: "serie", valor: serie });

  // IMEI e IMEI 2 comparten bolsa: el IMEI 2 de un equipo no debe ser el IMEI de otro.
  for (const clave of ["imei", "imei2"]) {
    const imei = soloDigitos(detalles[clave] ?? "");
    if (numeroUtil(imei, 10)) vals.push({ campo: "imei", valor: imei });
  }

  const linea = soloDigitos(detalles.numero ?? "");
  if (numeroUtil(linea, 8)) vals.push({ campo: "linea", valor: linea });

  const activo = normalizar(detalles.activo ?? "");
  if (utilizable(activo)) vals.push({ campo: "activo", valor: activo });

  const nombrePc = normalizar(detalles.nombre_computadora ?? "");
  if (utilizable(nombrePc)) vals.push({ campo: "nombre_computadora", valor: nombrePc });

  // Un mismo valor repetido dentro del propio equipo no lo hace duplicado de otro.
  const vistos = new Set<string>();
  return vals.filter((v) => {
    const clave = `${v.campo}|${v.valor}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** Conflictos de un equipo (o de uno por capturar) contra el resto del inventario. */
export function conflictosContra(
  candidato: { numeroSerie: string | null; detalles: Record<string, string> },
  otros: EquipoRevisable[]
): Conflicto[] {
  const conflictos: Conflicto[] = [];
  for (const v of valoresComparables(candidato.numeroSerie, candidato.detalles)) {
    const codigos = otros
      .filter((o) =>
        valoresComparables(o.numero_serie, parseDetalles(o.detalles)).some(
          (ov) => ov.campo === v.campo && ov.valor === v.valor
        )
      )
      .map((o) => o.codigo);
    if (codigos.length) {
      conflictos.push({ campo: v.campo, etiqueta: ETIQUETA_CAMPO_DUP[v.campo], valor: v.valor, otros: codigos });
    }
  }
  return conflictos;
}

/** Revisa todo el inventario y devuelve los conflictos por equipo. */
export function detectarDuplicados(equipos: EquipoRevisable[]): Record<number, Conflicto[]> {
  const indice = new Map<string, { ids: number[]; codigos: string[] }>();
  const porEquipo = new Map<number, { campo: CampoDuplicable; valor: string }[]>();

  for (const e of equipos) {
    const vals = valoresComparables(e.numero_serie, parseDetalles(e.detalles));
    porEquipo.set(e.id, vals);
    for (const v of vals) {
      const clave = `${v.campo}|${v.valor}`;
      const grupo = indice.get(clave) ?? { ids: [], codigos: [] };
      grupo.ids.push(e.id);
      grupo.codigos.push(e.codigo);
      indice.set(clave, grupo);
    }
  }

  const salida: Record<number, Conflicto[]> = {};
  for (const e of equipos) {
    const conflictos: Conflicto[] = [];
    for (const v of porEquipo.get(e.id) ?? []) {
      const grupo = indice.get(`${v.campo}|${v.valor}`);
      if (!grupo || grupo.ids.length < 2) continue;
      conflictos.push({
        campo: v.campo,
        etiqueta: ETIQUETA_CAMPO_DUP[v.campo],
        valor: v.valor,
        otros: grupo.codigos.filter((_, i) => grupo.ids[i] !== e.id),
      });
    }
    if (conflictos.length) salida[e.id] = conflictos;
  }
  return salida;
}
