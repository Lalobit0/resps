"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { db, getConfig } from "../../lib/db";
import { contenidoPlantilla } from "../../lib/documento";
import { generarCarta, type FilaCarta } from "../../lib/pdf";
import { llenarPlantilla } from "../../lib/plantilla";
import { filasUsuario, partirPlantilla } from "../../lib/carta";
import { ETIQ_EMPLEADO, ETIQ_SISTEMAS, ETIQUETA_TIPO } from "../../lib/constants";
import { fechaCorta, fechaLarga, hoyISO } from "../../lib/helpers";
import { prestamo } from "../../lib/prestamos";
import type { Empleado, Equipo, ResultadoAccion } from "../../lib/types";
import { comprobar } from "../../lib/auth";

/**
 * Los pases de préstamo.
 *
 * Prestar mueve el equipo a PRESTADO, no a ASIGNADO: sigue siendo del
 * anaquel. Devolverlo lo regresa a DISPONIBLE. Ese ida y vuelta es todo el
 * módulo; lo demás es el papel que lo respalda.
 */

function revalidar() {
  revalidatePath("/");
  revalidatePath("/prestamos");
  revalidatePath("/inventario");
  revalidatePath("/empleados");
  revalidatePath("/bitacora");
}

function registrarBitacora(accion: string, descripcion: string, snapshot: unknown) {
  db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
    accion,
    descripcion,
    snapshot ? JSON.stringify(snapshot) : null
  );
}

function siguienteFolio(): string {
  const anio = new Date().getFullYear();
  const r = db.prepare("SELECT COUNT(*) AS c FROM prestamos WHERE folio LIKE ?").get(`PREST-${anio}-%`) as {
    c: number;
  };
  return `PREST-${anio}-${String(r.c + 1).padStart(3, "0")}`;
}

function guardarPdf(folio: string, bytes: Uint8Array): string {
  const relativa = path.join("storage", "prestamos", `${folio}.pdf`);
  fs.mkdirSync(path.join(process.cwd(), "storage", "prestamos"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), relativa), Buffer.from(bytes));
  return relativa;
}

