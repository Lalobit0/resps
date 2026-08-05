/**
 * Deja el inventario de celulares EXACTAMENTE como el listado vigente de
 * telefonía (scripts/celulares-oficial.json), que es la fuente de verdad.
 *
 *   node scripts/sincronizar-celulares.mjs            # simulación
 *   node scripts/sincronizar-celulares.mjs --aplicar  # ejecuta
 *
 *  - Todo teléfono cuyo IMEI no esté en el listado se ELIMINA del inventario,
 *    junto con sus cartas responsivas. El PDF no se pierde: se conserva en
 *    storage/responsivas_eliminadas y queda constancia en la bitácora.
 *  - Si el mismo IMEI quedó cargado varias veces, primero se fusionan los
 *    registros (el más completo se queda con el historial) y, si aun así sobra
 *    alguno, se conserva el que tenga carta responsiva y el resto se elimina.
 *  - Los que ya existen se actualizan (línea, plan, IMEI 2, PIN, iCloud, MAC).
 *  - Los que faltan se crean y quedan asignados a su empleado.
 *  - El teléfono se identifica por IMEI, nunca por la serie: en los Motorola la
 *    "serie" del listado es el código de modelo y se repite entre equipos.
 *  - Las responsivas de teléfono solo se conservan vigentes si el equipo está en
 *    el listado y sigue con el mismo empleado del listado. Las demás se cierran.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fusionarInventario, leerDetalles } from "../lib/fusionar.mjs";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = process.cwd();
const DB_PATH = path.join(RAIZ, "data", "app.db");
const DIR_ELIMINADAS = path.join(RAIZ, "storage", "responsivas_eliminadas");

const dig = (v) => (v ?? "").toString().replace(/\D/g, "");
const limpio = (v) => (v ?? "").toString().trim();
const vacio = (v) => !limpio(v) || /^(na|n\/a|#n\/a|-|0)$/i.test(limpio(v));

if (!fs.existsSync(DB_PATH)) { console.error(`No encuentro ${DB_PATH}. Corre el script desde la carpeta del proyecto.`); process.exit(1); }
const { celulares } = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "celulares-oficial.json"), "utf8"));

/**
 * Una línea telefónica solo puede estar activa en un equipo. Cuando el listado
 * la trae repetida, se queda en el teléfono mejor documentado (el que tiene
 * IMEI 2, PIN, iCloud, MAC o condición), que es el que está realmente en uso;
 * a los demás se les quita la línea y se deja constancia.
 */
const lineasQuitadas = [];
{
  const datos = (c) => ["imei2", "pin", "icloud", "mac", "cond"].filter((k) => c[k] && !/^(na|n\/a|-|0)$/i.test(String(c[k]).trim())).length;
  const porLinea = new Map();
  for (const c of celulares) {
    if (!c.linea) continue;
    if (!porLinea.has(c.linea)) porLinea.set(c.linea, []);
    porLinea.get(c.linea).push(c);
  }
  for (const [linea, lista] of porLinea) {
    if (lista.length < 2) continue;
    const [conserva, ...resto] = [...lista].sort((a, b) => datos(b) - datos(a));
    for (const c of resto) {
      c.linea = "";
      lineasQuitadas.push(
        `La línea ${linea} estaba en ${lista.length} equipos: se deja en ${conserva.modelo} (IMEI ${conserva.imei}, mejor documentado) ` +
          `y se quita de ${c.modelo} (IMEI ${c.imei}), que se registra sin línea.`
      );
    }
  }
}

