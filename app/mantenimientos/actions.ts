"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import type { ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/mantenimientos");
  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function guardarMantenimiento(datos: {
  id?: number;
  equipo_id: number;
  tipo: string;
  descripcion: string;
  fecha_programada: string;
  tecnico: string;
  notas: string;
  ponerEnMantenimiento: boolean;
}): Promise<ResultadoAccion> {
  try {
    if (!datos.equipo_id) return { ok: false, error: "Selecciona un equipo." };
    if (!datos.descripcion.trim()) return { ok: false, error: "Describe el mantenimiento a realizar." };
    if (!datos.fecha_programada) return { ok: false, error: "Indica la fecha programada." };

    if (datos.id) {
      db.prepare(
        "UPDATE mantenimientos SET equipo_id=?, tipo=?, descripcion=?, fecha_programada=?, tecnico=?, notas=? WHERE id=?"
      ).run(
        datos.equipo_id,
        datos.tipo,
        datos.descripcion.trim(),
        datos.fecha_programada,
        datos.tecnico.trim() || null,
        datos.notas.trim() || null,
        datos.id
      );
    } else {
      db.prepare(
        "INSERT INTO mantenimientos (equipo_id, tipo, descripcion, fecha_programada, tecnico, notas) VALUES (?,?,?,?,?,?)"
      ).run(
        datos.equipo_id,
        datos.tipo,
        datos.descripcion.trim(),
        datos.fecha_programada,
        datos.tecnico.trim() || null,
        datos.notas.trim() || null
      );
    }

    if (datos.ponerEnMantenimiento) {
      const eq = db.prepare("SELECT estado FROM equipos WHERE id=?").get(datos.equipo_id) as
        | { estado: string }
        | undefined;
      if (eq && eq.estado !== "BAJA") {
        db.prepare("UPDATE equipos SET estado='MANTENIMIENTO' WHERE id=?").run(datos.equipo_id);
      }
    }

    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el mantenimiento." };
  }
}

export async function completarMantenimiento(datos: {
  id: number;
  fecha_realizada: string;
  costo: string;
  notas: string;
}): Promise<ResultadoAccion> {
  try {
    const mant = db.prepare("SELECT equipo_id FROM mantenimientos WHERE id=?").get(datos.id) as
      | { equipo_id: number }
      | undefined;
    if (!mant) return { ok: false, error: "El mantenimiento ya no existe." };

    const costo = datos.costo.trim() ? Number(datos.costo) : null;
    if (costo !== null && Number.isNaN(costo)) return { ok: false, error: "El costo debe ser un número." };

    db.prepare(
      "UPDATE mantenimientos SET estado='COMPLETADO', fecha_realizada=?, costo=?, notas=COALESCE(NULLIF(?, ''), notas) WHERE id=?"
    ).run(datos.fecha_realizada, costo, datos.notas.trim(), datos.id);

    // Al completar, el equipo regresa a su estado natural
    const eq = db.prepare("SELECT estado, asignado_a FROM equipos WHERE id=?").get(mant.equipo_id) as
      | { estado: string; asignado_a: number | null }
      | undefined;
    if (eq && eq.estado === "MANTENIMIENTO") {
      if (eq.asignado_a) {
        db.prepare("UPDATE equipos SET estado='ASIGNADO' WHERE id=?").run(mant.equipo_id);
      } else {
        db.prepare("UPDATE equipos SET estado='DISPONIBLE' WHERE id=?").run(mant.equipo_id);
      }
    }

    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo completar el mantenimiento." };
  }
}

export async function cancelarMantenimiento(id: number): Promise<ResultadoAccion> {
  try {
    db.prepare("UPDATE mantenimientos SET estado='CANCELADO' WHERE id=?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cancelar." };
  }
}

export async function eliminarMantenimiento(id: number): Promise<ResultadoAccion> {
  try {
    db.prepare("DELETE FROM mantenimientos WHERE id=?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar." };
  }
}