/** Un año adelante: más allá de eso es un dedazo, no una fecha. */
function limiteAdelante(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export type DatosPrestamo = {
  empleadoId: number;
  /** Del inventario. Null cuando se escribe a mano lo que se presta. */
  equipoId: number | null;
  /** Qué se presta. Con equipo se llena solo; sin él, lo escribe quien captura. */
  descripcion: string;
  cantidad: number;
  motivo: string;
  fechaPrestamo: string;
  fechaCompromiso: string;
  condicionEntrega: string;
  entregadoPor: string;
  notas: string;
};

/** Los renglones de la tabla del PDF: del inventario o lo que se escribió. */
function filasDeLoPrestado(equipo: Equipo | undefined, d: DatosPrestamo): FilaCarta[] {
  if (!equipo) {
    return [
      { etiqueta: "Descripción", valor: d.descripcion },
      { etiqueta: "Cantidad", valor: String(d.cantidad) },
      { etiqueta: "Condiciones en que se entrega", valor: d.condicionEntrega || "Buenas condiciones" },
    ];
  }
  return [
    { etiqueta: "Código de inventario", valor: equipo.codigo },
    { etiqueta: "Tipo", valor: ETIQUETA_TIPO[equipo.tipo] ?? equipo.tipo },
    { etiqueta: "Marca y modelo", valor: `${equipo.marca} ${equipo.modelo}`.trim() },
    { etiqueta: "Número de serie", valor: equipo.numero_serie || "Sin número de serie" },
    { etiqueta: "Cantidad", valor: String(d.cantidad) },
    { etiqueta: "Condiciones en que se entrega", valor: d.condicionEntrega || "Buenas condiciones" },
  ];
}

async function bytesDelPase(
  folio: string,
  empleado: Empleado,
  equipo: Equipo | undefined,
  d: DatosPrestamo
): Promise<Uint8Array> {
  const plantilla = llenarPlantilla(contenidoPlantilla("pase_prestamo"), {
    fecha: fechaLarga(d.fechaPrestamo),
    ciudad: getConfig("ciudad"),
    empresa: getConfig("empresa"),
    nombre_empleado: empleado.nombre,
    numero_empleado: empleado.numero_empleado,
    puesto: empleado.puesto,
    departamento: empleado.area || empleado.departamento,
    motivo: d.motivo.trim() || "No se especificó",
    // Sin plazo el papel no puede quedarse mudo: se dice explícitamente.
    fecha_compromiso: d.fechaCompromiso ? fechaLarga(d.fechaCompromiso) : "la fecha que indique el departamento de TI",
    observaciones: d.notas.trim() ? `Observaciones: ${d.notas.trim()}` : "",
    folio,
  });
  const { intro, cuerpo } = partirPlantilla(plantilla);

  return generarCarta({
    encabezado: "PASE DE PRÉSTAMO",
    titulo: "DE EQUIPO O MATERIAL",
    fecha: fechaCorta(d.fechaPrestamo),
    folio,
    empresa: getConfig("empresa"),
    direccion: getConfig("direccion"),
    filasUsuario: filasUsuario(empleado),
    intro,
    filasEquipo: filasDeLoPrestado(equipo, d),
    cuerpo,
    firma: null,
    firmaDer: null,
    etiquetaIzq: getConfig("firma_empleado", ETIQ_EMPLEADO),
    etiquetaDer: getConfig("firma_sistemas", ETIQ_SISTEMAS),
    sustituye: false,
  });
}

export async function crearPrestamo(d: DatosPrestamo): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(d.empleadoId) as Empleado | undefined;
  if (!empleado) return { ok: false, error: "Elige a quién se le presta." };
  if (!empleado.activo) return { ok: false, error: `${empleado.nombre} ya no está en la plantilla.` };

  const equipo = d.equipoId
    ? (db.prepare("SELECT * FROM equipos WHERE id = ?").get(d.equipoId) as Equipo | undefined)
    : undefined;
  if (d.equipoId && !equipo) return { ok: false, error: "Ese equipo ya no existe." };

  // Sin equipo del inventario, la descripción es lo único que identifica lo
  // que salió: sin ella el pase no dice nada.
  const descripcion = equipo ? `${equipo.marca} ${equipo.modelo}`.trim() || equipo.codigo : d.descripcion.trim();
  if (!descripcion) return { ok: false, error: "Escribe qué se está prestando." };

  if (equipo) {
    if (equipo.asignado_a) return { ok: false, error: `${equipo.codigo} está asignado. Primero regístrale la devolución.` };
    if (equipo.estado === "PRESTADO") return { ok: false, error: `${equipo.codigo} ya está prestado.` };
    if (equipo.estado !== "DISPONIBLE")
      return { ok: false, error: `${equipo.codigo} está en ${equipo.estado.toLowerCase()}: no se puede prestar.` };
  }

  const cantidad = Math.max(1, Math.round(Number(d.cantidad) || 1));
  const fechaPrestamo = d.fechaPrestamo || hoyISO();
  if (fechaPrestamo > limiteAdelante()) return { ok: false, error: "Revisa la fecha del préstamo." };
  if (d.fechaCompromiso) {
    if (d.fechaCompromiso < fechaPrestamo)
      return { ok: false, error: "La fecha de regreso no puede ser antes del préstamo." };
    if (d.fechaCompromiso > limiteAdelante()) return { ok: false, error: "Revisa la fecha de regreso." };
  }

  const folio = siguienteFolio();
  const info = db
    .prepare(
      `INSERT INTO prestamos
        (folio, empleado_id, equipo_id, descripcion, cantidad, motivo, fecha_prestamo, fecha_compromiso,
         estado, condicion_entrega, entregado_por, notas)
       VALUES (?,?,?,?,?,?,?,?,'PRESTADO',?,?,?)`
    )
    .run(
      folio,
      empleado.id,
      equipo?.id ?? null,
      descripcion,
      cantidad,
      d.motivo.trim() || null,
      fechaPrestamo,
      d.fechaCompromiso || null,
      d.condicionEntrega.trim() || null,
      d.entregadoPor.trim() || null,
      d.notas.trim() || null
    );
  const id = Number(info.lastInsertRowid);

  // El equipo sale del anaquel, pero no cambia de dueño: `asignado_a` se
  // queda en null a propósito. Quién lo trae se sabe por el préstamo.
  if (equipo) db.prepare("UPDATE equipos SET estado = 'PRESTADO' WHERE id = ?").run(equipo.id);

  try {
    const bytes = await bytesDelPase(folio, empleado, equipo, { ...d, descripcion, cantidad, fechaPrestamo });
    db.prepare("UPDATE prestamos SET pdf_path = ? WHERE id = ?").run(guardarPdf(folio, bytes), id);
  } catch (e) {
    // El préstamo ya quedó registrado; el papel se puede volver a generar.
    console.error("No se pudo armar el PDF del pase", e);
  }

  registrarBitacora(
    "PRESTAMO_ALTA",
    `Préstamo ${folio}: ${descripcion} a ${empleado.numero_empleado} ${empleado.nombre}`,
    { id, folio, equipoId: equipo?.id ?? null }
  );
  revalidar();
  return { ok: true, id, folio, mensaje: `Pase ${folio} generado. Imprímelo para que lo firme.` };
}

