"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { listaOficial, revisarCelulares, type CelularOficial } from "../../lib/celulares";
import type { ResultadoAccion } from "../../lib/types";
import { exigir } from "../../lib/auth";

const limpio = (v: unknown) => String(v ?? "").trim();
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const vacio = (v: unknown) => !limpio(v) || /^(na|n\/a|#n\/a|-|0)$/i.test(limpio(v));

function codigoNuevo(usados: Set<string>): string {
  let n = (db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE codigo LIKE 'SP-CEL-%'").get() as { c: number }).c + 1;
  let codigo = `SP-CEL-${String(n).padStart(3, "0")}`;
  while (db.prepare("SELECT 1 FROM equipos WHERE codigo = ?").get(codigo) || usados.has(codigo)) {
    n += 1;
    codigo = `SP-CEL-${String(n).padStart(3, "0")}`;
  }
  usados.add(codigo);
  return codigo;
}

/** Empleado del listado; si no existe todavía en el sistema, se da de alta. */
function empleadoDe(c: CelularOficial): number | null {
  if (vacio(c.num)) return null;
  const num = limpio(c.num);
  const ex = db.prepare("SELECT id FROM empleados WHERE numero_empleado = ?").get(num) as { id: number } | undefined;
  if (ex) return ex.id;
  const info = db
    .prepare("INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, area) VALUES (?,?,?,?,?)")
    .run(num, limpio(c.usuario) || "Por definir", "Por definir", limpio(c.area) || "Por definir", limpio(c.area) || null);
  return Number(info.lastInsertRowid);
}

function detallesDe(c: CelularOficial): Record<string, string> {
  const d: Record<string, string> = { imei: dig(c.imei) };
  if (!vacio(c.imei2)) d.imei2 = dig(c.imei2);
  if (!vacio(c.linea)) d.numero = limpio(c.linea);
  if (!vacio(c.plan)) d.plan = `TELCEL PLUS EMPRESARIAL ${limpio(c.plan)}${vacio(c.gb) ? "" : ` - ${limpio(c.gb)}`}`;
  if (!vacio(c.precio)) d.plan_precio = `$${limpio(c.precio)}.00`;
  if (!vacio(c.pin)) d.pin = limpio(c.pin);
  if (!vacio(c.icloud)) d.icloud = limpio(c.icloud);
  if (!vacio(c.mac)) d.mac = limpio(c.mac);
  if (!vacio(c.cond)) d.condicion = limpio(c.cond);
  return d;
}

/**
 * Da de alta los teléfonos del listado oficial que no están en el inventario y
 * los deja asignados a su empleado.
 */
export async function agregarCelularesFaltantes(): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const { faltan } = revisarCelulares();
    if (!faltan.length) return { ok: true, mensaje: "El inventario ya tiene todos los teléfonos del listado." };

    const usados = new Set<string>();
    const creados: string[] = [];

    const alta = db.transaction(() => {
      for (const c of faltan) {
        const empId = empleadoDe(c);
        const det = detallesDe(c);
        const modelo = limpio(c.modelo);
        const marca = /iphone/i.test(modelo) ? "APPLE" : /motorola/i.test(modelo) ? "MOTOROLA" : "";
        // En los Motorola la "serie" del listado es el código de modelo y la
        // traen varios equipos: no se guarda como número de serie.
        const serie = /^(PBBJ|PAWR)/i.test(limpio(c.serie)) ? null : limpio(c.serie) || null;
        if (!serie && !vacio(c.serie)) det.descripcion = `${modelo} (código ${limpio(c.serie)})`;
        const specs = [det.numero, det.plan, det.imei].filter(Boolean).join(" · ");
        const codigo = codigoNuevo(usados);

        db.prepare(
          "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, estado, asignado_a) VALUES (?,?,?,?,?,?,?,?,?,?)"
        ).run(codigo, "CELULAR", "Celular", marca, modelo, serie, specs || null, JSON.stringify(det), empId ? "ASIGNADO" : "DISPONIBLE", empId);

        creados.push(`${codigo} ${modelo} — ${limpio(c.usuario) || "sin empleado"}`);
        db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
          "ALTA_CELULAR_LISTADO",
          `Se dio de alta ${codigo} (${modelo}, IMEI ${det.imei}) para ${limpio(c.usuario) || "sin empleado"} desde el listado de telefonía`,
          JSON.stringify({ codigo, imei: det.imei, usuario: c.usuario })
        );
      }
    });
    alta();

    revalidatePath("/lineas");
    revalidatePath("/inventario");
    revalidatePath("/empleados");
    revalidatePath("/");
    return { ok: true, mensaje: `Se agregaron ${creados.length} teléfono(s): ${creados.join(" · ")}` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron agregar los teléfonos faltantes." };
  }
}
