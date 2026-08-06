"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { db, getConfig, STORAGE_DIR, STORAGE_ELIMINADAS } from "../../lib/db";
import { generarCarta, type FilaCarta } from "../../lib/pdf";
import { llenarPlantilla } from "../../lib/plantilla";
import { descripcionEquipo, filasEquipo, filasUsuario, partirPlantilla } from "../../lib/carta";
import { CAMPOS_DETALLE, CARTAS, ETIQ_EMPLEADO, ETIQ_RH, ETIQ_SISTEMAS, TIPO_DEFAULTS, TIPOS_EQUIPO, rolAutoridad, type ClaseCarta, type TipoEquipo } from "../../lib/constants";
import { fechaCorta, fechaLarga, hoyISO, montoEnLetra } from "../../lib/helpers";
import type { Empleado, Equipo, ItemConEquipo, Responsiva, ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/");
  revalidatePath("/inventario");
  revalidatePath("/responsivas");
  revalidatePath("/empleados");
  revalidatePath("/responsivas/nueva");
  revalidatePath("/bitacora");
  revalidatePath("/lineas");
}

function registrarBitacora(accion: string, descripcion: string, snapshot: unknown, revertible: boolean) {
  db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,?)").run(
    accion,
    descripcion,
    snapshot ? JSON.stringify(snapshot) : null,
    revertible ? 1 : 0
  );
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


/** Datos de quien firma por la empresa; sin nombre se asume el titular. */
export type Firmante = { nombre?: string | null; puesto?: string | null; ausencia?: boolean };

/**
 * Texto bajo la línea de firma de la empresa. Si firmó alguien que no es el
 * titular, se imprime la leyenda "por ausencia" con su nombre y puesto.
 */
function etiquetaAutoridad(clase: ClaseCarta, firmante: Firmante | null): string {
  const esVale = !!CARTAS[clase].esVale;
  const base = esVale ? getConfig("firma_rh", ETIQ_RH) : getConfig("firma_sistemas", ETIQ_SISTEMAS);
  const nombre = firmante?.nombre?.trim();
  if (!nombre) return base;

  if (firmante?.ausencia) {
    // Aquí el puesto sí aporta: identifica a quien firma en lugar del titular.
    const quien = firmante?.puesto?.trim() ? `${nombre} - ${firmante.puesto.trim()}` : nombre;
    return `${base} — Por ausencia firma: ${quien}`;
  }
  // El titular ya lleva su cargo en la etiqueta base: basta el nombre.
  return `${base}: ${nombre}`;
}

/**
 * Arma el PDF de una carta de asignación con los datos guardados. Se usa al
 * crearla y al regenerarla cuando la autoridad firma digitalmente después.
 */
async function bytesAsignacion(datos: {
  clase: ClaseCarta;
  folio: string;
  fecha: string;
  observaciones: string | null;
  concepto: string | null;
  monto: number | null;
  firmaEmpleado: string | null;
  firmaAutoridad: string | null;
  firmante: Firmante | null;
  empleado: Empleado;
  equipo: Equipo | undefined;
}): Promise<Uint8Array> {
  const config = CARTAS[datos.clase];
  const obs = (datos.observaciones ?? "").trim();
  const plantilla = llenarPlantilla(contenidoPlantilla(config.plantilla), {
    fecha: fechaLarga(datos.fecha),
    ciudad: getConfig("ciudad"),
    empresa: getConfig("empresa"),
    nombre_empleado: datos.empleado.nombre,
    numero_empleado: datos.empleado.numero_empleado,
    puesto: datos.empleado.puesto,
    departamento: datos.empleado.departamento,
    observaciones: obs ? `Observaciones: ${obs}` : "",
    folio: datos.folio,
    concepto: datos.concepto?.trim() || "",
    monto: datos.monto != null ? montoEnLetra(datos.monto) : "",
  });
  const { intro, cuerpo } = partirPlantilla(plantilla);

  return generarCarta({
    encabezado: config.encabezado,
    titulo: config.titulo,
    fecha: fechaCorta(datos.fecha),
    folio: datos.folio,
    empresa: getConfig("empresa"),
    direccion: getConfig("direccion"),
    filasUsuario: config.esVale ? [] : filasUsuario(datos.empleado),
    intro,
    filasEquipo: datos.equipo ? filasEquipo(datos.clase, datos.equipo) : [],
    cuerpo,
    firma: datos.firmaEmpleado,
    firmaDer: datos.firmaAutoridad,
    etiquetaIzq: config.esVale ? "EMPLEADO — Firma de conformidad" : getConfig("firma_empleado", ETIQ_EMPLEADO),
    etiquetaDer: etiquetaAutoridad(datos.clase, datos.firmante),
    sustituye: !config.esVale && datos.clase !== "WIFI",
  });
}