export async function devolverPrestamo(datos: {
  id: number;
  fecha: string;
  condicion: string;
  recibidoPor: string;
}): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const p = prestamo(datos.id);
  if (!p) return { ok: false, error: "Ese préstamo ya no existe." };
  if (p.estado !== "PRESTADO") return { ok: false, error: `El pase ${p.folio} ya está ${p.estado.toLowerCase()}.` };

  const fecha = datos.fecha || hoyISO();
  if (fecha < p.fecha_prestamo) return { ok: false, error: "La devolución no puede ser antes del préstamo." };

  db.prepare(
    `UPDATE prestamos SET estado = 'DEVUELTO', fecha_devolucion = ?, condicion_regreso = ?, recibido_por = ?
     WHERE id = ?`
  ).run(fecha, datos.condicion.trim() || null, datos.recibidoPor.trim() || null, p.id);

  // Vuelve al anaquel, pero solo si sigue marcado como prestado: si alguien
  // lo mandó a mantenimiento mientras tanto, ese estado manda.
  if (p.equipo_id) {
    db.prepare("UPDATE equipos SET estado = 'DISPONIBLE' WHERE id = ? AND estado = 'PRESTADO'").run(p.equipo_id);
  }

  registrarBitacora("PRESTAMO_DEVOLUCION", `Devolución del préstamo ${p.folio}: ${p.descripcion}`, {
    id: p.id,
    folio: p.folio,
  });
  revalidar();
  return { ok: true, mensaje: `${p.folio} quedó devuelto.` };
}

export async function cancelarPrestamo(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const p = prestamo(id);
  if (!p) return { ok: false, error: "Ese préstamo ya no existe." };
  if (p.estado === "DEVUELTO") return { ok: false, error: "Ya se devolvió: no hay nada que cancelar." };

  db.prepare("UPDATE prestamos SET estado = 'CANCELADO' WHERE id = ?").run(p.id);
  if (p.equipo_id) {
    db.prepare("UPDATE equipos SET estado = 'DISPONIBLE' WHERE id = ? AND estado = 'PRESTADO'").run(p.equipo_id);
  }

  registrarBitacora("PRESTAMO_CANCELA", `Préstamo ${p.folio} cancelado`, { id: p.id, folio: p.folio });
  revalidar();
  return { ok: true, mensaje: `${p.folio} quedó cancelado y el equipo volvió al inventario.` };
}

export async function eliminarPrestamo(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const p = prestamo(id);
  if (!p) return { ok: false, error: "Ese préstamo ya no existe." };
  if (p.estado === "PRESTADO")
    return { ok: false, error: "Todavía está prestado. Regístrale la devolución o cancélalo antes de borrarlo." };

  db.prepare("DELETE FROM prestamos WHERE id = ?").run(p.id);
  registrarBitacora("PRESTAMO_BAJA", `Préstamo ${p.folio} eliminado`, { folio: p.folio });
  revalidar();
  return { ok: true, mensaje: `${p.folio} se borró del sistema.` };
}

/** Vuelve a armar el PDF del pase, por si la plantilla cambió. */
export async function regenerarPasePrestamo(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const p = prestamo(id);
  if (!p) return { ok: false, error: "Ese préstamo ya no existe." };

  const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(p.empleado_id) as Empleado | undefined;
  if (!empleado) return { ok: false, error: "No se encontró al empleado del pase." };
  const equipo = p.equipo_id
    ? (db.prepare("SELECT * FROM equipos WHERE id = ?").get(p.equipo_id) as Equipo | undefined)
    : undefined;

  const bytes = await bytesDelPase(p.folio, empleado, equipo, {
    empleadoId: p.empleado_id,
    equipoId: p.equipo_id,
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    motivo: p.motivo ?? "",
    fechaPrestamo: p.fecha_prestamo,
    fechaCompromiso: p.fecha_compromiso ?? "",
    condicionEntrega: p.condicion_entrega ?? "",
    entregadoPor: p.entregado_por ?? "",
    notas: p.notas ?? "",
  });
  db.prepare("UPDATE prestamos SET pdf_path = ? WHERE id = ?").run(guardarPdf(p.folio, bytes), p.id);
  revalidar();
  return { ok: true, mensaje: `${p.folio} se volvió a generar.` };
}

/** Sube el escaneo del pase ya firmado en papel. */
export async function subirPaseFirmado(id: number, fd: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("ti.editar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const p = prestamo(id);
  if (!p) return { ok: false, error: "Ese préstamo ya no existe." };

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || !archivo.size) return { ok: false, error: "No llegó ningún archivo." };
  if (archivo.size > 20 * 1024 * 1024) return { ok: false, error: "El archivo pesa más de 20 MB." };

  const ext = (path.extname(archivo.name) || ".pdf").toLowerCase();
  if (![".pdf", ".jpg", ".jpeg", ".png"].includes(ext))
    return { ok: false, error: "Sube el escaneo en PDF o como imagen." };

  const relativa = path.join("storage", "prestamos", `${p.folio}-firmado${ext}`);
  fs.mkdirSync(path.join(process.cwd(), "storage", "prestamos"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), relativa), Buffer.from(await archivo.arrayBuffer()));

  db.prepare("UPDATE prestamos SET pdf_firmado = ?, fecha_firma = ? WHERE id = ?").run(relativa, hoyISO(), p.id);
  registrarBitacora("PRESTAMO_FIRMA", `Se cargó el pase firmado ${p.folio}`, { id: p.id, folio: p.folio });
  revalidar();
  return { ok: true, mensaje: `${p.folio} quedó firmado.` };
}
