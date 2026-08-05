/**
 * Compara el inventario de teléfonos contra el listado oficial y dice, sin
 * cambiar nada, qué está bien y qué no. Sirve para saber por qué falta o sobra
 * un teléfono.
 *
 *   node scripts/revisar-celulares.mjs
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const RAIZ = process.cwd();
const DB_PATH = path.join(RAIZ, "data", "app.db");
const dig = (v) => (v ?? "").toString().replace(/\D/g, "");

if (!fs.existsSync(DB_PATH)) { console.error(`No encuentro ${DB_PATH}. Corre el script desde la carpeta del proyecto.`); process.exit(1); }
const { celulares } = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "celulares-oficial.json"), "utf8"));

const db = new Database(DB_PATH);
const enSistema = db
  .prepare(
    `SELECT e.id, e.codigo, e.modelo, e.estado, e.detalles, em.numero_empleado AS num, em.nombre AS empleado
     FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a
     WHERE e.tipo = 'CELULAR' ORDER BY e.codigo`
  )
  .all()
  .map((e) => { let d = {}; try { d = e.detalles ? JSON.parse(e.detalles) : {}; } catch {} return { ...e, imei: dig(d.imei) }; });

const porImei = new Map();
for (const e of enSistema) {
  if (!porImei.has(e.imei)) porImei.set(e.imei, []);
  porImei.get(e.imei).push(e);
}

const responsivasDe = (id) =>
  db
    .prepare(
      `SELECT r.folio, r.estado FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
       WHERE ri.equipo_id = ? AND r.estado != 'ELIMINADA'`
    )
    .all(id);

console.log(`Listado oficial: ${celulares.length} teléfonos`);
console.log(`En el inventario: ${enSistema.length} teléfonos\n`);

const faltan = [];
const ok = [];
for (const c of celulares) {
  const hallados = porImei.get(c.imei) ?? [];
  if (!hallados.length) { faltan.push(c); continue; }
  ok.push({ c, e: hallados[0], copias: hallados.length });
}
const sobran = enSistema.filter((e) => !celulares.some((c) => c.imei === e.imei));

if (faltan.length) {
  console.log(`### FALTAN en el inventario: ${faltan.length}`);
  for (const c of faltan) console.log(`  - ${c.usuario}  (empleado ${c.num})  IMEI ${c.imei}  ${c.modelo}`);
} else {
  console.log("### FALTAN en el inventario: 0  — están los del listado");
}

console.log(`\n### SOBRAN (no están en el listado): ${sobran.length}`);
for (const e of sobran) console.log(`  - ${e.codigo}  ${e.modelo}  IMEI ${e.imei || "(vacío)"}  -> ${e.empleado ?? "sin asignar"}`);

const repetidos = [...porImei.entries()].filter(([imei, l]) => imei && l.length > 1);
console.log(`\n### IMEI repetidos: ${repetidos.length}`);
for (const [imei, l] of repetidos) console.log(`  - IMEI ${imei}: ${l.map((e) => e.codigo).join(", ")}`);

console.log(`\n### Detalle de los ${ok.length} correctos`);
for (const { c, e, copias } of ok) {
  const rs = responsivasDe(e.id);
  const cartas = rs.length ? rs.map((r) => `${r.folio} (${r.estado})`).join(", ") : "SIN RESPONSIVA";
  const empOk = (e.num ?? "") === c.num ? "" : `  [ojo: asignado a ${e.empleado ?? "nadie"}, el listado dice ${c.num} ${c.usuario}]`;
  console.log(`  - ${e.codigo}  ${c.usuario.padEnd(34)} ${cartas}${copias > 1 ? `  [${copias} copias]` : ""}${empOk}`);
}

db.close();
