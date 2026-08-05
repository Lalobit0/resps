/**
 * Importa responsivas escaneadas al sistema (empleados, inventario y documento).
 *
 *   node scripts/importar-responsivas.mjs --pdfs ./lote           # simulación (no toca nada)
 *   node scripts/importar-responsivas.mjs --pdfs ./lote --aplicar # ejecuta
 *
 * Reglas:
 *  - No duplica: los equipos se identifican por IMEI y, si no hay, por serie
 *    normalizada. Si el equipo ya existe se reutiliza y solo se rellenan los
 *    campos que estén vacíos; nunca se pisa un dato que ya tenías.
 *  - Los empleados se buscan por número; si existen, solo se completa lo vacío.
 *  - Una responsiva ya importada (mismo empleado, equipo y fecha) no se repite,
 *    así que el script se puede correr las veces que haga falta.
 *  - Por cada equipo, la responsiva más reciente queda VIGENTE y las anteriores
 *    CERRADAS, que es como el sistema representa "sustituye a anteriores".
 *  - El PDF original se copia una sola vez a storage/responsivas/; si un archivo
 *    contiene varias responsivas, todas apuntan al mismo documento.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const args = process.argv.slice(2);
const opcion = (nombre, def = null) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const APLICAR = args.includes("--aplicar");
const DIR_PDFS = path.resolve(opcion("--pdfs", "./lote"));
const JSON_DATOS = path.resolve(opcion("--datos", "./scripts/responsivas-2026-08.json"));
const RAIZ = process.cwd();
const DB_PATH = path.join(RAIZ, "data", "app.db");
const STORAGE = path.join(RAIZ, "storage", "responsivas");

const norm = (v) => (v ?? "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const dig = (v) => (v ?? "").toString().replace(/\D/g, "");
const limpio = (v) => (v ?? "").toString().trim();

const TIPO_PREFIJO = { COMPUTO: "PC", CELULAR: "CEL", RADIO: "RAD", OTRO: "OTR" };
const TIPO_CATEGORIA = { COMPUTO: "Desktop", CELULAR: "Celular", RADIO: "Radio", OTRO: "Otro" };

if (!fs.existsSync(DB_PATH)) {
  console.error(`No encuentro la base en ${DB_PATH}. Corre el script desde la carpeta del proyecto.`);
  process.exit(1);
}
if (!fs.existsSync(JSON_DATOS)) {
  console.error(`No encuentro el archivo de datos ${JSON_DATOS}.`);
  process.exit(1);
}

const { responsivas } = JSON.parse(fs.readFileSync(JSON_DATOS, "utf8"));
// Cronológico: así la última entrega de cada equipo queda como la vigente.
responsivas.sort((a, b) => a.fecha.localeCompare(b.fecha));

// Respaldo antes de tocar nada.
if (APLICAR) {
  const dir = path.join(RAIZ, "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `app.db.antes-de-importar-${Date.now()}.db`);
  fs.copyFileSync(DB_PATH, destino);
  console.log(`Respaldo: ${path.relative(RAIZ, destino)}\n`);
}

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const reporte = { empleadosNuevos: [], empleadosCompletados: [], equiposNuevos: [], equiposReutilizados: [], asignaciones: [], responsivasNuevas: [], omitidas: [], avisos: [] };

// ---------- Empleados ----------
function obtenerEmpleado(e) {
  const existente = db.prepare("SELECT * FROM empleados WHERE numero_empleado = ?").get(e.numero);
  if (existente) {
    // Solo se completa lo que esté vacío; no se pisa información buena.
    const campos = [];
    const valores = [];
    if (!existente.area && e.area) (campos.push("area = ?"), valores.push(e.area));
    if (!existente.supervisor && e.supervisor) (campos.push("supervisor = ?"), valores.push(e.supervisor));
    if (campos.length) {
      if (APLICAR) db.prepare(`UPDATE empleados SET ${campos.join(", ")} WHERE id = ?`).run(...valores, existente.id);
      reporte.empleadosCompletados.push(`${e.numero} ${existente.nombre} (${campos.length} campo/s)`);
    }
    return existente.id;
  }
  reporte.empleadosNuevos.push(`${e.numero} ${e.nombre}`);
  if (!APLICAR) return -1;
  const info = db
    .prepare("INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, area, supervisor) VALUES (?,?,?,?,?,?)")
    .run(e.numero, e.nombre, "Por definir", e.area || "Por definir", e.area || null, e.supervisor || null);
  return Number(info.lastInsertRowid);
}

// ---------- Equipos ----------
const equiposCache = db.prepare("SELECT id, codigo, tipo, marca, modelo, numero_serie, detalles FROM equipos").all();
const detallesDe = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };

function buscarEquipo(eq) {
  const imei = dig(eq.detalles?.imei);
  const serie = norm(eq.serie);

  // El IMEI manda: identifica al teléfono sin lugar a dudas.
  for (const c of equiposCache) {
    const d = detallesDe(c.detalles);
    if (imei && (dig(d.imei) === imei || dig(d.imei2) === imei)) return c;
  }

  // Por serie solo si no hay dos IMEI distintos de por medio: hay "series" que
  // en realidad son códigos de modelo (p. ej. PAWR0044MX se repite en varios
  // teléfonos) y fusionarían equipos que no tienen nada que ver.
  if (serie && serie.length > 2) {
    for (const c of equiposCache) {
      if (norm(c.numero_serie) !== serie) continue;
      const otro = dig(detallesDe(c.detalles).imei);
      if (imei && otro && imei !== otro) continue; // mismo "serie", distinto teléfono
      return c;
    }
  }
  return null;
}

function generarCodigo(tipo) {
  const prefijo = TIPO_PREFIJO[tipo] ?? "OTR";
  let n = db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE codigo LIKE ?").get(`SP-${prefijo}-%`).c + 1;
  let codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  const existe = db.prepare("SELECT 1 FROM equipos WHERE codigo = ?");
  while (existe.get(codigo) || equiposCache.some((e) => e.codigo === codigo)) {
    n += 1;
    codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  }
  return codigo;
}

function specsDe(tipo, d) {
  const j = (arr) => arr.filter((x) => x && x.trim()).join(" · ");
  if (tipo === "COMPUTO") return j([d.procesador, d.ram, d.hd, d.sistema_operativo]);
  if (tipo === "CELULAR") return j([d.numero, d.plan, d.imei]);
  if (tipo === "RADIO") return j([d.nombre_equipo, d.descripcion]);
  return j([d.descripcion]);
}

function obtenerEquipo(eq, etiqueta) {
  const encontrado = buscarEquipo(eq);
  if (encontrado) {
    reporte.equiposReutilizados.push(`${encontrado.codigo} <- ${etiqueta}`);
    // Rellena solo huecos (serie o detalles que falten), sin pisar lo existente.
    const d = detallesDe(encontrado.detalles);
    let cambio = false;
    for (const [k, v] of Object.entries(eq.detalles ?? {})) {
      if (v && !d[k]) { d[k] = v; cambio = true; }
    }
    const serieNueva = !encontrado.numero_serie && eq.serie ? eq.serie : null;
    if ((cambio || serieNueva) && APLICAR) {
      db.prepare("UPDATE equipos SET detalles = ?, numero_serie = COALESCE(numero_serie, ?) WHERE id = ?")
        .run(JSON.stringify(d), serieNueva, encontrado.id);
    }
    return encontrado.id;
  }

  const codigo = generarCodigo(eq.tipo);
  reporte.equiposNuevos.push(`${codigo}  ${eq.marca} ${eq.modelo}  serie ${eq.serie || "(sin serie)"}  [${etiqueta}]`);
  if (!APLICAR) { equiposCache.push({ id: -1, codigo, tipo: eq.tipo, numero_serie: eq.serie, detalles: JSON.stringify(eq.detalles ?? {}) }); return -1; }
  const info = db
    .prepare(
      "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, estado) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(
      codigo, eq.tipo, TIPO_CATEGORIA[eq.tipo] ?? "Otro", limpio(eq.marca), limpio(eq.modelo),
      limpio(eq.serie) || null, specsDe(eq.tipo, eq.detalles ?? {}) || null,
      Object.keys(eq.detalles ?? {}).length ? JSON.stringify(eq.detalles) : null, "DISPONIBLE"
    );
  const id = Number(info.lastInsertRowid);
  equiposCache.push({ id, codigo, tipo: eq.tipo, marca: eq.marca, modelo: eq.modelo, numero_serie: eq.serie, detalles: JSON.stringify(eq.detalles ?? {}) });
  return id;
}

// ---------- Documento ----------
function copiarPdf(archivo) {
  const origen = path.join(DIR_PDFS, archivo);
  if (!fs.existsSync(origen)) { reporte.avisos.push(`No encontré el PDF ${archivo} en ${DIR_PDFS}`); return null; }
  const destino = path.join(STORAGE, archivo);
  if (APLICAR) { fs.mkdirSync(STORAGE, { recursive: true }); if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino); }
  return path.relative(RAIZ, destino);
}

function siguienteFolio(anio) {
  const r = db.prepare("SELECT COUNT(*) AS c FROM responsivas WHERE folio LIKE ?").get(`HIST-${anio}-%`);
  let n = r.c + 1;
  let folio = `HIST-${anio}-${String(n).padStart(3, "0")}`;
  const existe = db.prepare("SELECT 1 FROM responsivas WHERE folio = ?");
  while (existe.get(folio) || folios.has(folio)) { n += 1; folio = `HIST-${anio}-${String(n).padStart(3, "0")}`; }
  folios.add(folio);
  return folio;
}
const folios = new Set();

const importar = db.transaction(() => {
  for (const r of responsivas) {
    const etiqueta = `${r.archivo} p${r.pagina} · emp ${r.empleado.numero}`;
    const empleadoId = obtenerEmpleado(r.empleado);
    const equipoId = obtenerEquipo(r.equipo, etiqueta);

    // ¿Ya se importó antes? (mismo empleado, equipo y fecha)
    if (APLICAR) {
      const ya = db
        .prepare(
          `SELECT r.id FROM responsivas r JOIN responsiva_items ri ON ri.responsiva_id = r.id
           WHERE r.empleado_id = ? AND ri.equipo_id = ? AND r.fecha = ? AND r.estado != 'ELIMINADA'`
        )
        .get(empleadoId, equipoId, r.fecha);
      if (ya) { reporte.omitidas.push(`${etiqueta} (ya estaba importada)`); continue; }
    }

    const pdf = copiarPdf(r.archivo);
    const folio = siguienteFolio(r.fecha.slice(0, 4));
    const descripcion = `${r.equipo.marca} ${r.equipo.modelo}`.trim();
    const observaciones = `Responsiva firmada en papel, escaneada (${r.archivo}, pág. ${r.pagina}).${r.revisar ? " REVISAR: " + r.revisar : ""}`;
    reporte.responsivasNuevas.push(`${folio}  ${r.fecha}  ${r.clase.padEnd(7)} ${etiqueta}`);

    if (!APLICAR) continue;

    const info = db
      .prepare(
        "INSERT INTO responsivas (folio, tipo, clase, origen, empleado_id, fecha, estado, observaciones, pdf_path) VALUES (?,?,?,?,?,?,?,?,?)"
      )
      .run(folio, "ASIGNACION", r.clase, "CARGADA", empleadoId, r.fecha, "VIGENTE", observaciones, pdf);
    const rid = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion) VALUES (?,?,?)").run(rid, equipoId, descripcion);

    // La entrega anterior del MISMO equipo se cierra: la nueva la sustituye.
    db.prepare(
      `UPDATE responsivas SET estado='CERRADA' WHERE id != ? AND estado='VIGENTE' AND tipo='ASIGNACION'
         AND id IN (SELECT responsiva_id FROM responsiva_items WHERE equipo_id = ?)`
    ).run(rid, equipoId);

    db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?").run(empleadoId, equipoId);
    reporte.asignaciones.push(`${descripcion} -> ${r.empleado.numero} ${r.empleado.nombre}`);
  }
});

// En simulación las escrituras están desactivadas dentro de cada paso.
importar();
db.close();

// ---------- Reporte ----------
const bloque = (titulo, lista, unicos = false) => {
  const items = unicos ? [...new Set(lista)] : lista;
  console.log(`\n### ${titulo}: ${items.length}`);
  items.forEach((l) => console.log("  - " + l));
};
console.log(APLICAR ? "=== IMPORTACIÓN APLICADA ===" : "=== SIMULACIÓN (no se escribió nada) ===");
bloque("Empleados nuevos", reporte.empleadosNuevos, true);
bloque("Empleados completados", reporte.empleadosCompletados, true);
bloque("Equipos nuevos", reporte.equiposNuevos);
bloque("Equipos ya existentes reutilizados", reporte.equiposReutilizados);
bloque("Responsivas a crear", reporte.responsivasNuevas);
bloque("Omitidas (ya importadas)", reporte.omitidas);
bloque("Avisos", reporte.avisos);
if (!APLICAR) console.log("\nRevisa la lista y, si está correcta, vuelve a correr con --aplicar");
