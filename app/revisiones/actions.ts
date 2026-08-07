"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { hoyISO } from "../../lib/helpers";
import { tipoRevision } from "../../lib/formatos/tipos";
import { siguienteFolioRevision } from "../../lib/revisiones";
import type { ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/revisiones");
  revalidatePath("/empleados");
  revalidatePath("/inventario");
}

function registrarBitacora(accion: string, descripcion: string) {
  db.prepare("INSERT INTO bitacora (accion, descripcion, revertible) VALUES (?,?,0)").run(accion, descripcion);
}

export type DatosRevision = {
  tipo: string;
  empleadoId: number | null;
  equipoId: number | null;
  fecha: string;
  realizadaPor: string;
  /** Por cada punto del formato: "Si" o "No". */
  puntos: Record<string, string>;
  /** Campos propios del formato. */
  extras: Record<string, string>;
  observaciones: string;
};

/**
 * Guarda una revisión. El documento se genera después a partir de esto: lo que
 * respalda el formato es el registro, no una firma en papel.
 */
export async function guardarRevision(datos: DatosRevision): Promise<ResultadoAccion> {
  try {
    const tipo = tipoRevision(datos.tipo);
    if (!tipo) return { ok: false, error: "Tipo de documento no válido." };
    if (tipo.requiereEquipo && !datos.equipoId) return { ok: false, error: "Elige el equipo al que corresponde." };
    if (!datos.empleadoId) return { ok: false, error: "Elige al empleado." };

    const hoy = hoyISO();
    const fecha = (datos.fecha || hoy).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha no es válida." };
    if (fecha > hoy) return { ok: false, error: "La fecha no puede ser posterior a hoy." };

    const sinMarcar = tipo.puntos.filter((p) => !datos.puntos[p]);
    if (sinMarcar.length) {
      return { ok: false, error: `Falta marcar: ${sinMarcar.join(", ")}.` };
    }

    // Un "No" en cualquier punto es un hallazgo: es lo que hace útil el registro.
    const conHallazgos = tipo.puntos.some((p) => datos.puntos[p] === "No");

    const guardados: Record<string, string> = {};
    for (const p of tipo.puntos) guardados[`punto:${p}`] = datos.puntos[p];
    for (const x of tipo.extras) {
      const v = (datos.extras[x.clave] ?? "").trim();
      if (v) guardados[x.clave] = v;
    }

    const folio = siguienteFolioRevision(tipo);
    const info = db
      .prepare(
        `INSERT INTO revisiones (tipo, folio, fecha, empleado_id, equipo_id, realizada_por, resultado, datos, observaciones)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        tipo.clave,
        folio,
        fecha,
        datos.empleadoId,
        datos.equipoId,
        datos.realizadaPor.trim() || null,
        conHallazgos ? "CON_HALLAZGOS" : "SIN_HALLAZGOS",
        JSON.stringify(guardados),
        datos.observaciones.trim() || null
      );

    registrarBitacora("REVISION_IT", `Se registró ${folio} (${tipo.nombre})`);
    revalidar();
    return { ok: true, id: Number(info.lastInsertRowid), folio, mensaje: `Quedó registrada ${folio}.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function eliminarRevision(id: number): Promise<ResultadoAccion> {
  try {
    const r = db.prepare("SELECT folio FROM revisiones WHERE id = ?").get(id) as { folio: string } | undefined;
    if (!r) return { ok: false, error: "Ese registro ya no existe." };
    db.prepare("DELETE FROM revisiones WHERE id = ?").run(id);
    registrarBitacora("REVISION_IT_ELIMINADA", `Se eliminó el registro ${r.folio}`);
    revalidar();
    return { ok: true, mensaje: `Se eliminó ${r.folio}.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar." };
  }
}

/** Equipos que tiene entregados un empleado, para elegir a cuál aplica. */
export async function equiposDelEmpleado(
  empleadoId: number
): Promise<{ equipos: { id: number; codigo: string; texto: string }[] }> {
  if (!Number.isInteger(empleadoId) || empleadoId <= 0) return { equipos: [] };
  const filas = db
    .prepare(
      `SELECT id, codigo, marca, modelo, numero_serie, tipo FROM equipos
       WHERE asignado_a = ? AND estado != 'BAJA' ORDER BY tipo ASC, codigo ASC`
    )
    .all(empleadoId) as { id: number; codigo: string; marca: string; modelo: string; numero_serie: string | null; tipo: string }[];
  return {
    equipos: filas.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      texto: `${e.codigo} · ${e.marca} ${e.modelo}${e.numero_serie ? ` · ${e.numero_serie}` : ""}`,
    })),
  };
}