if (APLICAR) {
  const dir = path.join(RAIZ, "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `app.db.antes-de-celulares-${Date.now()}.db`);
  fs.copyFileSync(DB_PATH, destino);
  console.log(`Respaldo: ${path.relative(RAIZ, destino)}\n`);
}

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const rep = { unidos: [], eliminados: [], duplicados: [], responsivas: [], actualizados: [], creados: [], empleados: [], cerradas: [], avisos: [] };

// El mismo teléfono puede estar capturado dos veces (importaciones repetidas).
// Primero se unen esas copias; si no, solo se actualizaría una y la otra
// quedaría para siempre marcada como dato repetido.
const fusion = fusionarInventario(db, { aplicar: APLICAR });
rep.unidos.push(...fusion.unidos);
rep.avisos.push(...fusion.avisos);

// En simulación la fusión no escribió: se ignoran aquí los registros que se
// unirían, para que lo que se muestra sea lo que realmente va a pasar.
const fusionados = new Set(fusion.eliminados);
const enSistema = db
  .prepare("SELECT id, codigo, marca, modelo, numero_serie, detalles, estado, asignado_a FROM equipos WHERE tipo = 'CELULAR'")
  .all()
  .filter((e) => !fusionados.has(e.id))
  .map((e) => { let d = {}; try { d = e.detalles ? JSON.parse(e.detalles) : {}; } catch {} return { ...e, det: d, imei: dig(d.imei) }; });

const oficialPorImei = new Map(celulares.map((c) => [c.imei, c]));

// ---------- Borrado de un teléfono junto con sus cartas ----------

/** Cartas responsivas (no eliminadas) en las que aparece el equipo. */
function responsivasDe(equipoId) {
  return db
    .prepare(
      `SELECT r.id, r.folio, r.pdf_path,
              (SELECT COUNT(*) FROM responsiva_items ri2 WHERE ri2.responsiva_id = r.id) AS items
       FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
       WHERE ri.equipo_id = ? AND r.estado != 'ELIMINADA'`
    )
    .all(equipoId);
}

/** El PDF de una carta eliminada se conserva en la carpeta de eliminadas. */
function moverPdf(rel) {
  if (!rel) return null;
  const abs = path.isAbsolute(rel) ? rel : path.join(RAIZ, rel);
  const destino = path.join(DIR_ELIMINADAS, path.basename(abs));
  if (!APLICAR) return path.relative(RAIZ, destino);
  fs.mkdirSync(DIR_ELIMINADAS, { recursive: true });
  if (fs.existsSync(abs) && abs !== destino) fs.renameSync(abs, destino);
  return path.relative(RAIZ, destino);
}

function bitacora(descripcion, snapshot) {
  if (!APLICAR) return;
  db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)")
    .run("SINCRONIZAR_CELULARES", descripcion, snapshot ? JSON.stringify(snapshot) : null);
}

/**
 * Quita el teléfono del inventario. Sus cartas responsivas se eliminan también;
 * si una carta amparaba más equipos, solo se le quita este renglón.
 */
function eliminarTelefono(e, motivo) {
  for (const r of responsivasDe(e.id)) {
    if (r.items <= 1) {
      const nuevoPdf = moverPdf(r.pdf_path);
      rep.responsivas.push(`${r.folio}  (de ${e.codigo})  — el PDF queda en ${nuevoPdf ?? "sin archivo"}`);
      if (APLICAR) {
        db.prepare("DELETE FROM responsiva_items WHERE responsiva_id = ?").run(r.id);
        db.prepare("UPDATE responsivas SET responsiva_origen_id = NULL WHERE responsiva_origen_id = ?").run(r.id);
        db.prepare("DELETE FROM responsivas WHERE id = ?").run(r.id);
      }
      bitacora(`Se eliminó la responsiva ${r.folio} junto con el teléfono ${e.codigo} (${motivo})`, { folio: r.folio, pdf: nuevoPdf, equipo: e.codigo });
    } else {
      rep.responsivas.push(`${r.folio}  — se le quita solo el renglón de ${e.codigo} (ampara ${r.items} equipos)`);
      if (APLICAR) db.prepare("DELETE FROM responsiva_items WHERE responsiva_id = ? AND equipo_id = ?").run(r.id, e.id);
    }
  }
  if (APLICAR) {
    db.prepare("DELETE FROM responsiva_items WHERE equipo_id = ?").run(e.id);
    db.prepare("DELETE FROM mantenimientos WHERE equipo_id = ?").run(e.id);
    db.prepare("DELETE FROM equipos WHERE id = ?").run(e.id);
  }
  bitacora(`Se eliminó del inventario el teléfono ${e.codigo} IMEI ${e.imei || "(vacío)"} (${motivo})`, { codigo: e.codigo, imei: e.imei, motivo });
}

/** Registros que sobreviven la limpieza, uno por IMEI del listado. */
const vivos = [];

