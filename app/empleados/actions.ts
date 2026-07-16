"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import type { ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/empleados");
  revalidatePath("/");
  revalidatePath("/responsivas/nueva");
}

export async function guardarEmpleado(datos: {
  id?: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  correo: string;
  telefono: string;
}): Promise<ResultadoAccion> {
  try {
    const numero = datos.numero_empleado.trim();
    const nombre = datos.nombre.trim();
    if (!numero || !nombre || !datos.puesto.trim() || !datos.departamento.trim()) {
      return { ok: false, error: "Número, nombre, puesto y departamento son obligatorios." };
    }

    const duplicado = db
      .prepare("SELECT id FROM empleados WHERE numero_empleado = ? AND id != ?")
      .get(numero, datos.id ?? -1) as { id: number } | undefined;
    if (duplicado) return { ok: false, error: `Ya existe un empleado con el número ${numero}.` };

    if (datos.id) {
      db.prepare(
        "UPDATE empleados SET numero_empleado=?, nombre=?, puesto=?, departamento=?, correo=?, telefono=? WHERE id=?"
      ).run(numero, nombre, datos.puesto.trim(), datos.departamento.trim(), datos.correo.trim() || null, datos.telefono.trim() || null, datos.id);
    } else {
      db.prepare(
        "INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, correo, telefono) VALUES (?,?,?,?,?,?)"
      ).run(numero, nombre, datos.puesto.trim(), datos.departamento.trim(), datos.correo.trim() || null, datos.telefono.trim() || null);
    }
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el empleado." };
  }
}

export async function cambiarActivoEmpleado(id: number, activo: boolean): Promise<ResultadoAccion> {
  try {
    if (!activo) {
      const conEquipos = db
        .prepare("SELECT COUNT(*) AS c FROM equipos WHERE asignado_a = ?")
        .get(id) as { c: number };
      if (conEquipos.c > 0) {
        return { ok: false, error: "El empleado tiene equipos asignados. Registra primero la devolución." };
      }
    }
    db.prepare("UPDATE empleados SET activo=? WHERE id=?").run(activo ? 1 : 0, id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar el estado." };
  }
}

export async function eliminarEmpleado(id: number): Promise<ResultadoAccion> {
  try {
    const historial = db
      .prepare("SELECT COUNT(*) AS c FROM responsivas WHERE empleado_id = ?")
      .get(id) as { c: number };
    const equipos = db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE asignado_a = ?").get(id) as { c: number };
    if (historial.c > 0 || equipos.c > 0) {
      return {
        ok: false,
        error: "El empleado tiene responsivas o equipos en su historial. Márcalo como inactivo en lugar de eliminarlo.",
      };
    }
    db.prepare("DELETE FROM empleados WHERE id=?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el empleado." };
  }
}
