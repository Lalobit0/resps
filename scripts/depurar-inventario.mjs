/**
 * Depura el inventario: quita registros duplicados y da de baja los equipos
 * dañados que siguen asignados.
 *
 *   node scripts/depurar-inventario.mjs            # simulación
 *   node scripts/depurar-inventario.mjs --aplicar  # ejecuta
 *
 * Qué hace:
 *  1. Duplicados: cuando dos registros son el mismo equipo (misma serie o mismo
 *     IMEI), conserva el que tiene más datos y elimina el otro. Si el sobrante
 *     tiene historial no se borra: pasa a BAJA para no romper las responsivas.
 *  2. Dañados: los equipos de la lista DANADOS pasan a BAJA, se libera al
 *     empleado y se cierra la responsiva vigente si la tuviera.
 *  3. Nunca borra un equipo que tenga una responsiva vigente.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

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
const rep = { eliminados: [], bajasDup: [], bajasDanados: [], liberados: [], cerradas: [], avisos: [] };

const detalles = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
const equipos = db.prepare("SELECT * FROM equipos").all().map((e) => {
  const d = detalles(e.detalles);
  return { ...e, det: d, imei: dig(d.imei), riqueza: Object.values(d).filter(Boolean).length + (e.numero_serie ? 1 : 0) + (e.marca ? 1 : 0) };
});
const historial = (id) =>
  db.prepare("SELECT COUNT(*) AS c FROM responsiva_items WHERE equipo_id = ?").get(id).c +
  db.prepare("SELECT COUNT(*) AS c FROM mantenimientos WHERE equipo_id = ?").get(id).c;
const tieneVigente = (id) =>
  db.prepare(
    `SELECT COUNT(*) AS c FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
     WHERE ri.equipo_id = ? AND r.tipo='ASIGNACION' AND r.estado='VIGENTE'`
  ).get(id).c > 0;

const depurar = db.transaction(() => {
  // ---------- 1. Duplicados ----------
  // Se agrupa por serie y también por IMEI, porque el registro repetido suele
  // venir incompleto (con serie pero sin IMEI) y sin unir ambas pistas no se
  // detectaría. Dentro de cada grupo, dos IMEI distintos son dos equipos
  // distintos aunque compartan "serie": hay series que son código de modelo.
  const candidatos = new Map();
  const agrega = (clave, e) => {
    if (!clave) return;
    if (!candidatos.has(clave)) candidatos.set(clave, []);
    candidatos.get(clave).push(e);
  };
  for (const e of equipos) {
    if (e.numero_serie && N(e.numero_serie).length > 2) agrega(`S${N(e.numero_serie)}`, e);
    if (e.imei) agrega(`I${e.imei}`, e);
  }

  const yaTratados = new Set();
  const grupos = new Map();
  for (const [clave, lista] of candidatos) {
    if (lista.length < 2) continue;
    const imeis = new Set(lista.map((e) => e.imei).filter(Boolean));
    if (imeis.size > 1) {
      // Misma "serie" con IMEI distintos: son equipos diferentes, no duplicados.
      rep.avisos.push(
        `${clave.slice(1)} la comparten ${lista.length} equipos con IMEI distintos (${lista.map((e) => e.codigo).join(", ")}): ` +
          `es código de modelo, no número de serie. No se tocan.`
      );
      continue;
    }
    const unicos = lista.filter((e) => !yaTratados.has(e.id));
    if (unicos.length < 2) continue;
    unicos.forEach((e) => yaTratados.add(e.id));
    grupos.set(clave, unicos);
  }

  for (const [clave, lista] of grupos) {
    if (lista.length < 2) continue;
    // Se conserva el registro con más información (y, a igualdad, el más antiguo).
    const orden = [...lista].sort((a, b) => b.riqueza - a.riqueza || a.id - b.id);
    const conservar = orden[0];
    for (const sobra of orden.slice(1)) {
      if (tieneVigente(sobra.id)) {
        rep.avisos.push(`${sobra.codigo} parece duplicado de ${conservar.codigo} pero tiene una responsiva VIGENTE: se deja intacto.`);
        continue;
      }
      const etiqueta = `${sobra.codigo} (${sobra.marca} ${sobra.modelo}) duplicado de ${conservar.codigo} por ${clave.startsWith("I") ? "IMEI" : "serie"}`;
      if (historial(sobra.id) > 0) {
        rep.bajasDup.push(`${etiqueta} — con historial, pasa a BAJA`);
        if (APLICAR) db.prepare("UPDATE equipos SET estado='BAJA', asignado_a=NULL WHERE id=?").run(sobra.id);
      } else {
        rep.eliminados.push(etiqueta);
        if (APLICAR) db.prepare("DELETE FROM equipos WHERE id=?").run(sobra.id);
      }
    }
  }

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
bloque("Duplicados eliminados", rep.eliminados);
bloque("Duplicados dados de baja (tenían historial)", rep.bajasDup);
bloque("Equipos dañados dados de baja", rep.bajasDanados);
bloque("Empleados liberados", rep.liberados);
bloque("Responsivas cerradas", rep.cerradas);
bloque("Avisos", rep.avisos);
if (!APLICAR) console.log("\nRevisa la lista y vuelve a correr con --aplicar");