const limpieza = db.transaction(() => {
  // ---------- 1. Fuera lo que no está en el listado ----------
  for (const e of enSistema) {
    if (e.imei && oficialPorImei.has(e.imei)) continue;
    rep.eliminados.push(`${e.codigo}  ${limpio(e.modelo) || "(sin modelo)"}  IMEI ${e.imei || "(vacío)"}`);
    eliminarTelefono(e, "no está en el listado vigente de telefonía");
  }

  // ---------- 2. Un solo registro por IMEI ----------
  // La fusión de arriba ya une la mayoría; esto es la red de seguridad para lo
  // que haya quedado repetido, conservando el registro que trae la responsiva.
  const porImei = new Map();
  for (const e of enSistema) {
    if (!e.imei || !oficialPorImei.has(e.imei)) continue;
    if (!porImei.has(e.imei)) porImei.set(e.imei, []);
    porImei.get(e.imei).push(e);
  }
  for (const [imei, lista] of porImei) {
    if (lista.length > 1) {
      const puntos = (e) => responsivasDe(e.id).length * 100 - e.id / 1e6;
      const [conserva, ...sobran] = [...lista].sort((a, b) => puntos(b) - puntos(a));
      rep.duplicados.push(
        `IMEI ${imei}: estaba ${lista.length} veces — se conserva ${conserva.codigo}` +
          `${responsivasDe(conserva.id).length ? " (tiene responsiva)" : ""}, se eliminan ${sobran.map((s) => s.codigo).join(", ")}`
      );
      for (const e of sobran) eliminarTelefono(e, `duplicado del IMEI ${imei}, ya está en ${conserva.codigo}`);
      porImei.set(imei, [conserva]);
    }
    vivos.push(porImei.get(imei)[0]);
  }
});
limpieza();

// ---------- 2. Empleado de cada teléfono ----------
function empleadoDe(c) {
  if (vacio(c.num)) { rep.avisos.push(`${c.usuario} (línea ${c.linea}) no trae número de empleado: el teléfono queda sin asignar.`); return null; }
  const ex = db.prepare("SELECT id, area FROM empleados WHERE numero_empleado = ?").get(c.num);
  if (ex) {
    if (!ex.area && c.area && APLICAR) db.prepare("UPDATE empleados SET area = ? WHERE id = ?").run(c.area, ex.id);
    return ex.id;
  }
  rep.empleados.push(`${c.num} ${c.usuario}`);
  if (!APLICAR) return -1;
  return Number(
    db.prepare("INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, area) VALUES (?,?,?,?,?)")
      .run(c.num, c.usuario, "Por definir", c.area || "Por definir", c.area || null).lastInsertRowid
  );
}

// ---------- 3. Alta o actualización ----------
function detallesDe(c) {
  const d = { imei: c.imei };
  if (!vacio(c.imei2)) d.imei2 = dig(c.imei2);
  if (!vacio(c.linea)) d.numero = c.linea;
  if (!vacio(c.plan)) d.plan = `TELCEL PLUS EMPRESARIAL ${c.plan}${vacio(c.gb) ? "" : ` - ${limpio(c.gb)}`}`;
  if (!vacio(c.precio)) d.plan_precio = `$${limpio(c.precio)}.00`;
  if (!vacio(c.pin)) d.pin = limpio(c.pin);
  if (!vacio(c.icloud)) d.icloud = limpio(c.icloud);
  if (!vacio(c.mac)) d.mac = limpio(c.mac);
  if (!vacio(c.cond)) d.condicion = limpio(c.cond);
  return d;
}

function codigoNuevo() {
  let n = db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE codigo LIKE 'SP-CEL-%'").get().c + 1;
  let codigo = `SP-CEL-${String(n).padStart(3, "0")}`;
  while (db.prepare("SELECT 1 FROM equipos WHERE codigo = ?").get(codigo) || usados.has(codigo)) {
    n += 1; codigo = `SP-CEL-${String(n).padStart(3, "0")}`;
  }
  usados.add(codigo);
  return codigo;
}
const usados = new Set();

