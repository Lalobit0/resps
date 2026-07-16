"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { db, getConfig } from "../../lib/db";
import { generarCarta, type FilaCarta } from "../../lib/pdf";
import { llenarPlantilla } from "../../lib/plantilla";
import { descripcionEquipo, filasEquipo, filasUsuario, partirPlantilla } from "../../lib/carta";
import { CARTAS, type ClaseCarta, type TipoEquipo } from "../../lib/constants";
import { fechaCorta, fechaLarga, hoyISO } from "../../lib/helpers";
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
  return r?.contenido ?? "{{tabla_equipo}}";
}

function guardarPdf(folio: string, bytes: Uint8Array): string {
  const relativa = path.join("storage", "responsivas", `${folio}.pdf`);
  fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), relativa), Buffer.from(bytes));
  return relativa;
}

const ETIQ_EMPLEADO = "Nombre, Firma y No. de empleado quien recibe";
const ETIQ_COORDINADOR = "Nombre y firma del Coordinador de sistemas";

export async function crearResponsiva(datos: {
  clase: ClaseCarta;
  empleadoId: number;
  equipoId: number | null;
  observaciones: string;
  firma: string;
}): Promise<ResultadoAccion> {
  try {
    const config = CARTAS[datos.clase];
    if (!config) return { ok: false, error: "Selecciona un tipo de carta válido." };

    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(datos.empleadoId) as Empleado | undefined;
    if (!empleado) return { ok: false, error: "Selecciona un empleado." };
    if (!datos.firma) return { ok: false, error: "Falta la firma del empleado." };

    const requiereEquipo = config.tiposEquipo.length > 0;
    let equipo: Equipo | undefined;
    if (requiereEquipo) {
      if (!datos.equipoId) return { ok: false, error: "Selecciona el equipo a asignar." };
      equipo = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.equipoId) as Equipo | undefined;
      if (!equipo || equipo.estado !== "DISPONIBLE") {
        return { ok: false, error: "El equipo seleccionado ya no está disponible." };
      }
      if (!config.tiposEquipo.includes(equipo.tipo as TipoEquipo)) {
        return { ok: false, error: "El equipo no corresponde al tipo de carta seleccionada." };
      }
    }

    const folio = siguienteFolio("RESP");
    const fecha = hoyISO();
    const entregadoPor = getConfig("entrega_default", "Departamento de TI");

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, clase, empleado_id, fecha, estado, entregado_por, observaciones) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(folio, "ASIGNACION", datos.clase, empleado.id, fecha, "VIGENTE", entregadoPor, datos.observaciones.trim() || null);
      const rid = Number(info.lastInsertRowid);
      if (equipo) {
        db.prepare("INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion) VALUES (?,?,?)").run(
          rid,
          equipo.id,
          descripcionEquipo(equipo)
        );
        db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?").run(empleado.id, equipo.id);
      }
      return rid;
    });
    const id = crear();

    try {
      const plantilla = llenarPlantilla(contenidoPlantilla(config.plantilla), {
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
      const { intro, cuerpo } = partirPlantilla(plantilla);

      const bytes = await generarCarta({
        titulo: config.titulo,
        fecha: fechaCorta(fecha),
        folio,
        empresa: getConfig("empresa"),
        direccion: getConfig("direccion"),
        filasUsuario: filasUsuario(empleado),
        intro,
        filasEquipo: equipo ? filasEquipo(datos.clase, equipo) : [],
        cuerpo,
        firma: datos.firma,
        etiquetaIzq: ETIQ_EMPLEADO,
        etiquetaDer: ETIQ_COORDINADOR,
        sustituye: true,
      });

      const ruta = guardarPdf(folio, bytes);
      db.prepare("UPDATE responsivas SET pdf_path=? WHERE id=?").run(ruta, id);
    } catch (errorPdf) {
      db.transaction(() => {
        db.prepare("DELETE FROM responsiva_items WHERE responsiva_id=?").run(id);
        db.prepare("DELETE FROM responsivas WHERE id=?").run(id);
        if (equipo) db.prepare("UPDATE equipos SET estado='DISPONIBLE', asignado_a=NULL WHERE id=?").run(equipo.id);
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
    const recibidoPor = getConfig("entrega_default", "Departamento de TI");

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, clase, empleado_id, fecha, estado, responsiva_origen_id, entregado_por, observaciones) VALUES (?,?,?,?,?,?,?,?,?)"
        )
        .run(
          folio,
          "DEVOLUCION",
          origen.clase,
          empleado.id,
          fecha,
          "CERRADA",
          origen.id,
          recibidoPor,
          datos.observaciones.trim() || null
        );
      const rid = Number(info.lastInsertRowid);
      const insItem = db.prepare(
        "INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion, condiciones) VALUES (?,?,?,?)"
      );
      for (const item of items) {
        insItem.run(rid, item.equipo_id, item.descripcion, datos.condiciones[item.equipo_id] ?? "Buen estado");
        db.prepare("UPDATE equipos SET estado='DISPONIBLE', asignado_a=NULL WHERE id=?").run(item.equipo_id);
      }
      db.prepare("UPDATE responsivas SET estado='CERRADA' WHERE id=?").run(origen.id);
      return rid;
    });
    const id = crear();

    try {
      const plantilla = llenarPlantilla(contenidoPlantilla("responsiva_devolucion"), {
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
      const { intro, cuerpo } = partirPlantilla(plantilla);

      const filasEq: FilaCarta[] = [];
      for (const item of items) {
        filasEq.push({ etiqueta: "Código", valor: item.codigo });
        filasEq.push({ etiqueta: "Equipo", valor: item.descripcion });
        filasEq.push({ etiqueta: "Serie", valor: item.numero_serie ?? "-" });
        filasEq.push({ etiqueta: "Condición al devolver", valor: datos.condiciones[item.equipo_id] ?? "Buen estado" });
      }

      const bytes = await generarCarta({
        titulo: "DE DEVOLUCIÓN DE EQUIPO",
        fecha: fechaCorta(fecha),
        folio,
        empresa: getConfig("empresa"),
        direccion: getConfig("direccion"),
        filasUsuario: filasUsuario(empleado),
        intro,
        filasEquipo: filasEq,
        cuerpo,
        firma: datos.firma,
        etiquetaIzq: "Nombre, Firma y No. de empleado que entrega",
        etiquetaDer: ETIQ_COORDINADOR,
        sustituye: false,
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
