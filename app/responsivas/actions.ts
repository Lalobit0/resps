"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { db, getConfig } from "../../lib/db";
import { generarPDF, type ItemPDF } from "../../lib/pdf";
import { llenarPlantilla } from "../../lib/plantilla";
import { fechaLarga, hoyISO } from "../../lib/helpers";
import type { Empleado, Equipo, ItemConEquipo, Responsiva, ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/");
  revalidatePath("/inventario");
  revalidatePath("/responsivas");
  revalidatePath("/empleados");
  revalidatePath("/responsivas/nueva");
}

function siguienteFolio(prefijo: string): string {
  const anio = new Date().getFullYear();
  const r = db
    .prepare("SELECT COUNT(*) AS c FROM responsivas WHERE folio LIKE ?")
    .get(`${prefijo}-${anio}-%`) as { c: number };
  return `${prefijo}-${anio}-${String(r.c + 1).padStart(3, "0")}`;
}

function contenidoPlantilla(clave: string): string {
  const r = db.prepare("SELECT contenido FROM plantillas WHERE clave = ?").get(clave) as { contenido: string } | undefined;
  return r?.contenido ?? "{{tabla_equipos}}";
}

function guardarPdf(folio: string, bytes: Uint8Array): string {
  const relativa = path.join("storage", "responsivas", `${folio}.pdf`);
  fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), relativa), Buffer.from(bytes));
  return relativa;
}

export async function crearResponsiva(datos: {
  empleadoId: number;
  equipoIds: number[];
  entregadoPor: string;
  observaciones: string;
  firma: string;
}): Promise<ResultadoAccion> {
  try {
    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(datos.empleadoId) as Empleado | undefined;
    if (!empleado) return { ok: false, error: "Selecciona un empleado." };
    if (!datos.equipoIds.length) return { ok: false, error: "Selecciona al menos un equipo." };
    if (!datos.firma) return { ok: false, error: "Falta la firma del empleado." };

    const marcas = datos.equipoIds.map(() => "?").join(",");
    const equipos = db.prepare(`SELECT * FROM equipos WHERE id IN (${marcas})`).all(...datos.equipoIds) as Equipo[];
    if (equipos.length !== datos.equipoIds.length || equipos.some((e) => e.estado !== "DISPONIBLE")) {
      return { ok: false, error: "Alguno de los equipos seleccionados ya no está disponible." };
    }

    const folio = siguienteFolio("RESP");
    const fecha = hoyISO();
    const entregadoPor = datos.entregadoPor.trim() || getConfig("entrega_default", "Departamento de TI");

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, empleado_id, fecha, estado, entregado_por, observaciones) VALUES (?,?,?,?,?,?,?)"
        )
        .run(folio, "ASIGNACION", empleado.id, fecha, "VIGENTE", entregadoPor, datos.observaciones.trim() || null);
      const rid = Number(info.lastInsertRowid);
      const insItem = db.prepare("INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion) VALUES (?,?,?)");
      const updEq = db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?");
      for (const e of equipos) {
        insItem.run(rid, e.id, `${e.marca} ${e.modelo}${e.specs ? ` (${e.specs})` : ""}`);
        updEq.run(empleado.id, e.id);
      }
      return rid;
    });
    const id = crear();

    try {
      const cuerpo = llenarPlantilla(contenidoPlantilla("responsiva_asignacion"), {
        fecha: fechaLarga(fecha),
        ciudad: getConfig("ciudad"),
        empresa: getConfig("empresa"),
        nombre_empleado: empleado.nombre,
        numero_empleado: empleado.numero_empleado,
        puesto: empleado.puesto,
        departamento: empleado.departamento,
        observaciones: datos.observaciones.trim() ? `Observaciones: ${datos.observaciones.trim()}` : "",
        folio,
      });

      const items: ItemPDF[] = equipos.map((e) => ({
        codigo: e.codigo,
        categoria: e.categoria,
        descripcion: `${e.marca} ${e.modelo}${e.specs ? ` (${e.specs})` : ""}`,
        serie: e.numero_serie ?? "-",
        condiciones: null,
      }));

      const bytes = await generarPDF({
        folio,
        tipo: "ASIGNACION",
        empresa: getConfig("empresa"),
        cuerpo,
        items,
        firma: datos.firma,
        nombreFirmante: empleado.nombre,
        nombreEntrega: entregadoPor,
      });

      const ruta = guardarPdf(folio, bytes);
      db.prepare("UPDATE responsivas SET pdf_path=? WHERE id=?").run(ruta, id);
    } catch (errorPdf) {
      db.transaction(() => {
        db.prepare("DELETE FROM responsiva_items WHERE responsiva_id=?").run(id);
        db.prepare("DELETE FROM responsivas WHERE id=?").run(id);
        for (const e of equipos) {
          db.prepare("UPDATE equipos SET estado='DISPONIBLE', asignado_a=NULL WHERE id=?").run(e.id);
        }
      })();
      throw errorPdf;
    }

    revalidar();
    return { ok: true, id, folio };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo generar la responsiva. Revisa la consola del servidor." };
  }
}