const sync = db.transaction(() => {
  for (const c of celulares) {
    const empId = empleadoDe(c);
    const det = detallesDe(c);
    const marca = /iphone/i.test(c.modelo) ? "APPLE" : /motorola/i.test(c.modelo) ? "MOTOROLA" : "";
    // La "serie" del listado es código de modelo en los Motorola: no se guarda como serie.
    const serieReal = /^(PBBJ|PAWR)/i.test(limpio(c.serie)) ? null : limpio(c.serie) || null;
    if (serieReal === null && !vacio(c.serie)) det.descripcion = `${limpio(c.modelo)} (código ${limpio(c.serie)})`;
    const specs = [det.numero, det.plan, det.imei].filter(Boolean).join(" · ");

    const ex = vivos.find((e) => e.imei === c.imei);
    if (ex) {
      rep.actualizados.push(`${ex.codigo}  ${limpio(c.modelo)}  IMEI ${c.imei}  -> ${c.num || "sin empleado"} ${c.usuario}`);
      if (APLICAR)
        db.prepare(
          "UPDATE equipos SET marca=?, modelo=?, numero_serie=?, specs=?, detalles=?, estado=?, asignado_a=? WHERE id=?"
        ).run(marca, limpio(c.modelo), serieReal, specs || null, JSON.stringify({ ...ex.det, ...det }), empId ? "ASIGNADO" : "DISPONIBLE", empId, ex.id);
    } else {
      const codigo = codigoNuevo();
      rep.creados.push(`${codigo}  ${limpio(c.modelo)}  IMEI ${c.imei}  -> ${c.num || "sin empleado"} ${c.usuario}`);
      if (APLICAR)
        db.prepare(
          "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, estado, asignado_a) VALUES (?,?,?,?,?,?,?,?,?,?)"
        ).run(codigo, "CELULAR", "Celular", marca, limpio(c.modelo), serieReal, specs || null, JSON.stringify(det), empId ? "ASIGNADO" : "DISPONIBLE", empId);
    }
  }
});
sync();

// ---------- 4. Responsivas de teléfono ----------
// Solo se conservan vigentes las que corresponden al listado: el equipo debe
// seguir en él y estar a nombre del mismo empleado. Las demás se cierran (no se
// borran: el papel firmado se queda como historial).
const revisarResponsivas = db.transaction(() => {
  const vigentes = db
    .prepare(
      `SELECT r.id, r.folio, em.numero_empleado, em.nombre
       FROM responsivas r JOIN empleados em ON em.id = r.empleado_id
       WHERE r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'`
    )
    .all();
  for (const r of vigentes) {
    const items = db
      .prepare(
        `SELECT e.codigo, e.tipo, e.detalles FROM responsiva_items ri
         JOIN equipos e ON e.id = ri.equipo_id WHERE ri.responsiva_id = ?`
      )
      .all(r.id);
    // Solo se juzgan las responsivas que son únicamente de teléfono.
    if (!items.length || !items.every((i) => i.tipo === "CELULAR")) continue;

    let motivo = "";
    for (const i of items) {
      const imei = dig(leerDetalles(i.detalles).imei);
      const oficial = oficialPorImei.get(imei);
      if (!oficial) {
        motivo = `${i.codigo} ya no está en el listado de telefonía`;
        break;
      }
      if (limpio(oficial.num) !== limpio(r.numero_empleado)) {
        motivo = `${i.codigo} ahora es de ${oficial.num} ${oficial.usuario}`;
        break;
      }
    }
    if (!motivo) continue;
    rep.cerradas.push(`${r.folio} (${r.numero_empleado} ${r.nombre}) — ${motivo}`);
    if (APLICAR) db.prepare("UPDATE responsivas SET estado = 'CERRADA' WHERE id = ?").run(r.id);
  }
});
revisarResponsivas();

db.close();

// Lo que se resolvió solo queda registrado, no como pendiente del usuario.
rep.avisos.push(...lineasQuitadas);

const bloque = (t, l) => { console.log(`\n### ${t}: ${l.length}`); l.forEach((x) => console.log("  - " + x)); };
console.log(APLICAR ? "=== SINCRONIZACIÓN APLICADA ===" : "=== SIMULACIÓN (no se escribió nada) ===");
bloque("Registros duplicados unidos", rep.unidos);
bloque("Eliminados (no están en el listado)", rep.eliminados);
bloque("Duplicados resueltos", rep.duplicados);
bloque("Cartas responsivas eliminadas", rep.responsivas);
bloque("Actualizados", rep.actualizados);
bloque("Creados", rep.creados);
bloque("Empleados nuevos", rep.empleados);
bloque("Responsivas cerradas (no corresponden al listado)", rep.cerradas);
bloque("Avisos", rep.avisos);
console.log(`\nTotal de celulares que deben quedar: ${celulares.length}`);
if (!APLICAR) console.log("Revisa la lista y vuelve a correr con --aplicar");
