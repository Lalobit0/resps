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

/**
 * Encabezados del reporte que genera el script por equipo (un archivo por
 * computadora). Se separan del mapeo de tablas porque ahí las claves son otras:
 * "Fabricante del sistema", "NUMERO_DE_SERIE", "MONITORES"…
 */
const MAPEO_REPORTE: Mapeo = {
  ...MAPEO_ESCANEO,
  num_emp: [...MAPEO_ESCANEO.num_emp, "asignado a"],
  nombre_computadora: [...MAPEO_ESCANEO.nombre_computadora, "nombre de host"],
  sistema_operativo: [...MAPEO_ESCANEO.sistema_operativo, "nombre del sistema operativo"],
  marca: [...MAPEO_ESCANEO.marca, "fabricante del sistema"],
  modelo: [...MAPEO_ESCANEO.modelo, "modelo del sistema"],
  ram: [...MAPEO_ESCANEO.ram, "memoria ram gb"],
  hd: [...MAPEO_ESCANEO.hd, "discos"],
  ip: [...MAPEO_ESCANEO.ip, "ipv4"],
  monitor: [...MAPEO_ESCANEO.monitor, "monitores"],
  arquitectura: ["arquitectura"],
};

/** Valores que el reporte deja como pendientes de llenar a mano. */
const PENDIENTE = /^(captura manual|n\/?a|na|sin dato|desconocido|-+)$/i;

/** Marca limpia: "Dell Inc." -> "DELL". */
function limpiarMarca(v: string): string {
  return v
    .replace(/[,.]?\s*(inc|corporation|corp|co|ltd|llc|s\.?a\.?( de c\.?v\.?)?)\.?$/i, "")
    .trim()
    .toUpperCase();
}

/** Procesador legible: "Intel(R) Core(TM) i3-8100 CPU @ 3.60GHz" -> "Intel Core i3-8100". */
function limpiarProcesador(v: string): string {
  return v
    .replace(/\((R|TM|r|tm)\)/g, "")
    .replace(/\s*CPU\s*@.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Capacidad real del disco: se queda con la última medida del renglón. */
function capacidadDisco(v: string): string {
  const medidas = v.match(/\d+(?:[.,]\d+)?\s*(?:GB|TB|MB)/gi);
  return medidas?.length ? medidas[medidas.length - 1].replace(/\s+/g, " ").toUpperCase() : "";
}

/**
 * Lee el reporte de un equipo: líneas "Clave: valor" o "CLAVE=valor", con
 * valores que pueden venir en los renglones siguientes (discos, IPs, monitores).
 */
function filasDeReporte(texto: string, mapeo: Mapeo = MAPEO_REPORTE): FilaEscaneo[] {
  const alias = new Map<string, string>();
  for (const [campo, nombres] of Object.entries(mapeo)) {
    for (const n of nombres) alias.set(normClave(n), campo);
    alias.set(normClave(campo), campo);
  }

  const lineas = texto.split(/\r?\n/);
  const crudo: Record<string, string[]> = {};
  const esClave = (l: string) => /^\[/.test(l) || /^[A-ZÁÉÍÓÚÑ_0-9]{2,}\s*=/.test(l);

  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i].trim();
    if (!linea || linea.startsWith("[")) continue;
    const m = linea.match(/^([^:=]{2,60}?)\s*[:=]\s*(.*)$/);
    if (!m) continue;
    const campo = alias.get(normClave(m[1]));
    if (!campo) continue;

    let valor = m[2].trim();
    // Valor en los renglones siguientes (DISCOS=, IPV4=, MONITORES=).
    if (!valor) {
      const partes: string[] = [];
      for (let j = i + 1; j < lineas.length; j += 1) {
        const sig = lineas[j].trim();
        if (!sig || esClave(sig)) break;
        partes.push(sig);
        i = j;
      }
      valor = partes.join(" · ");
    }
    if (!valor || PENDIENTE.test(valor)) continue;
    (crudo[campo] ??= []).push(valor);
  }

  // De cada dato se conserva el primero que apareció, que es el más confiable.
  const fila: FilaEscaneo = {};
  for (const [campo, valores] of Object.entries(crudo)) fila[campo] = valores[0];
  if (!Object.keys(fila).length) return [];

  // El usuario viene como DOMINIO\numero.
  if (fila.num_emp) fila.num_emp = fila.num_emp.split(/[\\/]/).pop()!.trim();
  if (fila.marca) fila.marca = limpiarMarca(fila.marca);
  if (fila.procesador) fila.procesador = limpiarProcesador(fila.procesador);
  if (fila.ram && /^\d+([.,]\d+)?$/.test(fila.ram)) fila.ram = `${fila.ram.replace(",", ".")}GB`;
  if (fila.hd) {
    // El renglón trae modelo y capacidad: la capacidad va al campo del disco y
    // la descripción completa se guarda aparte para no perderla.
    const capacidad = capacidadDisco(fila.hd);
    if (capacidad && capacidad !== fila.hd) {
      fila.discos = fila.hd;
      fila.hd = capacidad;
    }
  }
  if (fila.monitor) {
    // "HP 2311 - Serie: CNT21096BL" -> monitor + serie del monitor.
    const series: string[] = [];
    const modelos = fila.monitor.split(" · ").map((m) => {
      const s = m.match(/serie\s*:\s*(\S+)/i);
      if (s) series.push(s[1]);
      return m.replace(/\s*-?\s*serie\s*:.*$/i, "").trim();
    });
    fila.monitor = modelos.filter(Boolean).join(" · ");
    if (series.length && !fila.monitor_serie) fila.monitor_serie = series.join(" · ");
  }
  return [fila];
}

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

  // Reporte por equipo del script de inventario (un archivo por computadora).
  if (/\[DATOS MEDIANTE POWERSHELL\]|NUMERO_DE_SERIE\s*=|\[SYSTEMINFO\]/i.test(texto)) {
    return filasDeReporte(texto);
  }

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