export async function registrarDevolucion(datos: {
  responsivaId: number;
  condiciones: Record<number, string>;
  recibidoPor: string;
  observaciones: string;
  firma: string;
}): Promise<ResultadoAccion> {
  try {
    const origen = db.prepare("SELECT * FROM responsivas WHERE id = ?").get(datos.responsivaId) as Responsiva | undefined;
    if (!origen || origen.tipo !== "ASIGNACION" || origen.estado !== "VIGENTE") {
      return { ok: false, error: "Esta responsiva no está vigente o no existe." };
    }
    if (!datos.firma) return { ok: false, error: "Falta la firma del empleado." };

    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(origen.empleado_id) as Empleado;
    const items = db
      .prepare(
        `SELECT ri.*, e.codigo, e.categoria, e.numero_serie, e.estado AS estado_equipo
         FROM responsiva_items ri JOIN equipos e ON e.id = ri.equipo_id
         WHERE ri.responsiva_id = ?`
      )
      .all(origen.id) as ItemConEquipo[];
    if (!items.length) return { ok: false, error: "La responsiva no tiene equipos registrados." };

    const folio = siguienteFolio("DEV");
    const fecha = hoyISO();
    const recibidoPor = datos.recibidoPor.trim() || getConfig("entrega_default", "Departamento de TI");

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, empleado_id, fecha, estado, responsiva_origen_id, entregado_por, observaciones) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(folio, "DEVOLUCION", empleado.id, fecha, "CERRADA", origen.id, recibidoPor, datos.observaciones.trim() || null);
      const rid = Number(info.lastInsertRowid);
      const insItem = db.prepare(
        "INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion, condiciones) VALUES (?,?,?,?)"
      );
      const updEq = db.prepare("UPDATE equipos SET estado='DISPONIBLE', asignado_a=NULL WHERE id=?");
      for (const item of items) {
        insItem.run(rid, item.equipo_id, item.descripcion, datos.condiciones[item.equipo_id] ?? "Buen estado");
        updEq.run(item.equipo_id);
      }
      db.prepare("UPDATE responsivas SET estado='CERRADA' WHERE id=?").run(origen.id);
      return rid;
    });
    const id = crear();

    try {
      const cuerpo = llenarPlantilla(contenidoPlantilla("responsiva_devolucion"), {
        fecha: fechaLarga(fecha),
        ciudad: getConfig("ciudad"),
        empresa: getConfig("empresa"),
        nombre_empleado: empleado.nombre,
        numero_empleado: empleado.numero_empleado,
        puesto: empleado.puesto,
        departamento: empleado.departamento,
        observaciones: datos.observaciones.trim() ? `Observaciones: ${datos.observaciones.trim()}` : "",
        folio,
        folio_origen: origen.folio,
      });

      const itemsPdf: ItemPDF[] = items.map((item) => ({
        codigo: item.codigo,
        categoria: item.categoria,
        descripcion: item.descripcion,
        serie: item.numero_serie ?? "-",
        condiciones: datos.condiciones[item.equipo_id] ?? "Buen estado",
      }));

      const bytes = await generarPDF({
        folio,
        tipo: "DEVOLUCION",
        empresa: getConfig("empresa"),
        cuerpo,
        items: itemsPdf,
        firma: datos.firma,
        nombreFirmante: empleado.nombre,
        nombreEntrega: recibidoPor,
      });

      const ruta = guardarPdf(folio, bytes);
      db.prepare("UPDATE responsivas SET pdf_path=? WHERE id=?").run(ruta, id);
    } catch (errorPdf) {
      db.transaction(() => {
        db.prepare("DELETE FROM responsiva_items WHERE responsiva_id=?").run(id);
        db.prepare("DELETE FROM responsivas WHERE id=?").run(id);
        db.prepare("UPDATE responsivas SET estado='VIGENTE' WHERE id=?").run(origen.id);
        for (const item of items) {
          db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?").run(empleado.id, item.equipo_id);
        }
      })();
      throw errorPdf;
    }

    revalidar();
    return { ok: true, id, folio };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo registrar la devolución. Revisa la consola del servidor." };
  }
}