export async function crearResponsiva(datos: {
  clase: ClaseCarta;
  empleadoId: number;
  equipoId: number | null;
  observaciones: string;
  /** Firma digital del empleado. Vacía = la carta se imprime y se firma en papel. */
  firma: string;
  /** Fecha de la carta (yyyy-mm-dd). Vacía = hoy. */
  fecha?: string;
  firmaAutoridad?: string | null;
  firmanteAutoridad?: Firmante | null;
  concepto?: string;
  monto?: string;
}): Promise<ResultadoAccion> {
  try {
    const config = CARTAS[datos.clase];
    if (!config) return { ok: false, error: "Selecciona un tipo de carta válido." };

    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(datos.empleadoId) as Empleado | undefined;
    if (!empleado) return { ok: false, error: "Selecciona un empleado." };

    let montoNum: number | null = null;
    if (config.esVale) {
      if (!datos.concepto?.trim()) return { ok: false, error: "Indica el concepto del descuento." };
      const m = Number(datos.monto);
      if (!datos.monto || Number.isNaN(m) || m <= 0) return { ok: false, error: "Indica un valor de reposición válido." };
      montoNum = m;
    }

    const requiereEquipo = config.tiposEquipo.length > 0;
    let equipo: Equipo | undefined;
    if (requiereEquipo) {
      if (!datos.equipoId) return { ok: false, error: "Selecciona el equipo a asignar." };
      equipo = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.equipoId) as Equipo | undefined;
      if (!equipo) return { ok: false, error: "El equipo seleccionado ya no existe." };
      // Se admite un equipo ya entregado a ESE mismo empleado: es el caso de
      // regularizar la carta que le faltaba. Con otro empleado, no.
      const regularizando = equipo.estado === "ASIGNADO" && equipo.asignado_a === empleado.id;
      if (equipo.estado !== "DISPONIBLE" && !regularizando) {
        return { ok: false, error: "El equipo seleccionado ya no está disponible." };
      }
      if (!config.tiposEquipo.includes(equipo.tipo as TipoEquipo)) {
        return { ok: false, error: "El equipo no corresponde al tipo de carta seleccionada." };
      }
    }

    const folio = siguienteFolio(config.esVale ? "VALE" : "RESP");
    // La fecha se puede ajustar (p. ej. a la de alta del empleado), pero nunca
    // adelante: una carta con fecha futura no la firmó nadie todavía.
    const hoy = hoyISO();
    const pedida = (datos.fecha ?? "").trim();
    if (pedida && !/^\d{4}-\d{2}-\d{2}$/.test(pedida)) return { ok: false, error: "La fecha de la carta no es válida." };
    if (pedida && pedida > hoy) return { ok: false, error: "La fecha de la carta no puede ser posterior a hoy." };
    const fecha = pedida || hoy;
    const entregadoPor = getConfig("entrega_default", "Departamento de TI");
    // Sin firma de la empresa no hay firmante que registrar.
    const firmante: Firmante | null = datos.firmaAutoridad ? datos.firmanteAutoridad ?? null : null;

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, clase, empleado_id, fecha, estado, entregado_por, observaciones, firma_empleado, firma_autoridad, firma_autoridad_nombre, firma_autoridad_puesto, firma_autoridad_ausencia, concepto, monto) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          folio,
          "ASIGNACION",
          datos.clase,
          empleado.id,
          fecha,
          "VIGENTE",
          entregadoPor,
          datos.observaciones.trim() || null,
          datos.firma || null,
          datos.firmaAutoridad || null,
          firmante?.nombre?.trim() || null,
          firmante?.puesto?.trim() || null,
          firmante?.ausencia ? 1 : 0,
          config.esVale ? datos.concepto?.trim() || null : null,
          montoNum
        );
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
      const bytes = await bytesAsignacion({
        clase: datos.clase,
        folio,
        fecha,
        observaciones: datos.observaciones,
        concepto: config.esVale ? datos.concepto?.trim() || null : null,
        monto: montoNum,
        firmaEmpleado: datos.firma || null,
        firmaAutoridad: datos.firmaAutoridad || null,
        firmante,
        empleado,
        equipo,
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

/**
 * Firma digital tardía del jefe de sistemas / RH: guarda la firma y vuelve a
 * generar el PDF con las dos firmas, conservando el mismo folio y archivo.
 */
export async function firmarAutoridad(
  responsivaId: number,
  firma: string,
  firmante?: Firmante | null
): Promise<ResultadoAccion> {
  try {
    if (!firma) return { ok: false, error: "Falta la firma: dibújala, elige una guardada o carga un archivo." };
    if (!/^data:image\/(png|jpe?g);base64,/i.test(firma)) return { ok: false, error: "La firma debe ser PNG o JPG." };

    const r = db.prepare("SELECT * FROM responsivas WHERE id = ?").get(responsivaId) as Responsiva | undefined;
    if (!r) return { ok: false, error: "La responsiva ya no existe." };
    if (r.estado === "ELIMINADA") return { ok: false, error: "Esta responsiva está en la papelera." };
    if (r.tipo !== "ASIGNACION") return { ok: false, error: "Solo se pueden firmar las cartas de asignación." };
    if (r.origen === "CARGADA") {
      return { ok: false, error: "Esta responsiva es un escaneo cargado; no se puede firmar digitalmente." };
    }
    if (r.firma_autoridad) return { ok: false, error: "Esta responsiva ya está firmada." };

    const config = CARTAS[r.clase as ClaseCarta];
    if (!config) return { ok: false, error: "La responsiva tiene un tipo de carta desconocido." };

    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(r.empleado_id) as Empleado | undefined;
    if (!empleado) return { ok: false, error: "El empleado de la responsiva ya no existe." };

    const item = db.prepare("SELECT equipo_id FROM responsiva_items WHERE responsiva_id = ?").get(r.id) as
      | { equipo_id: number }
      | undefined;
    const equipo = item
      ? (db.prepare("SELECT * FROM equipos WHERE id = ?").get(item.equipo_id) as Equipo | undefined)
      : undefined;

    const bytes = await bytesAsignacion({
      clase: r.clase as ClaseCarta,
      folio: r.folio,
      fecha: r.fecha,
      observaciones: r.observaciones,
      concepto: r.concepto,
      monto: r.monto,
      firmaEmpleado: r.firma_empleado,
      firmaAutoridad: firma,
      firmante: firmante ?? null,
      empleado,
      equipo,
    });

    const ruta = guardarPdf(r.folio, bytes);
    db.prepare(
      "UPDATE responsivas SET firma_autoridad=?, firma_autoridad_nombre=?, firma_autoridad_puesto=?, firma_autoridad_ausencia=?, pdf_path=? WHERE id=?"
    ).run(
      firma,
      firmante?.nombre?.trim() || null,
      firmante?.puesto?.trim() || null,
      firmante?.ausencia ? 1 : 0,
      ruta,
      r.id
    );
    const quien = firmante?.nombre?.trim()
      ? `${firmante.nombre.trim()}${firmante.ausencia ? ` (por ausencia del ${rolAutoridad(r.clase).toLowerCase()})` : ""}`
      : rolAutoridad(r.clase);
    registrarBitacora("FIRMA_AUTORIDAD", `${quien} firmó la responsiva ${r.folio} de ${empleado.nombre}`, null, false);

    revalidar();
    return { ok: true, id: r.id, folio: r.folio };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo firmar la responsiva. Revisa la consola del servidor." };
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
        etiquetaDer: getConfig("firma_sistemas", ETIQ_SISTEMAS),
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

const EXT_PERMITIDAS = ["pdf", "jpg", "jpeg", "png"];

function codigoEquipo(prefijo: string): string {
  let n = (db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE codigo LIKE ?").get(`SP-${prefijo}-%`) as { c: number }).c + 1;
  let codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  while (db.prepare("SELECT 1 FROM equipos WHERE codigo = ?").get(codigo)) {
    n += 1;
    codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  }
  return codigo;
}

type NuevoEquipo = { tipo?: string; marca?: string; modelo?: string; numero_serie?: string; detalles?: Record<string, string> };

export async function cargarResponsivaFirmada(formData: FormData): Promise<ResultadoAccion> {
  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return { ok: false, error: "Sube el archivo escaneado de la responsiva (PDF o foto)." };
    }
    const empleadoId = Number(formData.get("empleadoId"));
    const clase = String(formData.get("clase") || "COMPUTO");
    const modo = String(formData.get("modo") || "existente");
    const folioManual = String(formData.get("folio") || "").trim();
    const fechaManual = String(formData.get("fecha") || "").trim();
    const observaciones = String(formData.get("observaciones") || "").trim();

    let equipoIds: number[] = [];
    try {
      const raw = JSON.parse(String(formData.get("equipoIds") || "[]"));
      if (Array.isArray(raw)) equipoIds = raw.map(Number).filter((n) => Number.isFinite(n));
    } catch {
      equipoIds = [];
    }
    let nuevoEquipo: NuevoEquipo | null = null;
    try {
      nuevoEquipo = JSON.parse(String(formData.get("nuevoEquipo") || "null")) as NuevoEquipo | null;
    } catch {
      nuevoEquipo = null;
    }

    const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(empleadoId) as Empleado | undefined;
    if (!empleado) return { ok: false, error: "Selecciona un empleado." };

    const nombreArchivo = archivo.name || "responsiva.pdf";
    const ext = (nombreArchivo.split(".").pop() || "pdf").toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) return { ok: false, error: "El archivo debe ser PDF, JPG o PNG." };

    // Modo "existente": valida equipos disponibles
    let equipos: Equipo[] = [];
    if (modo === "existente" && equipoIds.length) {
      const marcas = equipoIds.map(() => "?").join(",");
      equipos = db.prepare(`SELECT * FROM equipos WHERE id IN (${marcas})`).all(...equipoIds) as Equipo[];
      if (equipos.length !== equipoIds.length || equipos.some((e) => e.estado !== "DISPONIBLE")) {
        return { ok: false, error: "Alguno de los equipos seleccionados ya no está disponible." };
      }
    }

    // Modo "nuevo": prepara el equipo a crear
    let crearEquipo: { tipo: TipoEquipo; codigo: string; marca: string; modelo: string; serie: string; detalles: string | null; desc: string } | null = null;
    if (modo === "nuevo" && nuevoEquipo) {
      const marca = (nuevoEquipo.marca || "").trim();
      const modelo = (nuevoEquipo.modelo || "").trim();
      const serie = (nuevoEquipo.numero_serie || "").trim();
      if (marca || modelo || serie) {
        const tipo = (TIPOS_EQUIPO as readonly string[]).includes(nuevoEquipo.tipo || "")
          ? (nuevoEquipo.tipo as TipoEquipo)
          : "OTRO";
        const claves = new Set(CAMPOS_DETALLE[tipo].map((c) => c.clave));
        const det: Record<string, string> = {};
        for (const [k, v] of Object.entries(nuevoEquipo.detalles || {})) {
          if (claves.has(k) && v && String(v).trim()) det[k] = String(v).trim();
        }
        crearEquipo = {
          tipo,
          codigo: codigoEquipo(TIPO_DEFAULTS[tipo].prefijo),
          marca,
          modelo,
          serie,
          detalles: Object.keys(det).length ? JSON.stringify(det) : null,
          desc: `${marca} ${modelo}`.trim() || serie || "Equipo",
        };
      }
    }

    const folio = folioManual || siguienteFolio("RESP");
    if (db.prepare("SELECT 1 FROM responsivas WHERE folio = ?").get(folio)) {
      return { ok: false, error: `Ya existe una responsiva con el folio ${folio}.` };
    }
    const fecha = fechaManual || hoyISO();

    const buf = Buffer.from(await archivo.arrayBuffer());
    const relativa = path.join("storage", "responsivas", `${folio}.${ext}`);
    fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), relativa), buf);

    const crear = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO responsivas (folio, tipo, clase, origen, empleado_id, fecha, estado, observaciones, pdf_path) VALUES (?,?,?,?,?,?,?,?,?)"
        )
        .run(folio, "ASIGNACION", clase, "CARGADA", empleado.id, fecha, "VIGENTE", observaciones || null, relativa);
      const rid = Number(info.lastInsertRowid);
      const insItem = db.prepare("INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion) VALUES (?,?,?)");
      const updEq = db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?");

      if (crearEquipo) {
        const infoEq = db
          .prepare(
            "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, detalles, estado, asignado_a) VALUES (?,?,?,?,?,?,?,?,?)"
          )
          .run(
            crearEquipo.codigo,
            crearEquipo.tipo,
            TIPO_DEFAULTS[crearEquipo.tipo].categoria,
            crearEquipo.marca,
            crearEquipo.modelo,
            crearEquipo.serie || null,
            crearEquipo.detalles,
            "ASIGNADO",
            empleado.id
          );
        insItem.run(rid, Number(infoEq.lastInsertRowid), crearEquipo.desc);
      } else {
        for (const e of equipos) {
          insItem.run(rid, e.id, descripcionEquipo(e));
          updEq.run(empleado.id, e.id);
        }
      }
      return rid;
    });
    const id = crear();

    revalidar();
    return { ok: true, id, folio };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cargar la responsiva. Revisa la consola del servidor." };
  }
}

