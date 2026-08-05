/**
 * Muestra EXACTAMENTE qué está repetido en el inventario y en qué campo.
 *
 *   node scripts/revisar-duplicados.mjs
 *
 * Solo lee: nunca modifica nada. Sirve para entender el aviso de
 * "equipos con datos repetidos" antes de decidir qué corregir.
 */
import path from "path";
import Database from "better-sqlite3";
import { detectarDuplicados, ETIQUETA_CAMPO_DUP, CAMPOS_BLOQUEANTES } from "../lib/duplicados.ts";

const db = new Database(path.join(process.cwd(), "data", "app.db"));
const equipos = db.prepare("SELECT id, codigo, tipo, marca, modelo, numero_serie, detalles, estado, asignado_a FROM equipos").all();
const dup = detectarDuplicados(equipos);
const porId = new Map(equipos.map((e) => [e.id, e]));

console.log(`Equipos en el inventario: ${equipos.length}`);
console.log(`Equipos con datos repetidos: ${Object.keys(dup).length}\n`);

// Agrupa por campo y valor para ver los conjuntos completos
const grupos = new Map();
for (const [id, conflictos] of Object.entries(dup)) {
  for (const c of conflictos) {
    const clave = `${c.campo}|${c.valor}`;
    if (!grupos.has(clave)) grupos.set(clave, { campo: c.campo, etiqueta: c.etiqueta, valor: c.valor, ids: new Set() });
    grupos.get(clave).ids.add(Number(id));
  }
}

const porCampo = {};
for (const g of grupos.values()) porCampo[g.etiqueta] = (porCampo[g.etiqueta] ?? 0) + 1;
console.log("Repeticiones por campo:");
for (const [campo, n] of Object.entries(porCampo)) console.log(`  ${String(n).padStart(3)}  ${campo}`);

console.log("\nDetalle:");
for (const g of [...grupos.values()].sort((a, b) => b.ids.size - a.ids.size)) {
  const bloqueante = CAMPOS_BLOQUEANTES.includes(g.campo);
  console.log(`\n  ${g.etiqueta.toUpperCase()} "${g.valor}"  (${g.ids.size} equipos)${bloqueante ? "  << impide guardar" : "  (solo aviso)"}`);
  for (const id of g.ids) {
    const e = porId.get(id);
    const emp = e.asignado_a
      ? db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id=?").get(e.asignado_a)
      : null;
    console.log(
      `     ${e.codigo.padEnd(12)} ${(e.marca + " " + e.modelo).slice(0, 26).padEnd(27)} serie ${(e.numero_serie ?? "—").padEnd(14)} ` +
        `${e.estado.padEnd(11)} ${emp ? emp.numero_empleado + " " + emp.nombre : "(libre)"}`
    );
  }
}

console.log(`
----------------------------------------------------------------
Los de serie e IMEI los resuelve  node scripts/depurar-inventario.mjs
Los de no. de activo y nombre de computadora son informativos: se
corrigen editando el equipo, porque solo tú sabes cuál es el bueno.
----------------------------------------------------------------`);
db.close();
