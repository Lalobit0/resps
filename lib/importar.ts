import ExcelJS from "exceljs";

export type Mapeo = Record<string, string[]>; // campo destino -> posibles encabezados

/** Normaliza texto de encabezado: minúsculas, sin acentos, sin puntuación, espacios colapsados */
export function norm(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texto plano de una celda de ExcelJS (maneja fórmulas, richText, fechas, números) */
export function celdaTexto(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${m}-${d}`;
  }
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("error" in o) return ""; // celda de error: #N/A, #REF!, etc.
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in o && typeof o.text === "string") return o.text;
    if ("result" in o) {
      const r = o.result;
      if (r == null || (typeof r === "object" && r !== null && "error" in (r as object))) return "";
      if (r instanceof Date) return celdaTexto(r);
      return String(r);
    }
    if ("hyperlink" in o) return String(o.text ?? "");
    return "";
  }
  return String(v).trim();
}

/** Convierte un número de serie de Excel (p. ej. 40483) a fecha ISO yyyy-mm-dd */
export function serialExcelAISO(n: number): string {
  // Excel: día 1 = 1900-01-01, con el bug del año bisiesto 1900
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

type HojaLeida = { encabezados: Record<string, number>; filas: Record<string, string>[] };

function leerHoja(ws: ExcelJS.Worksheet, mapeo: Mapeo): { coincidencias: number; datos: HojaLeida } {
  const aliasPorCampo: Record<string, Set<string>> = {};
  for (const [campo, alias] of Object.entries(mapeo)) aliasPorCampo[campo] = new Set(alias.map(norm));

  // Busca la fila de encabezados en las primeras 15 filas
  let filaEnc = 0;
  let mejorCuenta = 0;
  let mejorMapa: Record<string, number> = {};
  const maxScan = Math.min(ws.rowCount || 15, 15);
  for (let r = 1; r <= maxScan; r++) {
    const fila = ws.getRow(r);
    const mapa: Record<string, number> = {};
    fila.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = norm(celdaTexto(cell.value));
      if (!t) return;
      for (const [campo, aliases] of Object.entries(aliasPorCampo)) {
        if (mapa[campo] === undefined && aliases.has(t)) mapa[campo] = col;
      }
    });
    const cuenta = Object.keys(mapa).length;
    if (cuenta > mejorCuenta) {
      mejorCuenta = cuenta;
      mejorMapa = mapa;
      filaEnc = r;
    }
  }

  const filas: Record<string, string>[] = [];
  if (filaEnc && mejorCuenta >= 2) {
    for (let r = filaEnc + 1; r <= (ws.rowCount || filaEnc); r++) {
      const fila = ws.getRow(r);
      const obj: Record<string, string> = {};
      let algo = false;
      for (const [campo, col] of Object.entries(mejorMapa)) {
        const val = celdaTexto(fila.getCell(col).value).trim();
        obj[campo] = val;
        if (val) algo = true;
      }
      if (algo) filas.push(obj);
    }
  }
  return { coincidencias: mejorCuenta, datos: { encabezados: mejorMapa, filas } };
}

/**
 * Lee un archivo Excel y devuelve las filas mapeadas al conjunto de campos indicado.
 * Elige automáticamente la hoja cuyos encabezados mejor coincidan (o la hoja preferida).
 */
export async function importarDeExcel(
  buffer: ArrayBuffer | Buffer,
  mapeo: Mapeo,
  hojaPreferida?: string
): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const candidatas: ExcelJS.Worksheet[] = [];
  if (hojaPreferida) {
    const pref = norm(hojaPreferida);
    wb.eachSheet((ws) => {
      if (norm(ws.name).includes(pref)) candidatas.push(ws);
    });
  }
  if (candidatas.length === 0) wb.eachSheet((ws) => candidatas.push(ws));

  let mejor: Record<string, string>[] = [];
  let mejorCoinc = 0;
  for (const ws of candidatas) {
    const { coincidencias, datos } = leerHoja(ws, mapeo);
    if (coincidencias > mejorCoinc || (coincidencias === mejorCoinc && datos.filas.length > mejor.length)) {
      mejorCoinc = coincidencias;
      mejor = datos.filas;
    }
  }
  return mejor;
}
