"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { comprobar, usuarioActual } from "../../lib/auth";
import { anotar, anotarDenegado } from "../../lib/bitacora";
import { guardarArchivo, revisarArchivo, type ArchivoEntrante } from "../../lib/archivos";
import {
  anotarExpediente,
  asegurarExpediente,
  esConfidencial,
  sincronizarRequisitos,
  tipoDocumento,
  vencimientoDe,
  type TipoDocumento,
  type VersionDocumento,
} from "../../lib/expedientes";
import { fechaCorta } from "../../lib/helpers";
import type { ResultadoAccion } from "../../lib/types";

/**
 * Lo que se puede hacer sobre un expediente.
 *
 * Cada acción vuelve a preguntar por el permiso aquí, en el servidor. Que el
 * botón no aparezca en pantalla no protege nada: la acción se puede llamar
 * igual desde fuera.
 */

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const numero = (d: FormData, campo: string) => Number(d.get(campo)) || 0;

type ContextoRequisito = {
  requisito_id: number;
  expediente_id: number;
  empleado_id: number;
  doc_tipo_id: number;
  no_aplica: number;
  obligatorio: number;
  empleado_nombre: string;
  numero_empleado: string;
  tipo: TipoDocumento;
};

function contextoDeRequisito(requisitoId: number): ContextoRequisito | null {
  const fila = db
    .prepare(
      `SELECT r.id AS requisito_id, r.expediente_id, r.doc_tipo_id, r.no_aplica, r.obligatorio,
              e.empleado_id, em.nombre AS empleado_nombre, em.numero_empleado
       FROM expediente_requisitos r
       JOIN expedientes e ON e.id = r.expediente_id
       JOIN empleados em ON em.id = e.empleado_id
       WHERE r.id = ?`
    )
    .get(requisitoId) as Omit<ContextoRequisito, "tipo"> | undefined;
  if (!fila) return null;
  const tipo = tipoDocumento(fila.doc_tipo_id);
  if (!tipo) return null;
  return { ...fila, tipo };
}

function refrescar(empleadoId: number) {
  revalidatePath("/expedientes");
  revalidatePath(`/expedientes/${empleadoId}`);
}

// ------------------------------------------------------------ abrir / recalcular

/**
 * Abre el expediente de alguien y le pone los requisitos que le tocan.
 *
 * Se llama solo al entrar a su expediente, así que nadie tiene que acordarse de
 * crearlo: al dar de alta a una persona, su expediente ya existe la primera vez
 * que se abre.
 */
export async function abrirExpediente(empleadoId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.ver");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const emp = db.prepare("SELECT nombre FROM empleados WHERE id = ?").get(empleadoId) as
    | { nombre: string }
    | undefined;
  if (!emp) return { ok: false, error: "Esa persona ya no está en el sistema." };

  const nuevo = !db.prepare("SELECT id FROM expedientes WHERE empleado_id = ?").get(empleadoId);
  const id = asegurarExpediente(empleadoId);
  const r = sincronizarRequisitos(empleadoId);

  if (nuevo) {
    anotarExpediente(id, "APERTURA", `Se abrió el expediente con ${r.agregados} requisitos`, permiso.u.nombre);
    await anotar({
      accion: "EXP_APERTURA",
      descripcion: `Abrió el expediente de ${emp.nombre}`,
      entidad: "EXPEDIENTE",
      entidadId: id,
    });
  }
  return { ok: true, id };
}

/** Vuelve a comparar contra la matriz. Se usa al cambiar de puesto o de área. */
export async function recalcularRequisitos(empleadoId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.requisitos");
  if ("error" in permiso) {
    await anotarDenegado("EXP_RECALCULO", "Intento de recalcular requisitos sin permiso", "EXPEDIENTE");
    return { ok: false, error: permiso.error };
  }

  const id = asegurarExpediente(empleadoId);
  const r = sincronizarRequisitos(empleadoId);
  const partes: string[] = [];
  if (r.agregados) partes.push(`${r.agregados} ${r.agregados === 1 ? "requisito nuevo" : "requisitos nuevos"}`);
  if (r.yaNoAplican) partes.push(`${r.yaNoAplican} dejaron de ser obligatorios`);
  if (r.retirados) partes.push(`${r.retirados} se retiraron por estar vacíos`);

  if (partes.length) {
    anotarExpediente(id, "RECALCULO", partes.join(", "), permiso.u.nombre);
  }
  refrescar(empleadoId);
  return { ok: true, mensaje: partes.length ? `Listo: ${partes.join(", ")}.` : "Ya estaba al día: no cambió nada." };
}

