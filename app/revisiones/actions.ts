"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { hoyISO } from "../../lib/helpers";
import { camposDe, tipoRevision } from "../../lib/formatos/tipos";
import { siguienteFolioRevision } from "../../lib/revisiones";
import type { ResultadoAccion } from "../../lib/types";
import { exigir } from "../../lib/auth";

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
  await exigir("ti.editar");
  try {
    const tipo = tipoRevision(datos.tipo);
    if (!tipo) return { ok: false, error: "Tipo de documento no válido." };
    if (tipo.requiereEquipo && !datos.equipoId) return { ok: false, error: "Elige el equipo al que corresponde." };
    if (!datos.empleadoId) return { ok: false, error: "Elige al empleado." };

    const hoy = hoyISO();
    const fecha = (datos.fecha || hoy).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha no es válida." };
    if (fecha > hoy) return { ok: false, error: "La fecha no puede ser posterior a hoy." };

    // Cada punto se guarda con su grupo: el mismo nombre puede repetirse en
    // columnas distintas del formato ("Otros" está en las tres del FSI-03).
    const claves = tipo.grupos.flatMap((g) => g.puntos.map((p) => `${g.titulo}:${p}`));
    const sinMarcar = claves.filter((c) => !datos.puntos[c]);
    if (sinMarcar.length) {
      return { ok: false, error: `Faltan ${sinMarcar.length} punto(s) por marcar.` };
    }

    // Un "No" en cualquier punto es un hallazgo: es lo que hace útil el registro.
    const conHallazgos = claves.some((c) => datos.puntos[c] === "No");

    const guardados: Record<string, string> = {};
    for (const c of claves) guardados[`punto:${c}`] = datos.puntos[c];
    for (const x of camposDe(tipo)) {
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
  await exigir("ti.editar");
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
  await exigir("ti.ver");
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

/**
 * Mantenimientos ya registrados en el sistema, para partir de uno en vez de
 * volver a capturar lo mismo: el FSI-03 sale de ahí.
 */
export type MantenimientoParaFormato = {
  id: number;
  texto: string;
  equipoId: number;
  empleadoId: number | null;
  fecha: string;
  tipo: string;
  tecnico: string | null;
  descripcion: string;
  notas: string | null;
};

export async function mantenimientosParaFormato(): Promise<{ mantenimientos: MantenimientoParaFormato[] }> {
  await exigir("ti.ver");
  const filas = db
    .prepare(
      `SELECT m.id, m.equipo_id, m.tipo, m.descripcion, m.notas, m.tecnico,
              COALESCE(m.fecha_realizada, m.fecha_programada) AS fecha, m.estado,
              e.codigo, e.marca, e.modelo, e.asignado_a,
              em.numero_empleado, em.nombre AS empleado
       FROM mantenimientos m
       JOIN equipos e ON e.id = m.equipo_id
       LEFT JOIN empleados em ON em.id = e.asignado_a
       ORDER BY COALESCE(m.fecha_realizada, m.fecha_programada) DESC, m.id DESC
       LIMIT 200`
    )
    .all() as {
    id: number;
    equipo_id: number;
    tipo: string;
    descripcion: string;
    notas: string | null;
    tecnico: string | null;
    fecha: string;
    estado: string;
    codigo: string;
    marca: string;
    modelo: string;
    asignado_a: number | null;
    numero_empleado: string | null;
    empleado: string | null;
  }[];

  return {
    mantenimientos: filas.map((m) => ({
      id: m.id,
      equipoId: m.equipo_id,
      empleadoId: m.asignado_a,
      fecha: m.fecha,
      // El módulo guarda PREVENTIVO/CORRECTIVO; el formato lo escribe con inicial.
      tipo: m.tipo?.toUpperCase().startsWith("CORRECT") ? "Correctivo" : "Preventivo",
      tecnico: m.tecnico,
      descripcion: m.descripcion,
      notas: m.notas,
      texto:
        `${m.codigo} · ${m.marca} ${m.modelo} · ${m.fecha}` +
        `${m.empleado ? ` · ${m.numero_empleado} ${m.empleado}` : " · sin empleado"}` +
        ` · ${m.descripcion.slice(0, 40)}`,
    })),
  };
}
