"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { importarDeExcel, serialExcelAISO, type Mapeo } from "../../lib/importar";
import { guardarEquipo } from "../inventario/actions";
import { anotarMovimiento } from "../../lib/historial";
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

    // El equipo se queda con el área de quien lo recibe: cuando esa persona se
    // vaya, el aparato sigue perteneciendo a esa área y ahí se reasigna.
    const area = db.prepare("SELECT departamento, area FROM empleados WHERE id = ?").get(empleadoId) as
      | { departamento: string | null; area: string | null }
      | undefined;
    db.prepare("UPDATE equipos SET estado = 'ASIGNADO', asignado_a = ?, departamento = ?, area = ? WHERE id = ?").run(
      empleadoId,
      area?.departamento ?? null,
      area?.area ?? null,
      equipoId
    );
    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "ASIGNAR_EQUIPO",
      `${eq.codigo} (${eq.marca} ${eq.modelo}) se asignó a ${emp.numero_empleado} ${emp.nombre}`,
      JSON.stringify({ equipo: eq.codigo, empleado: emp.numero_empleado, estado_anterior: eq.estado })
    );
    anotarMovimiento({ equipoId, accion: "ASIGNADO", empleadoId, detalle: `Entregado a ${emp.numero_empleado} ${emp.nombre}` });

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
 * Guarda el equipo y se lo entrega al empleado en un solo paso.
 *
 * Sin `id` es un alta: el equipo no estaba en el inventario. Con `id` es una
 * corrección: se arreglan los datos del equipo que ya estaba y se asigna. En
 * los dos casos pasa por el mismo guardado del inventario, así que valida
 * igual los duplicados de serie, IMEI y línea.
 */
