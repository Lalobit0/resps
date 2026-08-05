"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { importarDeExcel, serialExcelAISO, type Mapeo } from "../../lib/importar";
import { guardarEquipo } from "../inventario/actions";
import type { Equipo, ResultadoAccion } from "../../lib/types";

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
  area: string;
  clase: string;
  supervisor: string;
  fecha_alta: string;
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

    const vals = [
      numero,
      nombre,
      datos.puesto.trim(),
      datos.departamento.trim(),
      datos.area.trim() || null,
      datos.clase.trim() || null,
      datos.supervisor.trim() || null,
      datos.fecha_alta.trim() || null,
      datos.correo.trim() || null,
      datos.telefono.trim() || null,
    ];

    if (datos.id) {
      db.prepare(
        "UPDATE empleados SET numero_empleado=?, nombre=?, puesto=?, departamento=?, area=?, clase=?, supervisor=?, fecha_alta=?, correo=?, telefono=? WHERE id=?"
      ).run(...vals, datos.id);
    } else {
      db.prepare(
        "INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, area, clase, supervisor, fecha_alta, correo, telefono) VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).run(...vals);
    }
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el empleado." };
  }
}

const MAPEO_EMPLEADOS: Mapeo = {
  numero_empleado: ["num de empleado", "numero de empleado", "num empleado", "no empleado", "no de empleado", "empleado", "num"],
  nombre: ["nombre del empleado", "nombre"],
  fecha_alta: ["fecha de alta", "fecha alta"],
  clase: ["clase de empleado", "clase"],
  puesto: ["puesto"],
  departamento: ["departamento", "depto"],
  area: ["area"],
  supervisor: ["nombre del supervisor", "supervisor", "jefe directo", "jefe"],
};