// ----------------------------------------------------------------- requisitos

export async function agregarRequisito(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.requisitos");
  if ("error" in permiso) {
    await anotarDenegado("EXP_REQUISITO", "Intento de agregar un requisito sin permiso", "EXPEDIENTE");
    return { ok: false, error: permiso.error };
  }

  const empleadoId = numero(datos, "empleado_id");
  const tipoId = numero(datos, "doc_tipo_id");
  const obligatorio = datos.get("obligatorio") === "0" ? 0 : 1;
  const tipo = tipoDocumento(tipoId);
  if (!tipo) return { ok: false, error: "Elige un tipo de documento." };

  const expedienteId = asegurarExpediente(empleadoId);
  const res = db
    .prepare(
      "INSERT OR IGNORE INTO expediente_requisitos (expediente_id, doc_tipo_id, origen, obligatorio) VALUES (?, ?, 'MANUAL', ?)"
    )
    .run(expedienteId, tipoId, obligatorio);
  if (res.changes === 0) return { ok: false, error: `${tipo.nombre} ya estaba en la lista.` };

  anotarExpediente(
    expedienteId,
    "REQUISITO_ALTA",
    `Se agregó ${tipo.nombre} a mano (${obligatorio ? "obligatorio" : "opcional"})`,
    permiso.u.nombre,
    null,
    tipoId
  );
  await anotar({
    accion: "EXP_REQUISITO_ALTA",
    descripcion: `Agregó el requisito ${tipo.nombre}`,
    entidad: "EXPEDIENTE",
    entidadId: expedienteId,
    despues: { tipo: tipo.nombre, obligatorio },
  });

  refrescar(empleadoId);
  return { ok: true, mensaje: `${tipo.nombre} agregado.` };
}