export async function guardarYAsignarEquipo(
  empleadoId: number,
  datos: {
    id?: number;
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
  const guardado = await guardarEquipo({ ...datos, estado: "DISPONIBLE" });
  if (!guardado.ok || !guardado.id) return guardado;
  return asignarEquipo(empleadoId, guardado.id);
}

/**
 * Le quita el equipo al empleado sin borrarlo: vuelve al inventario como
 * disponible. Es lo que se usa cuando la asignación estaba mal.
 */
export async function quitarEquipoAEmpleado(equipoId: number): Promise<ResultadoAccion> {
  try {
    const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoId) as Equipo | undefined;
    if (!eq) return { ok: false, error: "El equipo ya no existe." };

    const vigente = db
      .prepare(
        `SELECT r.folio FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
         WHERE ri.equipo_id = ? AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE' LIMIT 1`
      )
      .get(equipoId) as { folio: string } | undefined;
    if (vigente) {
      return {
        ok: false,
        error: `Este equipo tiene la responsiva ${vigente.folio} vigente. Registra su devolución para poder quitárselo.`,
      };
    }

    // Se libera, pero el área NO se borra: el equipo sigue siendo de su área.
    db.prepare("UPDATE equipos SET estado = 'DISPONIBLE', asignado_a = NULL WHERE id = ?").run(equipoId);
    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "QUITAR_EQUIPO",
      `${eq.codigo} (${eq.marca} ${eq.modelo}) se quitó del empleado y volvió al inventario como disponible`,
      JSON.stringify({ equipo: eq.codigo, empleado_anterior: eq.asignado_a })
    );
    anotarMovimiento({
      equipoId,
      accion: "LIBERADO",
      empleadoId: eq.asignado_a,
      detalle: "Volvió al inventario como disponible",
    });

    revalidar();
    revalidatePath("/inventario");
    if (eq.asignado_a) revalidatePath(`/empleados/${eq.asignado_a}`);
    return { ok: true, mensaje: `${eq.codigo} volvió al inventario como disponible.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo quitar el equipo." };
  }
}

// ---------- Baja del empleado ----------

export type EquipoEnBaja = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  area: string | null;
  folios: string | null;
};

export type ResumenBaja = {
  empleado: string;
  departamento: string | null;
  area: string | null;
  equipos: EquipoEnBaja[];
  /** Cartas de asignación vigentes que quedarán cerradas. */
  cartas: { id: number; folio: string; clase: string; equipos: string | null }[];
};

/** Lo que hay que resolver antes de dar de baja: sus equipos y sus cartas. */
export async function resumenBajaEmpleado(id: number): Promise<ResumenBaja | null> {
  const emp = db.prepare("SELECT numero_empleado, nombre, departamento, area FROM empleados WHERE id = ?").get(id) as
    | { numero_empleado: string; nombre: string; departamento: string | null; area: string | null }
    | undefined;
  if (!emp) return null;

  const equipos = db
    .prepare(
      `SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, COALESCE(e.area, e.departamento) AS area,
              (SELECT GROUP_CONCAT(r.folio, ', ') FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                WHERE ri.equipo_id = e.id AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE') AS folios
       FROM equipos e WHERE e.asignado_a = ? ORDER BY e.tipo, e.codigo`
    )
    .all(id) as EquipoEnBaja[];

  const cartas = db
    .prepare(
      `SELECT r.id, r.folio, r.clase,
        (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r
       WHERE r.empleado_id = ? AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'
       ORDER BY r.id DESC`
    )
    .all(id) as ResumenBaja["cartas"];

  return {
    empleado: `${emp.numero_empleado} ${emp.nombre}`,
    departamento: emp.departamento,
    area: emp.area,
    equipos,
    cartas,
  };
}

/**
 * Da de baja al empleado y devuelve sus equipos al inventario.
 *
 * Es lo que pasa cuando alguien deja la empresa: se recibe lo que traía, el
 * aparato queda DISPONIBLE para volver a entregarlo —conservando el área a la
 * que pertenecía, que no se va con la persona— y las cartas de esos equipos se
 * cierran. Lo que no haya entregado se queda a su nombre y se avisa, para que
 * quede constancia de que falta.
 */
export async function darDeBajaEmpleado(datos: {
  id: number;
  fecha: string;
  motivo: string;
  /** Equipos que sí entregó. Los demás siguen a su nombre. */
  recibidos: number[];
}): Promise<ResultadoAccion> {
  try {
    const emp = db.prepare("SELECT * FROM empleados WHERE id = ?").get(datos.id) as
      | { id: number; numero_empleado: string; nombre: string; departamento: string | null; area: string | null; activo: number }
      | undefined;
    if (!emp) return { ok: false, error: "El empleado ya no existe." };

    const fecha = (datos.fecha || "").trim() || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha de baja no es válida." };

    const asignados = db.prepare("SELECT * FROM equipos WHERE asignado_a = ?").all(datos.id) as Equipo[];
    const recibidos = new Set(datos.recibidos ?? []);
    const devueltos = asignados.filter((e) => recibidos.has(e.id));
    const pendientes = asignados.filter((e) => !recibidos.has(e.id));
    const quien = `${emp.numero_empleado} ${emp.nombre}`;

    const aplicar = db.transaction(() => {
      for (const eq of devueltos) {
        // El área se queda con el equipo: sigue siendo de su departamento.
        db.prepare(
          `UPDATE equipos SET estado = 'DISPONIBLE', asignado_a = NULL,
             departamento = COALESCE(departamento, ?), area = COALESCE(area, ?)
           WHERE id = ?`
        ).run(emp.departamento ?? null, emp.area ?? null, eq.id);

        // Su carta de asignación deja de estar vigente.
        db.prepare(
          `UPDATE responsivas SET estado = 'CERRADA'
           WHERE tipo = 'ASIGNACION' AND estado = 'VIGENTE' AND empleado_id = ?
             AND id IN (SELECT responsiva_id FROM responsiva_items WHERE equipo_id = ?)`
        ).run(datos.id, eq.id);
      }

      db.prepare("UPDATE empleados SET activo = 0, fecha_baja = ?, motivo_baja = ? WHERE id = ?").run(
        fecha,
        datos.motivo.trim() || null,
        datos.id
      );
    });
    aplicar();

    // El histórico se anota fuera de la transacción: que falle una nota no
    // debe deshacer la baja.
    for (const eq of devueltos) {
      anotarMovimiento({
        equipoId: eq.id,
        accion: "BAJA_EMPLEADO",
        empleadoId: datos.id,
        departamento: emp.departamento,
        area: emp.area,
        fecha,
        detalle: `${quien} dejó la empresa y entregó el equipo. Queda disponible en ${emp.area || emp.departamento || "su área"}.`,
      });
    }

    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "BAJA_EMPLEADO",
      `${quien} se dio de baja el ${fecha}${datos.motivo.trim() ? ` (${datos.motivo.trim()})` : ""}. ` +
        `Devolvió ${devueltos.length} equipo(s)${pendientes.length ? `; quedan ${pendientes.length} a su nombre` : ""}.`,
      JSON.stringify({
        empleado: quien,
        fecha,
        motivo: datos.motivo,
        devueltos: devueltos.map((e) => e.codigo),
        pendientes: pendientes.map((e) => e.codigo),
      })
    );

    revalidar();
    revalidatePath("/inventario");
    revalidatePath(`/empleados/${datos.id}`);

    const donde = emp.area || emp.departamento;
    return {
      ok: true,
      mensaje:
        `${quien} quedó dado de baja el ${fecha}. ` +
        (devueltos.length
          ? `${devueltos.length} equipo(s) volvieron al inventario como disponibles${donde ? ` en ${donde}` : ""}: ${devueltos
              .map((e) => e.codigo)
              .join(", ")}. `
          : "No traía equipos que recibir. ") +
        (pendientes.length
          ? `⚠️ Siguen a su nombre ${pendientes.length}: ${pendientes.map((e) => e.codigo).join(", ")}.`
          : ""),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: `No se pudo dar de baja: ${e instanceof Error ? e.message : String(e)}` };
  }
}
