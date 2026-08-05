/**
 * Depura el inventario: quita registros duplicados y da de baja los equipos
 * dañados que siguen asignados.
 *
 *   node scripts/depurar-inventario.mjs            # simulación
 *   node scripts/depurar-inventario.mjs --aplicar  # ejecuta
 *
 * Qué hace:
 *  1. Duplicados: cuando dos registros son el mismo equipo (misma serie o mismo
 *     IMEI) se FUSIONAN en uno solo. El registro que se queda es el más
 *     completo y hereda las responsivas y el historial del otro; el sobrante
 *     desaparece. Así el aviso de "datos repetidos" sí se va: dar de baja el
 *     sobrante no servía, porque el registro seguía ahí.
 *  2. Dañados: los equipos de la lista DANADOS pasan a BAJA, se libera al
 *     empleado y se cierra la responsiva vigente si la tuviera.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fusionarInventario } from "../lib/fusionar.mjs";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = process.cwd();
const DB_PATH = path.join(RAIZ, "data", "app.db");

// Series de los equipos reportados como dañados (se comparan sin O/0 ni guiones).
const DANADOS = [
  "B8416887", "C0914533", "C1212910", "C0212657", "B5103131", "C1212909",
  "B9913104", "B6A02861", "C0C15236", "BOA037544", "TX-2209A09475",
  "B7813022", "B7813024",
];

const N = (s) => (s ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
const NL = (s) => N(s).replace(/O/g, "0").replace(/^TX/, "");
const dig = (s) => (s ?? "").toString().replace(/\D/g, "");

if (!fs.existsSync(DB_PATH)) { console.error(`No encuentro ${DB_PATH}.`); process.exit(1); }
if (APLICAR) {
  const dir = path.join(RAIZ, "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `app.db.antes-de-depurar-${Date.now()}.db`);
  fs.copyFileSync(DB_PATH, destino);
  console.log(`Respaldo: ${path.relative(RAIZ, destino)}\n`);
}

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");
const rep = { unidos: [], bajasDanados: [], liberados: [], cerradas: [], avisos: [] };

// ---------- 1. Duplicados: se fusionan en un solo registro ----------
const fusion = fusionarInventario(db, { aplicar: APLICAR });
rep.unidos.push(...fusion.unidos);
rep.avisos.push(...fusion.avisos);

const equipos = db.prepare("SELECT * FROM equipos").all();

const depurar = db.transaction(() => {
  // ---------- 2. Equipos dañados ----------
  const clavesDanadas = new Set(DANADOS.map(NL));
  for (const e of equipos) {
    if (!e.numero_serie || !clavesDanadas.has(NL(e.numero_serie))) continue;
    if (e.estado === "BAJA") continue;
    const emp = e.asignado_a
      ? db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id=?").get(e.asignado_a)
      : null;
    rep.bajasDanados.push(`${e.codigo}  serie ${e.numero_serie}  ${e.marca} ${e.modelo}` + (emp ? `  (estaba con ${emp.numero_empleado} ${emp.nombre})` : ""));
    if (emp) rep.liberados.push(`${emp.numero_empleado} ${emp.nombre} queda libre de ${e.codigo}`);
    if (!APLICAR) continue;
    // Se cierra la responsiva vigente: el equipo ya no está en uso.
    const vigentes = db.prepare(
      `SELECT r.id, r.folio FROM responsivas r JOIN responsiva_items ri ON ri.responsiva_id = r.id
       WHERE ri.equipo_id = ? AND r.tipo='ASIGNACION' AND r.estado='VIGENTE'`
    ).all(e.id);
    for (const v of vigentes) {
      db.prepare("UPDATE responsivas SET estado='CERRADA' WHERE id=?").run(v.id);
      rep.cerradas.push(`${v.folio} (equipo dañado ${e.codigo})`);
    }
    db.prepare("UPDATE equipos SET estado='BAJA', asignado_a=NULL WHERE id=?").run(e.id);
  }
});
depurar();
db.close();

const bloque = (t, l) => { console.log(`\n### ${t}: ${l.length}`); l.forEach((x) => console.log("  - " + x)); };
console.log(APLICAR ? "=== DEPURACIÓN APLICADA ===" : "=== SIMULACIÓN (no se escribió nada) ===");
bloque("Duplicados unidos en un solo registro", rep.unidos);
bloque("Equipos dañados dados de baja", rep.bajasDanados);
bloque("Empleados liberados", rep.liberados);
bloque("Responsivas cerradas", rep.cerradas);
bloque("Avisos", rep.avisos);
if (!APLICAR) console.log("\nRevisa la lista y vuelve a correr con --aplicar");
