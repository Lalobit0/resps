"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { importarDeExcel, serialExcelAISO, type Mapeo } from "../../lib/importar";
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
