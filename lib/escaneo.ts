import ExcelJS from "exceljs";
import { norm, celdaTexto, type Mapeo } from "./importar";

/**
 * Lectura del archivo que genera el script que recorre las computadoras.
 *
 * A diferencia del inventario en Excel, este archivo lo produce una máquina y
 * puede venir en CSV, JSON, TSV o XLSX. Los encabezados se reconocen por una
 * lista de nombres posibles, así que no importa cómo se llamen exactamente las
 * columnas mientras signifiquen lo mismo.
 */

/** Encabezados que se aceptan para cada dato del escaneo. */
export const MAPEO_ESCANEO: Mapeo = {
  num_emp: [
    "usuario", "numero de empleado", "num empleado", "no empleado", "num de empleado",
    "empleado", "num", "user", "username", "id empleado",
  ],
  nombre_computadora: [
    "nombre del equipo", "nombre de la computadora", "nombre de la pc", "nombre equipo",
    "hostname", "host name", "computername", "computer name", "equipo", "nombre",
  ],
  sistema_operativo: ["sistema operativo", "so", "os", "sistema", "version de windows", "windows"],
  marca: ["marca", "fabricante", "manufacturer", "vendor"],
  modelo: ["modelo", "model"],
  serie: [
    "numero de serie", "no de serie", "num de serie", "serie", "serial", "serialnumber",
    "serial number", "service tag", "servicetag", "no serie",
  ],
  procesador: ["procesador", "cpu", "processor", "modelo de procesador"],
  ram: ["memoria ram", "memoria", "ram", "ram gb", "memoria total"],
  hd: [
    "espacio del disco", "espacio en disco", "disco duro", "disco", "hd", "almacenamiento",
    "storage", "capacidad del disco", "tamano del disco", "capacidad", "hdd",
  ],
  ip: ["ip del equipo", "direccion ip", "ip", "ipaddress", "ip address", "ipv4", "direccion"],
  monitor: ["marca del monitor", "monitor marca", "marca monitor", "monitor", "pantalla"],
  monitor_serie: [
    "serie del monitor", "monitor serie", "serie monitor", "serial del monitor",
    "serial monitor", "numero de serie del monitor",
  ],
};

export type FilaEscaneo = Record<string, string>;

/**
 * Normaliza el nombre de una columna. Además de lo que hace `norm`, separa el
 * camelCase, porque un script suele generar claves como "NumeroDeSerie" o
 * "nombreDelEquipo" y deben reconocerse igual que "Número de serie".
 */
function normClave(s: string): string {
  return norm(String(s ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

/** Divide una línea de CSV respetando comillas. */
function partirLinea(linea: string, sep: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === sep && !entreComillas) {
      salida.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  salida.push(actual);
  return salida.map((v) => v.trim().replace(/^"|"$/g, ""));
}

/** Separador más probable de un texto tabular: el que más columnas produce. */
function detectarSeparador(lineas: string[]): string {
  const candidatos = ["\t", ";", ",", "|"];
  let mejor = ",";
  let mejorN = 0;
  for (const sep of candidatos) {
    const n = Math.min(...lineas.slice(0, 5).map((l) => partirLinea(l, sep).length));
    if (n > mejorN) {
      mejorN = n;
      mejor = sep;
    }
  }
  return mejor;
}

/** Empareja los encabezados del archivo con los campos del mapeo. */
function columnasDe(encabezados: string[], mapeo: Mapeo): Record<number, string> {
  const alias = new Map<string, string>();
  for (const [campo, nombres] of Object.entries(mapeo)) {
    for (const n of nombres) alias.set(normClave(n), campo);
    alias.set(normClave(campo), campo);
  }
  const salida: Record<number, string> = {};
  encabezados.forEach((enc, i) => {
    const campo = alias.get(normClave(enc));
    // Si ya se ocupó ese campo con otra columna, gana la primera.
    if (campo && !Object.values(salida).includes(campo)) salida[i] = campo;
  });
  return salida;
}

function filasDeTabla(encabezados: string[], filas: string[][], mapeo: Mapeo): FilaEscaneo[] {
  const cols = columnasDe(encabezados, mapeo);
  if (!Object.keys(cols).length) return [];
  return filas
    .map((celdas) => {
      const fila: FilaEscaneo = {};
      for (const [i, campo] of Object.entries(cols)) {
        const v = (celdas[Number(i)] ?? "").toString().trim();
        if (v) fila[campo] = v;
      }
      return fila;
    })
    .filter((f) => Object.keys(f).length > 0);
}

/** Filas de un JSON: acepta un arreglo suelto o {equipos:[…]} / {datos:[…]}. */
function filasDeJson(texto: string, mapeo: Mapeo): FilaEscaneo[] {
  const datos = JSON.parse(texto) as unknown;
  const lista = Array.isArray(datos)
    ? datos
    : ((datos as Record<string, unknown>)?.equipos ??
        (datos as Record<string, unknown>)?.datos ??
        (datos as Record<string, unknown>)?.rows ??
        []);
  if (!Array.isArray(lista)) return [];

  const alias = new Map<string, string>();
  for (const [campo, nombres] of Object.entries(mapeo)) {
    for (const n of nombres) alias.set(normClave(n), campo);
    alias.set(normClave(campo), campo); // también el nombre interno
  }

  return lista
    .map((item) => {
      const fila: FilaEscaneo = {};
      for (const [clave, valor] of Object.entries((item ?? {}) as Record<string, unknown>)) {
        const campo = alias.get(normClave(clave));
        if (!campo || fila[campo]) continue;
        const v = valor == null ? "" : String(valor).trim();
        if (v) fila[campo] = v;
      }
      return fila;
    })
    .filter((f) => Object.keys(f).length > 0);
}

/** Lee el archivo del escaneo, venga como venga, y devuelve sus filas. */
export async function leerEscaneo(buf: Buffer, nombreArchivo: string, mapeo: Mapeo = MAPEO_ESCANEO): Promise<FilaEscaneo[]> {
  const ext = (nombreArchivo.split(".").pop() || "").toLowerCase();

  if (ext === "xlsx" || ext === "xls") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    let mejor: FilaEscaneo[] = [];
    wb.eachSheet((ws) => {
      // El encabezado puede no estar en la primera fila.
      for (let n = 1; n <= Math.min(15, ws.rowCount); n += 1) {
        const enc = (ws.getRow(n).values as ExcelJS.CellValue[]).slice(1).map(celdaTexto);
        if (!enc.filter(Boolean).length) continue;
        const cuerpo: string[][] = [];
        for (let f = n + 1; f <= ws.rowCount; f += 1) {
          cuerpo.push((ws.getRow(f).values as ExcelJS.CellValue[]).slice(1).map(celdaTexto));
        }
        const filas = filasDeTabla(enc, cuerpo, mapeo);
        if (filas.length > mejor.length) mejor = filas;
      }
    });
    return mejor;
  }

  const texto = buf.toString("utf8").replace(/^﻿/, "");
  if (ext === "json" || texto.trimStart().startsWith("[") || texto.trimStart().startsWith("{")) {
    try {
      return filasDeJson(texto, mapeo);
    } catch {
      // Si no era JSON válido se intenta como texto tabular.
    }
  }

  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const sep = detectarSeparador(lineas);
  const encabezados = partirLinea(lineas[0], sep);
  const cuerpo = lineas.slice(1).map((l) => partirLinea(l, sep));
  return filasDeTabla(encabezados, cuerpo, mapeo);
}