export async function quitarRequisito(requisitoId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.requisitos");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const ctx = contextoDeRequisito(requisitoId);
  if (!ctx) return { ok: false, error: "Ese requisito ya no existe." };

  const conDocumentos = (
    db.prepare("SELECT COUNT(*) AS c FROM documentos WHERE requisito_id = ?").get(requisitoId) as { c: number }
  ).c;
  if (conDocumentos > 0) {
    return {
      ok: false,
      error: "Este requisito ya tiene documentos cargados. Márcalo como “no aplica” para que deje de contar, sin perder los archivos.",
    };
  }

  db.prepare("DELETE FROM expediente_requisitos WHERE id = ?").run(requisitoId);
  anotarExpediente(ctx.expediente_id, "REQUISITO_BAJA", `Se quitó ${ctx.tipo.nombre}`, permiso.u.nombre, null, ctx.doc_tipo_id);
  await anotar({
    accion: "EXP_REQUISITO_BAJA",
    descripcion: `Quitó el requisito ${ctx.tipo.nombre} de ${ctx.empleado_nombre}`,
    entidad: "EXPEDIENTE",
    entidadId: ctx.expediente_id,
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: `${ctx.tipo.nombre} retirado del expediente.` };
}

export async function marcarNoAplica(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.no_aplica");
  if ("error" in permiso) {
    await anotarDenegado("EXP_NO_APLICA", "Intento de marcar no aplica sin permiso", "EXPEDIENTE");
    return { ok: false, error: permiso.error };
  }

  const requisitoId = numero(datos, "requisito_id");
  const motivo = texto(datos, "motivo");
  const ctx = contextoDeRequisito(requisitoId);
  if (!ctx) return { ok: false, error: "Ese requisito ya no existe." };
  if (!ctx.tipo.permite_no_aplica) {
    return { ok: false, error: `${ctx.tipo.nombre} está configurado para no admitir excepciones.` };
  }
  if (motivo.length < 5) return { ok: false, error: "Escribe por qué no aplica: queda como constancia." };

  db.prepare(
    `UPDATE expediente_requisitos
     SET no_aplica = 1, no_aplica_motivo = ?, no_aplica_usuario = ?, no_aplica_fecha = datetime('now','localtime')
     WHERE id = ?`
  ).run(motivo, permiso.u.nombre, requisitoId);

  anotarExpediente(
    ctx.expediente_id,
    "NO_APLICA",
    `${ctx.tipo.nombre} marcado como no aplica: ${motivo}`,
    permiso.u.nombre,
    null,
    ctx.doc_tipo_id
  );
  await anotar({
    accion: "EXP_NO_APLICA",
    descripcion: `Marcó ${ctx.tipo.nombre} como no aplica para ${ctx.empleado_nombre}`,
    entidad: "EXPEDIENTE",
    entidadId: ctx.expediente_id,
    despues: { motivo },
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: "Listo. Deja de contar para el cumplimiento y queda el motivo registrado." };
}

export async function quitarNoAplica(requisitoId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.no_aplica");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const ctx = contextoDeRequisito(requisitoId);
  if (!ctx) return { ok: false, error: "Ese requisito ya no existe." };

  db.prepare(
    "UPDATE expediente_requisitos SET no_aplica = 0, no_aplica_motivo = NULL, no_aplica_usuario = NULL, no_aplica_fecha = NULL WHERE id = ?"
  ).run(requisitoId);

  anotarExpediente(ctx.expediente_id, "NO_APLICA_QUITADO", `${ctx.tipo.nombre} vuelve a pedirse`, permiso.u.nombre, null, ctx.doc_tipo_id);
  await anotar({
    accion: "EXP_NO_APLICA_QUITADO",
    descripcion: `Volvió a pedir ${ctx.tipo.nombre} a ${ctx.empleado_nombre}`,
    entidad: "EXPEDIENTE",
    entidadId: ctx.expediente_id,
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: `${ctx.tipo.nombre} vuelve a contar.` };
}

// -------------------------------------------------------------------- cargar

function fechaValida(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Sube un documento.
 *
 * Si el requisito ya tenía uno, esta carga es la versión siguiente: la anterior
 * no se borra, se marca sustituida y se queda para consulta (punto 16).
 */
export async function cargarDocumento(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.cargar");
  if ("error" in permiso) {
    await anotarDenegado("EXP_CARGA", "Intento de cargar un documento sin permiso", "EXPEDIENTE");
    return { ok: false, error: permiso.error };
  }
  const yo = permiso.u;

  const requisitoId = numero(datos, "requisito_id");
  const ctx = contextoDeRequisito(requisitoId);
  if (!ctx) return { ok: false, error: "Ese requisito ya no existe." };
  const tipo = ctx.tipo;

  if (esConfidencial(tipo) && !yo.todo && !yo.permisos.has("exp.ver_confidencial")) {
    return { ok: false, error: `${tipo.nombre} está marcado como ${tipo.confidencialidad.toLowerCase()} y tú no tienes ese acceso.` };
  }

  // --- los archivos ---
  const entrantes: ArchivoEntrante[] = [];
  for (const valor of datos.getAll("archivos")) {
    if (!(valor instanceof File) || valor.size === 0) continue;
    entrantes.push({
      nombre: valor.name,
      bytes: Buffer.from(await valor.arrayBuffer()),
      mime: valor.type,
    });
  }
  if (!entrantes.length) return { ok: false, error: "No adjuntaste ningún archivo." };
  for (const a of entrantes) {
    const problema = revisarArchivo(a, tipo);
    if (problema) return { ok: false, error: problema };
  }

  // --- las fechas ---
  const emision = texto(datos, "fecha_emision");
  const vencimiento = texto(datos, "fecha_vencimiento");
  if (emision && !fechaValida(emision)) return { ok: false, error: "La fecha de emisión no se entiende." };
  if (vencimiento && !fechaValida(vencimiento)) return { ok: false, error: "La fecha de vencimiento no se entiende." };
  if (emision && vencimiento && vencimiento < emision) {
    return { ok: false, error: "El documento no puede vencerse antes de haberse emitido. Revisa las fechas." };
  }
  if (tipo.requiere_emision && !emision) {
    return { ok: false, error: `${tipo.nombre} necesita la fecha de emisión.` };
  }
  if (tipo.requiere_vencimiento && !vencimiento) {
    return { ok: false, error: `${tipo.nombre} necesita la fecha de vencimiento que trae impresa.` };
  }
  if (tipo.vigencia_tipo !== "SIN" && !emision && !vencimiento) {
    return { ok: false, error: `${tipo.nombre} tiene vigencia: captura al menos una de las dos fechas.` };
  }

  const origen = ["RH", "EMPLEADO", "IMPORTACION", "MIGRACION"].includes(texto(datos, "origen"))
    ? texto(datos, "origen")
    : "RH";
  const folio = texto(datos, "folio");
  const entidad = texto(datos, "entidad_emisora");
  const notas = texto(datos, "notas");
  // En una digitalización masiva no se puede validar cada archivo al momento:
  // entran como "en revisión" y RH los valida al ritmo que pueda.
  const estadoInicial = origen === "MIGRACION" ? "EN_REVISION" : "CARGADO";

  // --- ¿versión nueva de uno que ya existía, o documento aparte? ---
  const documentosActivos = db
    .prepare("SELECT id FROM documentos WHERE requisito_id = ? AND situacion = 'ACTIVO' ORDER BY id")
    .all(requisitoId) as { id: number }[];
  const comoNuevo = datos.get("como_nuevo") === "1" && tipo.multiples_vigentes;
  const documentoExistente = comoNuevo ? null : documentosActivos[0] ?? null;

  const guardarTodo = db.transaction(() => {
    let documentoId: number;
    let version = 1;

    if (documentoExistente) {
      documentoId = documentoExistente.id;
      const ultima = db
        .prepare("SELECT MAX(version) AS v FROM doc_versiones WHERE documento_id = ?")
        .get(documentoId) as { v: number | null };
      version = (ultima.v ?? 0) + 1;
      // La anterior deja de ser la vigente pero se conserva completa.
      db.prepare(
        `UPDATE doc_versiones
         SET vigente = 0, sustituida_en = datetime('now','localtime'), motivo_sustitucion = ?
         WHERE documento_id = ? AND vigente = 1`
      ).run(texto(datos, "motivo_sustitucion") || "Se cargó una versión nueva", documentoId);
    } else {
      const res = db
        .prepare(
          `INSERT INTO documentos (requisito_id, expediente_id, doc_tipo_id, empleado_id, titulo)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(requisitoId, ctx.expediente_id, ctx.doc_tipo_id, ctx.empleado_id, texto(datos, "titulo") || tipo.nombre);
      documentoId = Number(res.lastInsertRowid);
    }

    const resVer = db
      .prepare(
        `INSERT INTO doc_versiones
           (documento_id, version, estado, vigente, fecha_emision, fecha_vencimiento, folio,
            entidad_emisora, notas, origen, cargado_por, firma_estado)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        documentoId,
        version,
        estadoInicial,
        emision || null,
        vencimiento || null,
        folio || null,
        entidad || null,
        notas || null,
        origen,
        yo.nombre,
        tipo.requiere_firma_empleado || tipo.requiere_firma_jefe || tipo.requiere_firma_rh ? "PENDIENTE" : null
      );
    const versionId = Number(resVer.lastInsertRowid);

    const insArchivo = db.prepare(
      `INSERT INTO doc_archivos (version_id, nombre_original, ruta, mime, tamano, etiqueta, orden, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    entrantes.forEach((a, i) => {
      const g = guardarArchivo(a, {
        empleadoId: ctx.empleado_id,
        codigoTipo: tipo.codigo,
        versionId,
        indice: i,
      });
      insArchivo.run(
        versionId,
        g.nombreOriginal,
        g.ruta,
        g.mime,
        g.tamano,
        texto(datos, `etiqueta_${i}`) || null,
        i,
        g.hash
      );
    });

    return { documentoId, versionId, version };
  });

  const { documentoId, version } = guardarTodo();

  anotarExpediente(
    ctx.expediente_id,
    "CARGA",
    `Se cargó ${tipo.nombre}${version > 1 ? ` (versión ${version})` : ""} con ${entrantes.length} ${
      entrantes.length === 1 ? "archivo" : "archivos"
    }`,
    yo.nombre,
    documentoId,
    ctx.doc_tipo_id
  );
  await anotar({
    accion: "EXP_CARGA",
    descripcion: `Cargó ${tipo.nombre} de ${ctx.empleado_nombre}${version > 1 ? ` (versión ${version})` : ""}`,
    entidad: "DOCUMENTO",
    entidadId: documentoId,
    despues: { tipo: tipo.nombre, version, emision, vencimiento, archivos: entrantes.map((a) => a.nombre) },
  });

  refrescar(ctx.empleado_id);
  return {
    ok: true,
    mensaje: tipo.requiere_validacion
      ? `${tipo.nombre} cargado. Queda pendiente de validar.`
      : `${tipo.nombre} cargado.`,
  };
}

// ------------------------------------------------------------ validar/rechazar

type ContextoVersion = ContextoRequisito & { version: VersionDocumento; documento_id: number };

function contextoDeVersion(versionId: number): ContextoVersion | null {
  const fila = db
    .prepare(
      `SELECT v.*, d.id AS documento_id, d.requisito_id
       FROM doc_versiones v JOIN documentos d ON d.id = v.documento_id
       WHERE v.id = ?`
    )
    .get(versionId) as (VersionDocumento & { documento_id: number; requisito_id: number }) | undefined;
  if (!fila) return null;
  const ctx = contextoDeRequisito(fila.requisito_id);
  if (!ctx) return null;
  return { ...ctx, version: fila, documento_id: fila.documento_id };
}

export async function validarDocumento(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.validar");
  if ("error" in permiso) {
    await anotarDenegado("EXP_VALIDACION", "Intento de validar un documento sin permiso", "DOCUMENTO");
    return { ok: false, error: permiso.error };
  }

  const versionId = numero(datos, "version_id");
  const ctx = contextoDeVersion(versionId);
  if (!ctx) return { ok: false, error: "Ese documento ya no existe." };
  if (ctx.version.estado === "VALIDADO") return { ok: false, error: "Ese documento ya estaba validado." };
  if (!ctx.version.vigente) return { ok: false, error: "Esa versión ya fue sustituida por otra." };

  // Un documento que ya nació vencido no se valida: hay que pedir la renovación.
  const vence = vencimientoDe(ctx.tipo, ctx.version);
  if (vence && vence < new Date().toISOString().slice(0, 10)) {
    return {
      ok: false,
      error: `Ese documento venció el ${fechaCorta(vence)}. Recházalo y pide la versión vigente en vez de validarlo.`,
    };
  }

  db.prepare(
    `UPDATE doc_versiones
     SET estado = 'VALIDADO', validado_por = ?, validado_en = datetime('now','localtime'),
         motivo_rechazo = NULL, comentario_rechazo = NULL, rechazado_por = NULL, rechazado_en = NULL
     WHERE id = ?`
  ).run(permiso.u.nombre, versionId);

  anotarExpediente(
    ctx.expediente_id,
    "VALIDACION",
    `${ctx.tipo.nombre} validado (versión ${ctx.version.version})`,
    permiso.u.nombre,
    ctx.documento_id,
    ctx.doc_tipo_id
  );
  await anotar({
    accion: "EXP_VALIDACION",
    descripcion: `Validó ${ctx.tipo.nombre} de ${ctx.empleado_nombre}`,
    entidad: "DOCUMENTO",
    entidadId: ctx.documento_id,
    antes: { estado: ctx.version.estado },
    despues: { estado: "VALIDADO" },
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: `${ctx.tipo.nombre} validado.` };
}

export async function rechazarDocumento(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.rechazar");
  if ("error" in permiso) {
    await anotarDenegado("EXP_RECHAZO", "Intento de rechazar un documento sin permiso", "DOCUMENTO");
    return { ok: false, error: permiso.error };
  }

  const versionId = numero(datos, "version_id");
  const motivo = texto(datos, "motivo");
  const comentario = texto(datos, "comentario");
  if (!motivo) return { ok: false, error: "Elige el motivo del rechazo: sin él, quien lo repone no sabe qué corregir." };
  if (motivo === "Otro" && comentario.length < 5) {
    return { ok: false, error: "Si el motivo es “Otro”, explica en el comentario qué pasa con el documento." };
  }

  const ctx = contextoDeVersion(versionId);
  if (!ctx) return { ok: false, error: "Ese documento ya no existe." };
  if (!ctx.version.vigente) return { ok: false, error: "Esa versión ya fue sustituida por otra." };

  db.prepare(
    `UPDATE doc_versiones
     SET estado = 'RECHAZADO', motivo_rechazo = ?, comentario_rechazo = ?,
         rechazado_por = ?, rechazado_en = datetime('now','localtime'),
         validado_por = NULL, validado_en = NULL
     WHERE id = ?`
  ).run(motivo, comentario || null, permiso.u.nombre, versionId);

  anotarExpediente(
    ctx.expediente_id,
    "RECHAZO",
    `${ctx.tipo.nombre} rechazado: ${motivo}${comentario ? ` — ${comentario}` : ""}`,
    permiso.u.nombre,
    ctx.documento_id,
    ctx.doc_tipo_id
  );
  await anotar({
    accion: "EXP_RECHAZO",
    descripcion: `Rechazó ${ctx.tipo.nombre} de ${ctx.empleado_nombre}: ${motivo}`,
    entidad: "DOCUMENTO",
    entidadId: ctx.documento_id,
    despues: { motivo, comentario },
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: "Rechazado. Hay que pedir una versión nueva." };
}

export async function editarMetadatos(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.editar_metadatos");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const versionId = numero(datos, "version_id");
  const ctx = contextoDeVersion(versionId);
  if (!ctx) return { ok: false, error: "Ese documento ya no existe." };

  const emision = texto(datos, "fecha_emision");
  const vencimiento = texto(datos, "fecha_vencimiento");
  if (emision && !fechaValida(emision)) return { ok: false, error: "La fecha de emisión no se entiende." };
  if (vencimiento && !fechaValida(vencimiento)) return { ok: false, error: "La fecha de vencimiento no se entiende." };
  if (emision && vencimiento && vencimiento < emision) {
    return { ok: false, error: "El documento no puede vencerse antes de haberse emitido." };
  }

  const antes = {
    fecha_emision: ctx.version.fecha_emision,
    fecha_vencimiento: ctx.version.fecha_vencimiento,
    folio: ctx.version.folio,
    entidad_emisora: ctx.version.entidad_emisora,
  };
  const despues = {
    fecha_emision: emision || null,
    fecha_vencimiento: vencimiento || null,
    folio: texto(datos, "folio") || null,
    entidad_emisora: texto(datos, "entidad_emisora") || null,
  };

  db.prepare(
    "UPDATE doc_versiones SET fecha_emision = ?, fecha_vencimiento = ?, folio = ?, entidad_emisora = ?, notas = ? WHERE id = ?"
  ).run(
    despues.fecha_emision,
    despues.fecha_vencimiento,
    despues.folio,
    despues.entidad_emisora,
    texto(datos, "notas") || null,
    versionId
  );

  anotarExpediente(
    ctx.expediente_id,
    "CORRECCION",
    `Se corrigieron los datos de ${ctx.tipo.nombre}`,
    permiso.u.nombre,
    ctx.documento_id,
    ctx.doc_tipo_id
  );
  await anotar({
    accion: "EXP_CORRECCION",
    descripcion: `Corrigió los datos de ${ctx.tipo.nombre} de ${ctx.empleado_nombre}`,
    entidad: "DOCUMENTO",
    entidadId: ctx.documento_id,
    antes,
    despues,
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: "Datos corregidos." };
}

/**
 * Manda el documento a la papelera del expediente.
 *
 * No hay borrado definitivo desde aquí a propósito (punto 45): archivar deja el
 * archivo en disco y el renglón en la base, con quién lo archivó y por qué.
 */
export async function archivarDocumento(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.eliminar");
  if ("error" in permiso) {
    await anotarDenegado("EXP_ARCHIVADO", "Intento de archivar un documento sin permiso", "DOCUMENTO");
    return { ok: false, error: permiso.error };
  }

  const documentoId = numero(datos, "documento_id");
  const motivo = texto(datos, "motivo");
  if (motivo.length < 5) return { ok: false, error: "Escribe por qué se archiva." };

  const doc = db.prepare("SELECT requisito_id, empleado_id FROM documentos WHERE id = ?").get(documentoId) as
    | { requisito_id: number; empleado_id: number }
    | undefined;
  if (!doc) return { ok: false, error: "Ese documento ya no existe." };
  const ctx = contextoDeRequisito(doc.requisito_id);
  if (!ctx) return { ok: false, error: "Ese documento ya no existe." };

  db.prepare(
    `UPDATE documentos SET situacion = 'ARCHIVADO', archivado_motivo = ?, archivado_por = ?,
       archivado_en = datetime('now','localtime') WHERE id = ?`
  ).run(motivo, permiso.u.nombre, documentoId);

  anotarExpediente(ctx.expediente_id, "ARCHIVADO", `${ctx.tipo.nombre} archivado: ${motivo}`, permiso.u.nombre, documentoId, ctx.doc_tipo_id);
  await anotar({
    accion: "EXP_ARCHIVADO",
    descripcion: `Archivó ${ctx.tipo.nombre} de ${ctx.empleado_nombre}`,
    entidad: "DOCUMENTO",
    entidadId: documentoId,
    despues: { motivo },
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: "Archivado. Sigue guardado, pero deja de contar en el expediente." };
}

export async function restaurarDocumento(documentoId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.eliminar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const doc = db.prepare("SELECT requisito_id FROM documentos WHERE id = ?").get(documentoId) as
    | { requisito_id: number }
    | undefined;
  if (!doc) return { ok: false, error: "Ese documento ya no existe." };
  const ctx = contextoDeRequisito(doc.requisito_id);
  if (!ctx) return { ok: false, error: "Ese documento ya no existe." };

  db.prepare(
    "UPDATE documentos SET situacion = 'ACTIVO', archivado_motivo = NULL, archivado_por = NULL, archivado_en = NULL WHERE id = ?"
  ).run(documentoId);

  anotarExpediente(ctx.expediente_id, "RESTAURADO", `${ctx.tipo.nombre} se sacó de la papelera`, permiso.u.nombre, documentoId, ctx.doc_tipo_id);
  await anotar({
    accion: "EXP_RESTAURADO",
    descripcion: `Restauró ${ctx.tipo.nombre} de ${ctx.empleado_nombre}`,
    entidad: "DOCUMENTO",
    entidadId: documentoId,
  });

  refrescar(ctx.empleado_id);
  return { ok: true, mensaje: "Restaurado." };
}

// --------------------------------------------------------------------- notas

export async function agregarNota(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.comentar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const empleadoId = numero(datos, "empleado_id");
  const cuerpo = texto(datos, "texto");
  const visibilidad = datos.get("visibilidad") === "EMPLEADO" ? "EMPLEADO" : "INTERNA";
  if (cuerpo.length < 3) return { ok: false, error: "La nota está vacía." };

  const expedienteId = asegurarExpediente(empleadoId);
  db.prepare("INSERT INTO exp_notas (expediente_id, documento_id, texto, visibilidad, autor) VALUES (?, ?, ?, ?, ?)").run(
    expedienteId,
    numero(datos, "documento_id") || null,
    cuerpo,
    visibilidad,
    permiso.u.nombre
  );

  await anotar({
    accion: "EXP_NOTA",
    descripcion: `Dejó una nota ${visibilidad === "INTERNA" ? "interna" : "visible para el empleado"}`,
    entidad: "EXPEDIENTE",
    entidadId: expedienteId,
  });

  refrescar(empleadoId);
  return { ok: true, mensaje: "Nota guardada." };
}

export async function eliminarNota(notaId: number): Promise<ResultadoAccion> {
  const permiso = await comprobar("exp.comentar");
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const nota = db
    .prepare("SELECT n.expediente_id, n.autor, e.empleado_id FROM exp_notas n JOIN expedientes e ON e.id = n.expediente_id WHERE n.id = ?")
    .get(notaId) as { expediente_id: number; autor: string | null; empleado_id: number } | undefined;
  if (!nota) return { ok: false, error: "Esa nota ya no existe." };

  const yo = await usuarioActual();
  const puedeBorrarla = yo?.todo || nota.autor === yo?.nombre;
  if (!puedeBorrarla) return { ok: false, error: "Solo quien la escribió puede borrar su nota." };

  db.prepare("DELETE FROM exp_notas WHERE id = ?").run(notaId);
  refrescar(nota.empleado_id);
  return { ok: true, mensaje: "Nota borrada." };
}