// ---------- Eliminar responsiva (papelera + bitácora + revertir) ----------

function rutaAbs(rel: string): string {
  return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
}

/** Mueve el PDF entre carpetas (responsivas <-> responsivas_eliminadas). Devuelve la nueva ruta relativa. */
function moverPdf(relActual: string, haciaEliminadas: boolean): string {
  const abs = rutaAbs(relActual);
  const base = path.basename(abs);
  const destDir = haciaEliminadas ? STORAGE_ELIMINADAS : STORAGE_DIR;
  fs.mkdirSync(destDir, { recursive: true });
  const destAbs = path.join(destDir, base);
  if (fs.existsSync(abs) && abs !== destAbs) fs.renameSync(abs, destAbs);
  return path.relative(process.cwd(), destAbs);
}

type SnapEquipo =
  | { modo: "BORRADO"; equipo: Equipo }
  | { modo: "LIBERADO"; equipoId: number; estadoPrev: string; asignadoPrev: number | null };

export async function eliminarResponsiva(id: number): Promise<ResultadoAccion> {
  try {
    const r = db.prepare("SELECT * FROM responsivas WHERE id = ?").get(id) as Responsiva | undefined;
    if (!r) return { ok: false, error: "La responsiva ya no existe." };
    if (r.estado === "ELIMINADA") return { ok: false, error: "Esta responsiva ya está en la papelera." };

    const empleado = db.prepare("SELECT nombre FROM empleados WHERE id = ?").get(r.empleado_id) as { nombre: string } | undefined;
    const items = db.prepare("SELECT * FROM responsiva_items WHERE responsiva_id = ?").all(id) as { equipo_id: number }[];

    const snapEquipos: SnapEquipo[] = [];
    let pdfNuevo: string | null = r.pdf_path;

    const tx = db.transaction(() => {
      // Solo las asignaciones controlan el inventario; una devolución no.
      if (r.tipo === "ASIGNACION") {
        for (const it of items) {
          const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(it.equipo_id) as Equipo | undefined;
          if (!eq) continue;
          // ¿Otro documento vigente usa este equipo?
          const otras = db
            .prepare(
              `SELECT COUNT(*) AS c FROM responsiva_items ri JOIN responsivas r2 ON r2.id = ri.responsiva_id
               WHERE ri.equipo_id = ? AND ri.responsiva_id != ? AND r2.estado != 'ELIMINADA'`
            )
            .get(it.equipo_id, id) as { c: number };
          if (otras.c === 0) {
            // Nadie más lo usa: se retira del inventario (guardando copia para revertir).
            snapEquipos.push({ modo: "BORRADO", equipo: eq });
            db.prepare("DELETE FROM mantenimientos WHERE equipo_id = ?").run(eq.id);
            db.prepare("DELETE FROM equipos WHERE id = ?").run(eq.id);
          } else {
            // Otro documento lo usa: solo se libera si estaba asignado a este empleado.
            snapEquipos.push({ modo: "LIBERADO", equipoId: eq.id, estadoPrev: eq.estado, asignadoPrev: eq.asignado_a });
            if (eq.asignado_a === r.empleado_id) {
              db.prepare("UPDATE equipos SET estado='DISPONIBLE', asignado_a=NULL WHERE id=?").run(eq.id);
            }
          }
        }
      }

      if (r.pdf_path) pdfNuevo = moverPdf(r.pdf_path, true);
      db.prepare("UPDATE responsivas SET estado='ELIMINADA', pdf_path=? WHERE id=?").run(pdfNuevo, id);

      registrarBitacora(
        "ELIMINAR_RESPONSIVA",
        `Se eliminó la responsiva ${r.folio}${empleado ? ` de ${empleado.nombre}` : ""}`,
        { responsivaId: id, folio: r.folio, estadoPrev: r.estado, pdfAntes: r.pdf_path, pdfDespues: pdfNuevo, equipos: snapEquipos },
        true
      );
    });
    tx();

    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar la responsiva." };
  }
}