export async function importarEmpleados(formData: FormData): Promise<ResultadoAccion> {
  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return { ok: false, error: "No se recibió ningún archivo." };
    }
    const buf = Buffer.from(await archivo.arrayBuffer());
    const filas = await importarDeExcel(buf, MAPEO_EMPLEADOS, "EMPLEADOS");
    if (!filas.length) {
      return { ok: false, error: "No se encontraron empleados. Revisa que el archivo tenga los encabezados esperados." };
    }

    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;

    const proceso = db.transaction(() => {
      const buscar = db.prepare("SELECT id FROM empleados WHERE numero_empleado = ?");
      const insertar = db.prepare(
        "INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, area, clase, supervisor, fecha_alta) VALUES (?,?,?,?,?,?,?,?)"
      );
      const actualizar = db.prepare(
        "UPDATE empleados SET nombre=?, puesto=?, departamento=?, area=?, clase=?, supervisor=?, fecha_alta=? WHERE id=?"
      );

      for (const f of filas) {
        const numero = (f.numero_empleado || "").trim();
        const nombre = (f.nombre || "").trim();
        if (!numero || !nombre) {
          omitidos++;
          continue;
        }
        let fecha = (f.fecha_alta || "").trim();
        if (/^\d{4,6}$/.test(fecha)) fecha = serialExcelAISO(Number(fecha));

        const puesto = (f.puesto || "").trim() || "No definido";
        const departamento = (f.departamento || "").trim() || (f.area || "").trim() || "No definido";
        const area = (f.area || "").trim() || null;
        const clase = (f.clase || "").trim() || null;
        const supervisor = (f.supervisor || "").trim() || null;

        const existe = buscar.get(numero) as { id: number } | undefined;
        if (existe) {
          actualizar.run(nombre, puesto, departamento, area, clase, supervisor, fecha || null, existe.id);
          actualizados++;
        } else {
          insertar.run(numero, nombre, puesto, departamento, area, clase, supervisor, fecha || null);
          nuevos++;
        }
      }
    });
    proceso();

    revalidar();
    const partes = [`${nuevos} nuevos`, `${actualizados} actualizados`];
    if (omitidos) partes.push(`${omitidos} omitidos (sin número o nombre)`);
    return { ok: true, mensaje: `Importación lista: ${partes.join(", ")}.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo. Asegúrate de que sea un Excel (.xlsx) válido." };
  }
}

export type DatosBaja = {
  equipos: { id: number; codigo: string; tipo: string; marca: string; modelo: string }[];
  responsivas: { id: number; folio: string; clase: string; equipos: string | null }[];
};

/** Equipos asignados y responsivas vigentes de un empleado, para guiar su baja. */
export async function datosBajaEmpleado(id: number): Promise<DatosBaja> {
  const equipos = db
    .prepare("SELECT id, codigo, tipo, marca, modelo FROM equipos WHERE asignado_a = ? ORDER BY tipo, codigo")
    .all(id) as DatosBaja["equipos"];
  const responsivas = db
    .prepare(
      `SELECT r.id, r.folio, r.clase,
        (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r
       WHERE r.empleado_id = ? AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE' AND r.clase NOT IN ('WIFI','VALE')
       ORDER BY r.id DESC`
    )
    .all(id) as DatosBaja["responsivas"];
  return { equipos, responsivas };
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

/**
 * Entrega a este empleado un equipo que ya está en el inventario.
 * Queda ASIGNADO, y como todavía no tiene carta firmada el sistema lo
 * mostrará de inmediato en "Le faltan N responsivas" para generarla.
 */
export async function asignarEquipo(empleadoId: number, equipoId: number): Promise<ResultadoAccion> {
  try {
    const emp = db.prepare("SELECT id, numero_empleado, nombre FROM empleados WHERE id = ?").get(empleadoId) as
      | { id: number; numero_empleado: string; nombre: string }
      | undefined;
    if (!emp) return { ok: false, error: "El empleado ya no existe." };

    const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoId) as Equipo | undefined;
    if (!eq) return { ok: false, error: "El equipo ya no existe." };
    if (eq.estado === "BAJA") return { ok: false, error: `${eq.codigo} está dado de baja: no se puede entregar.` };
    if (eq.asignado_a && eq.asignado_a !== empleadoId) {
      const otro = db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(eq.asignado_a) as
        | { numero_empleado: string; nombre: string }
        | undefined;
      return {
        ok: false,
        error: `${eq.codigo} ya lo tiene ${otro ? `${otro.numero_empleado} ${otro.nombre}` : "otro empleado"}. Registra primero su devolución.`,
      };
    }

    db.prepare("UPDATE equipos SET estado = 'ASIGNADO', asignado_a = ? WHERE id = ?").run(empleadoId, equipoId);
    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "ASIGNAR_EQUIPO",
      `${eq.codigo} (${eq.marca} ${eq.modelo}) se asignó a ${emp.numero_empleado} ${emp.nombre}`,
      JSON.stringify({ equipo: eq.codigo, empleado: emp.numero_empleado, estado_anterior: eq.estado })
    );

    revalidar();
    revalidatePath("/inventario");
    revalidatePath(`/empleados/${empleadoId}`);
    return {
      ok: true,
      id: equipoId,
      mensaje: `${eq.codigo} ${eq.marca} ${eq.modelo} quedó asignado a ${emp.nombre}. Falta su carta responsiva.`,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo asignar el equipo." };
  }
}

/**
 * Da de alta un equipo que no estaba en el inventario y se lo entrega al
 * empleado en un solo paso. Usa el mismo alta del inventario, así que valida
 * igual los duplicados de serie, IMEI y línea.
 */
export async function altaYAsignarEquipo(
  empleadoId: number,
  datos: {
    tipo: string;
    codigo: string;
    marca: string;
    modelo: string;
    numero_serie: string;
    fecha_compra: string;
    costo: string;
    notas: string;
    detalles: Record<string, string>;
  }
): Promise<ResultadoAccion> {
  const alta = await guardarEquipo({ ...datos, estado: "DISPONIBLE" });
  if (!alta.ok || !alta.id) return alta;
  return asignarEquipo(empleadoId, alta.id);
}