export async function revertirBitacora(bitacoraId: number): Promise<ResultadoAccion> {
  try {
    const b = db.prepare("SELECT * FROM bitacora WHERE id = ?").get(bitacoraId) as
      | { id: number; accion: string; snapshot: string | null; revertible: number; revertida: number }
      | undefined;
    if (!b) return { ok: false, error: "El movimiento ya no existe." };
    if (!b.revertible || b.revertida) return { ok: false, error: "Este movimiento no se puede revertir." };
    if (b.accion !== "ELIMINAR_RESPONSIVA" || !b.snapshot) return { ok: false, error: "Acción no reversible." };

    const snap = JSON.parse(b.snapshot) as {
      responsivaId: number;
      folio: string;
      estadoPrev: string;
      pdfAntes: string | null;
      pdfDespues: string | null;
      equipos: SnapEquipo[];
    };

    const r = db.prepare("SELECT * FROM responsivas WHERE id = ?").get(snap.responsivaId) as Responsiva | undefined;
    if (!r) return { ok: false, error: "La responsiva original ya no existe." };

    const tx = db.transaction(() => {
      for (const s of snap.equipos) {
        if (s.modo === "BORRADO") {
          const e = s.equipo;
          // Se vuelve a insertar con el MISMO id para conservar los vínculos.
          const existe = db.prepare("SELECT 1 FROM equipos WHERE id = ?").get(e.id);
          if (!existe) {
            db.prepare(
              `INSERT INTO equipos (id, codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, fecha_compra, costo, estado, asignado_a, notas, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).run(
              e.id, e.codigo, e.tipo, e.categoria, e.marca, e.modelo, e.numero_serie, e.specs, e.detalles,
              e.fecha_compra, e.costo, e.estado, e.asignado_a, e.notas, e.created_at
            );
          }
        } else {
          db.prepare("UPDATE equipos SET estado=?, asignado_a=? WHERE id=?").run(s.estadoPrev, s.asignadoPrev, s.equipoId);
        }
      }

      let pdfFinal: string | null = r.pdf_path;
      if (snap.pdfDespues) pdfFinal = moverPdf(snap.pdfDespues, false);
      db.prepare("UPDATE responsivas SET estado=?, pdf_path=? WHERE id=?").run(snap.estadoPrev || "VIGENTE", pdfFinal, snap.responsivaId);

      db.prepare("UPDATE bitacora SET revertida=1 WHERE id=?").run(b.id);
      registrarBitacora("REVERTIR_ELIMINACION", `Se restauró la responsiva ${snap.folio}`, null, false);
    });
    tx();

    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo revertir el movimiento." };
  }
}

/**
 * Sube el escaneo de una responsiva ya firmada en papel.
 *
 * La carta se genera en el sistema, se imprime, se firma y aquí se guarda el
 * documento firmado. El PDF original se conserva: el escaneo se guarda aparte
 * y es el que se muestra a partir de ese momento.
 */
export async function subirResponsivaFirmada(responsivaId: number, formData: FormData): Promise<ResultadoAccion> {
  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return { ok: false, error: "Sube el archivo escaneado o la foto de la responsiva firmada." };
    }
    const r = db.prepare("SELECT id, folio, estado, pdf_firmado FROM responsivas WHERE id = ?").get(responsivaId) as
      | { id: number; folio: string; estado: string; pdf_firmado: string | null }
      | undefined;
    if (!r) return { ok: false, error: "La responsiva ya no existe." };
    if (r.estado === "ELIMINADA") return { ok: false, error: "Esa responsiva está eliminada." };

    const ext = (archivo.name.split(".").pop() || "pdf").toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) return { ok: false, error: "El archivo debe ser PDF, JPG o PNG." };

    const relativa = path.join("storage", "responsivas", `${r.folio}-firmada.${ext}`);
    fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), relativa), Buffer.from(await archivo.arrayBuffer()));

    // Si ya había un escaneo con otra extensión, se quita para no dejar basura.
    if (r.pdf_firmado && r.pdf_firmado !== relativa) {
      try {
        fs.rmSync(path.join(process.cwd(), r.pdf_firmado), { force: true });
      } catch {
        // si no se puede borrar, no es motivo para fallar
      }
    }

    db.prepare("UPDATE responsivas SET pdf_firmado = ?, fecha_firma = ? WHERE id = ?").run(relativa, hoyISO(), responsivaId);
    registrarBitacora(
      "RESPONSIVA_FIRMADA",
      `Se subió la responsiva firmada ${r.folio}`,
      { folio: r.folio, archivo: relativa },
      false
    );

    revalidar();
    return { ok: true, id: responsivaId, folio: r.folio, mensaje: `${r.folio} quedó marcada como firmada.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la responsiva firmada." };
  }
}

// ---------- Carga masiva de responsivas ----------

/** Una carta del lote, ya analizada y con la propuesta de a quién pertenece. */
export type RenglonLote = {
  clave: string;
  archivo: string;
  pagina: number;
  folio: string | null;
  /** Responsiva existente con ese folio: la carta es su versión firmada. */
  responsivaId: number | null;
  empleadoId: number | null;
  empleadoTexto: string | null;
  /** Cómo se identificó al empleado, para que se pueda revisar. */
  comoSeIdentifico: string;
  clase: string;
  fecha: string | null;
  equipoIds: number[];
  equiposTexto: string | null;
  aviso: string;
};

export type ResultadoLote = { total: number; renglones: RenglonLote[] };

/** Carpeta temporal donde viven las páginas separadas hasta que se confirman. */
const DIR_LOTE = path.join(process.cwd(), "storage", "lote");

/**
 * Separa uno o varios PDF (cada uno puede traer muchas cartas) y propone a qué
 * empleado y equipo corresponde cada página. No guarda nada en la base: solo
 * deja las páginas sueltas listas para confirmarse.
 */
export async function analizarLoteResponsivas(formData: FormData): Promise<ResultadoAccion & { lote?: ResultadoLote }> {
  try {
    const archivos = formData.getAll("archivo").filter((a): a is File => a instanceof File);
    if (!archivos.length) return { ok: false, error: "Sube el PDF con las responsivas." };

    const { partirLote } = await import("../../lib/lote");
    const sesion = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const carpeta = path.join(DIR_LOTE, sesion);
    fs.mkdirSync(carpeta, { recursive: true });

    const renglones: RenglonLote[] = [];
    for (const archivo of archivos) {
      if (!/\.pdf$/i.test(archivo.name)) continue;
      const paginas = await partirLote(new Uint8Array(await archivo.arrayBuffer()), archivo.name);


      for (const p of paginas) {
        const clave = `${sesion}/${renglones.length + 1}.pdf`;
        fs.writeFileSync(path.join(DIR_LOTE, clave), Buffer.from(p.pdfBase64, "base64"));

        // 1) Por folio: si ya existe esa responsiva, la página es su firma.
        const existente = p.folio
          ? (db.prepare("SELECT id, empleado_id FROM responsivas WHERE folio = ? AND estado != 'ELIMINADA'").get(p.folio) as
              | { id: number; empleado_id: number }
              | undefined)
          : undefined;

        // 2) Por número de empleado y, si no, por nombre.
        let empleado = p.numeroEmpleado
          ? (db.prepare("SELECT id, numero_empleado, nombre FROM empleados WHERE numero_empleado = ?").get(p.numeroEmpleado) as
              | { id: number; numero_empleado: string; nombre: string }
              | undefined)
          : undefined;
        let como = empleado ? `número de empleado ${p.numeroEmpleado}` : "";
        if (!empleado && p.nombre) {
          const porNombre = db
            .prepare("SELECT id, numero_empleado, nombre FROM empleados WHERE UPPER(nombre) = UPPER(?)")
            .all(p.nombre) as { id: number; numero_empleado: string; nombre: string }[];
          if (porNombre.length === 1) {
            empleado = porNombre[0];
            como = `nombre “${p.nombre}”`;
          }
        }
        if (existente && !empleado) {
          empleado = db
            .prepare("SELECT id, numero_empleado, nombre FROM empleados WHERE id = ?")
            .get(existente.empleado_id) as typeof empleado;
          if (empleado) como = `folio ${p.folio}`;
        }

        // 3) Equipos por serie o IMEI de la carta.
        const equipos: { id: number; codigo: string }[] = [];
        for (const s of p.series) {
          const eq = db
            .prepare(
              `SELECT id, codigo FROM equipos
               WHERE UPPER(REPLACE(REPLACE(COALESCE(numero_serie,''),' ',''),'-','')) = UPPER(REPLACE(REPLACE(?,' ',''),'-',''))
                  OR COALESCE(json_extract(detalles,'$.imei'),'') = ?
               LIMIT 1`
            )
            .get(s, s) as { id: number; codigo: string } | undefined;
          if (eq && !equipos.some((x) => x.id === eq.id)) equipos.push(eq);
        }

        const aviso = existente
          ? ""
          : !empleado
            ? p.texto
              ? "No se pudo identificar al empleado en la carta: elígelo a mano."
              : "La página es un escaneo sin texto: elige al empleado a mano."
            : "";

        renglones.push({
          clave,
          archivo: p.archivo,
          pagina: p.pagina,
          folio: p.folio,
          responsivaId: existente?.id ?? null,
          empleadoId: empleado?.id ?? null,
          empleadoTexto: empleado ? `${empleado.numero_empleado} ${empleado.nombre}` : null,
          comoSeIdentifico: existente ? `folio ${p.folio} ya registrado` : como,
          clase: (CARTAS as Record<string, unknown>)[p.clase ?? ""] ? (p.clase as string) : "COMPUTO",
          fecha: p.fecha,
          equipoIds: equipos.map((e) => e.id),
          equiposTexto: equipos.length ? equipos.map((e) => e.codigo).join(", ") : null,
          aviso,
        });
      }
    }

    if (!renglones.length) return { ok: false, error: "No se encontró ninguna página PDF que leer." };
    return { ok: true, lote: { total: renglones.length, renglones } };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el PDF. Asegúrate de que no esté protegido con contraseña." };
  }
}

/**
 * Guarda las cartas del lote ya revisadas. Cada página se convierte en la
 * responsiva firmada de su empleado: si la carta ya existía en el sistema se
 * adjunta como su firma, y si no, se da de alta como responsiva cargada.
 */
export async function confirmarLoteResponsivas(
  renglones: { clave: string; empleadoId: number | null; responsivaId: number | null; clase: string; fecha: string | null; equipoIds: number[] }[]
): Promise<ResultadoAccion> {
  try {
    let adjuntadas = 0;
    let creadas = 0;
    const omitidas: string[] = [];

    for (const r of renglones) {
      const origen = path.join(DIR_LOTE, r.clave);
      if (!/^[\w.-]+\/\d+\.pdf$/.test(r.clave) || !fs.existsSync(origen)) {
        omitidas.push(`${r.clave}: el archivo temporal ya no está, vuelve a subir el PDF`);
        continue;
      }

      // Ya existía: la página es su versión firmada.
      if (r.responsivaId) {
        const resp = db.prepare("SELECT folio FROM responsivas WHERE id = ?").get(r.responsivaId) as { folio: string } | undefined;
        if (!resp) {
          omitidas.push(`${r.clave}: la responsiva ya no existe`);
          continue;
        }
        const destino = path.join("storage", "responsivas", `${resp.folio}-firmada.pdf`);
        fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
        fs.copyFileSync(origen, path.join(process.cwd(), destino));
        db.prepare("UPDATE responsivas SET pdf_firmado = ?, fecha_firma = ? WHERE id = ?").run(destino, hoyISO(), r.responsivaId);
        registrarBitacora("RESPONSIVA_FIRMADA", `Se subió firmada ${resp.folio} desde una carga masiva`, { folio: resp.folio }, false);
        adjuntadas += 1;
        continue;
      }

      if (!r.empleadoId) {
        omitidas.push(`${r.clave}: sin empleado asignado`);
        continue;
      }
      const empleado = db.prepare("SELECT id FROM empleados WHERE id = ?").get(r.empleadoId) as { id: number } | undefined;
      if (!empleado) {
        omitidas.push(`${r.clave}: el empleado ya no existe`);
        continue;
      }

      const clase = (CARTAS as Record<string, unknown>)[r.clase] ? r.clase : "COMPUTO";
      const folio = siguienteFolio(clase === "VALE" ? "VALE" : "RESP");
      const destino = path.join("storage", "responsivas", `${folio}.pdf`);
      fs.mkdirSync(path.join(process.cwd(), "storage", "responsivas"), { recursive: true });
      fs.copyFileSync(origen, path.join(process.cwd(), destino));

      const alta = db.transaction(() => {
        const info = db
          .prepare(
            "INSERT INTO responsivas (folio, tipo, clase, empleado_id, fecha, estado, entregado_por, observaciones, origen, pdf_path, pdf_firmado, fecha_firma) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
          )
          .run(
            folio,
            "ASIGNACION",
            clase,
            r.empleadoId,
            r.fecha || hoyISO(),
            "VIGENTE",
            getConfig("entrega_default", "Departamento de TI"),
            "Cargada desde un PDF con varias responsivas",
            "CARGADA",
            destino,
            destino,
            hoyISO()
          );
        const rid = Number(info.lastInsertRowid);
        for (const equipoId of r.equipoIds) {
          const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoId) as Equipo | undefined;
          if (!eq) continue;
          db.prepare("INSERT INTO responsiva_items (responsiva_id, equipo_id, descripcion) VALUES (?,?,?)").run(
            rid,
            eq.id,
            descripcionEquipo(eq)
          );
          db.prepare("UPDATE equipos SET estado='ASIGNADO', asignado_a=? WHERE id=?").run(r.empleadoId, eq.id);
        }
        return { rid, folio };
      });
      const creada = alta();
      registrarBitacora(
        "RESPONSIVA_CARGADA",
        `Se cargó ${creada.folio} desde un PDF con varias responsivas`,
        { folio: creada.folio },
        false
      );
      creadas += 1;
    }

    // La carpeta temporal ya no hace falta.
    try {
      fs.rmSync(DIR_LOTE, { recursive: true, force: true });
    } catch {
      // que quede basura temporal no debe romper la carga
    }

    revalidar();
    const partes = [`${creadas} responsiva(s) nueva(s)`, `${adjuntadas} adjuntada(s) a su folio`];
    if (omitidas.length) partes.push(`${omitidas.length} sin guardar`);
    return {
      ok: true,
      mensaje: `Carga masiva lista: ${partes.join(", ")}.` + (omitidas.length ? `\n· ${omitidas.join("\n· ")}` : ""),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la carga masiva." };
  }
}
