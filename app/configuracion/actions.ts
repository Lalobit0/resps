"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { comprobar } from "../../lib/auth";
import { anotar, anotarDenegado } from "../../lib/bitacora";
import { PAQUETE_BASICO } from "../../lib/catalogo-semilla";
import { tipoDocumento } from "../../lib/expedientes";
import type { ResultadoAccion } from "../../lib/types";

/**
 * Configuración del catálogo documental.
 *
 * El punto 75 lo pide claro: agregar un tipo de documento nuevo no puede
 * obligar a tocar el código. Todo lo que decide si un requisito está cumplido
 * —si es obligatorio, si vence, si hay que validarlo, quién puede verlo— se
 * define desde aquí.
 */

const PERMISO = "exp.configurar";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const numero = (d: FormData, campo: string) => Number(d.get(campo)) || 0;
/**
 * Una casilla marcada.
 *
 * Se miran todos los valores y no solo el primero porque cada casilla viaja
 * junto a un campo oculto con "0": es lo que hace que desmarcarla se guarde
 * como "no" en vez de no mandar nada y dejar el valor anterior.
 */
const bandera = (d: FormData, campo: string) => {
  const valores = d.getAll(campo).map(String);
  return valores.includes("1") || valores.includes("on") ? 1 : 0;
};

function refrescar() {
  revalidatePath("/configuracion/tipos");
  revalidatePath("/configuracion/matriz");
  revalidatePath("/configuracion");
  revalidatePath("/expedientes");
}

// ---------------------------------------------------------------- categorías

export async function guardarCategoria(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("CAT_GUARDA", "Intento de configurar categorías sin permiso", "CATEGORIA");
    return { ok: false, error: permiso.error };
  }

  const id = numero(datos, "id");
  const nombre = texto(datos, "nombre");
  const descripcion = texto(datos, "descripcion");
  const orden = numero(datos, "orden");
  if (!nombre) return { ok: false, error: "Ponle nombre a la categoría." };

  if (id) {
    db.prepare("UPDATE doc_categorias SET nombre = ?, descripcion = ?, orden = ? WHERE id = ?").run(
      nombre,
      descripcion || null,
      orden,
      id
    );
    await anotar({ accion: "CAT_EDITA", descripcion: `Editó la categoría ${nombre}`, entidad: "CATEGORIA", entidadId: id });
  } else {
    if (db.prepare("SELECT id FROM doc_categorias WHERE nombre = ?").get(nombre)) {
      return { ok: false, error: "Ya existe una categoría con ese nombre." };
    }
    const res = db
      .prepare("INSERT INTO doc_categorias (nombre, descripcion, orden) VALUES (?, ?, ?)")
      .run(nombre, descripcion || null, orden);
    await anotar({
      accion: "CAT_ALTA",
      descripcion: `Creó la categoría ${nombre}`,
      entidad: "CATEGORIA",
      entidadId: Number(res.lastInsertRowid),
    });
  }

  refrescar();
  return { ok: true, mensaje: "Categoría guardada." };
}

export async function eliminarCategoria(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const cat = db.prepare("SELECT nombre FROM doc_categorias WHERE id = ?").get(id) as { nombre: string } | undefined;
  if (!cat) return { ok: false, error: "Esa categoría ya no existe." };
  const enUso = (db.prepare("SELECT COUNT(*) AS c FROM doc_tipos WHERE categoria_id = ?").get(id) as { c: number }).c;
  if (enUso > 0) {
    return { ok: false, error: `Hay ${enUso} tipos de documento en esta categoría. Muévelos antes de borrarla.` };
  }

  db.prepare("DELETE FROM doc_categorias WHERE id = ?").run(id);
  await anotar({ accion: "CAT_BAJA", descripcion: `Eliminó la categoría ${cat.nombre}`, entidad: "CATEGORIA", entidadId: id });
  refrescar();
  return { ok: true, mensaje: "Categoría eliminada." };
}

// --------------------------------------------------------- tipos de documento

const VIGENCIAS = ["SIN", "FECHA", "DIAS", "MESES", "ANIOS"];
const CONFIDENCIALIDADES = ["GENERAL", "RESTRINGIDO", "CONFIDENCIAL", "ALTO"];

/** "60, 30, 15" -> "60,30,15", sin repetidos y de mayor a menor. */
function limpiarDiasAlerta(v: string): string {
  const dias = [
    ...new Set(
      v
        .split(",")
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isFinite(d) && d > 0 && d <= 3650)
        .map((d) => Math.round(d))
    ),
  ].sort((a, b) => b - a);
  return dias.join(",");
}

export async function guardarTipoDocumento(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("TIPO_GUARDA", "Intento de configurar tipos de documento sin permiso", "TIPO_DOC");
    return { ok: false, error: permiso.error };
  }

  const id = numero(datos, "id");
  const nombre = texto(datos, "nombre");
  if (!nombre) return { ok: false, error: "Ponle nombre al tipo de documento." };

  const codigo =
    texto(datos, "codigo").toUpperCase().replace(/[^A-Z0-9_]/g, "_") ||
    nombre
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30);

  const vigenciaTipo = VIGENCIAS.includes(texto(datos, "vigencia_tipo")) ? texto(datos, "vigencia_tipo") : "SIN";
  const vigenciaValor = numero(datos, "vigencia_valor") || null;
  if (["DIAS", "MESES", "ANIOS"].includes(vigenciaTipo) && !vigenciaValor) {
    return { ok: false, error: "Dijiste que vence por plazo: escribe de cuántos." };
  }

  const confidencialidad = CONFIDENCIALIDADES.includes(texto(datos, "confidencialidad"))
    ? texto(datos, "confidencialidad")
    : "GENERAL";

  const formatos =
    texto(datos, "formatos")
      .split(",")
      .map((f) => f.trim().toLowerCase().replace(/^\./, ""))
      .filter((f) => /^[a-z0-9]{1,8}$/.test(f))
      .join(",") || "pdf,jpg,jpeg,png";

  const tamMax = Math.min(Math.max(numero(datos, "tam_max_mb") || 20, 1), 50);
  const diasAlerta = limpiarDiasAlerta(texto(datos, "dias_alerta")) || "60,30,15,7";

  const campos = {
    codigo,
    nombre,
    descripcion: texto(datos, "descripcion") || null,
    categoria_id: numero(datos, "categoria_id") || null,
    obligatorio: bandera(datos, "obligatorio"),
    critico: bandera(datos, "critico"),
    permite_no_aplica: bandera(datos, "permite_no_aplica"),
    vigencia_tipo: vigenciaTipo,
    vigencia_valor: vigenciaValor,
    requiere_emision: bandera(datos, "requiere_emision"),
    requiere_vencimiento: bandera(datos, "requiere_vencimiento"),
    requiere_renovacion: bandera(datos, "requiere_renovacion"),
    requiere_validacion: bandera(datos, "requiere_validacion"),
    requiere_firma_empleado: bandera(datos, "requiere_firma_empleado"),
    requiere_firma_jefe: bandera(datos, "requiere_firma_jefe"),
    requiere_firma_rh: bandera(datos, "requiere_firma_rh"),
    multiples_vigentes: bandera(datos, "multiples_vigentes"),
    conserva_versiones: bandera(datos, "conserva_versiones"),
    visible_empleado: bandera(datos, "visible_empleado"),
    descargable_empleado: bandera(datos, "descargable_empleado"),
    confidencialidad,
    responsable: texto(datos, "responsable") || null,
    dias_alerta: diasAlerta,
    formatos,
    tam_max_mb: tamMax,
    notas: texto(datos, "notas") || null,
    orden: numero(datos, "orden"),
    activo: bandera(datos, "activo"),
  };

  if (id) {
    const antes = tipoDocumento(id);
    if (!antes) return { ok: false, error: "Ese tipo de documento ya no existe." };
    const repetido = db.prepare("SELECT id FROM doc_tipos WHERE codigo = ? AND id != ?").get(campos.codigo, id);
    if (repetido) return { ok: false, error: `Ya hay otro tipo con el código ${campos.codigo}.` };

    const asignaciones = Object.keys(campos)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE doc_tipos SET ${asignaciones} WHERE id = @id`).run({ ...campos, id });

    await anotar({
      accion: "TIPO_EDITA",
      descripcion: `Cambió la configuración de ${nombre}`,
      entidad: "TIPO_DOC",
      entidadId: id,
      antes: {
        obligatorio: antes.obligatorio,
        vigencia: `${antes.vigencia_tipo} ${antes.vigencia_valor ?? ""}`.trim(),
        confidencialidad: antes.confidencialidad,
      },
      despues: {
        obligatorio: campos.obligatorio,
        vigencia: `${campos.vigencia_tipo} ${campos.vigencia_valor ?? ""}`.trim(),
        confidencialidad: campos.confidencialidad,
      },
    });
    refrescar();
    return { ok: true, mensaje: `${nombre} actualizado.`, id };
  }

  if (db.prepare("SELECT id FROM doc_tipos WHERE codigo = ?").get(campos.codigo)) {
    return { ok: false, error: `Ya existe un tipo con el código ${campos.codigo}. Cámbiale el código.` };
  }
  const columnas = Object.keys(campos);
  const res = db
    .prepare(`INSERT INTO doc_tipos (${columnas.join(", ")}) VALUES (${columnas.map((c) => `@${c}`).join(", ")})`)
    .run(campos);

  await anotar({
    accion: "TIPO_ALTA",
    descripcion: `Creó el tipo de documento ${nombre}`,
    entidad: "TIPO_DOC",
    entidadId: Number(res.lastInsertRowid),
    despues: campos,
  });
  refrescar();
  return { ok: true, mensaje: `${nombre} creado. Ahora dile a quién se le pide en la matriz.`, id: Number(res.lastInsertRowid) };
}

/**
 * Un tipo de documento no se borra: se desactiva.
 *
 * Borrarlo se llevaría por delante los expedientes donde ya se cargó. Al
 * desactivarlo deja de pedirse a partir de hoy y lo cargado sigue ahí.
 */
export async function activarTipoDocumento(id: number, activo: boolean): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const tipo = tipoDocumento(id);
  if (!tipo) return { ok: false, error: "Ese tipo de documento ya no existe." };

  db.prepare("UPDATE doc_tipos SET activo = ? WHERE id = ?").run(activo ? 1 : 0, id);
  await anotar({
    accion: activo ? "TIPO_ACTIVA" : "TIPO_DESACTIVA",
    descripcion: `${activo ? "Reactivó" : "Desactivó"} el tipo ${tipo.nombre}`,
    entidad: "TIPO_DOC",
    entidadId: id,
  });
  refrescar();
  return {
    ok: true,
    mensaje: activo ? `${tipo.nombre} vuelve a pedirse.` : `${tipo.nombre} deja de pedirse. Lo ya cargado se conserva.`,
  };
}

// ---------------------------------------------------------------- la matriz

export async function guardarRegla(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("MATRIZ_GUARDA", "Intento de cambiar la matriz sin permiso", "MATRIZ");
    return { ok: false, error: permiso.error };
  }

  const id = numero(datos, "id");
  const tipoId = numero(datos, "doc_tipo_id");
  const campo = texto(datos, "campo") || "TODOS";
  const valor = campo === "TODOS" ? null : texto(datos, "valor");
  const obligatorioTxt = texto(datos, "obligatorio");
  const obligatorio = obligatorioTxt === "" ? null : obligatorioTxt === "1" ? 1 : 0;
  const nota = texto(datos, "nota");

  const tipo = tipoDocumento(tipoId);
  if (!tipo) return { ok: false, error: "Elige el tipo de documento." };
  if (!["TODOS", "DEPARTAMENTO", "AREA", "PUESTO", "CLASE"].includes(campo)) {
    return { ok: false, error: "Esa condición no existe." };
  }
  if (campo !== "TODOS" && !valor) return { ok: false, error: "Falta decir a qué grupo se le pide." };

  if (id) {
    db.prepare("UPDATE matriz_reglas SET doc_tipo_id = ?, campo = ?, valor = ?, obligatorio = ?, nota = ? WHERE id = ?").run(
      tipoId,
      campo,
      valor,
      obligatorio,
      nota || null,
      id
    );
    await anotar({ accion: "MATRIZ_EDITA", descripcion: `Cambió una regla de ${tipo.nombre}`, entidad: "MATRIZ", entidadId: id });
    refrescar();
    return { ok: true, mensaje: "Regla guardada." };
  }

  const repetida = db
    .prepare("SELECT id FROM matriz_reglas WHERE doc_tipo_id = ? AND campo = ? AND IFNULL(valor,'') = ?")
    .get(tipoId, campo, valor ?? "");
  if (repetida) return { ok: false, error: "Esa regla ya existe." };

  const res = db
    .prepare("INSERT INTO matriz_reglas (doc_tipo_id, campo, valor, obligatorio, nota) VALUES (?, ?, ?, ?, ?)")
    .run(tipoId, campo, valor, obligatorio, nota || null);
  await anotar({
    accion: "MATRIZ_ALTA",
    descripcion: `Ahora se pide ${tipo.nombre} a ${campo === "TODOS" ? "todo el personal" : `${campo.toLowerCase()} ${valor}`}`,
    entidad: "MATRIZ",
    entidadId: Number(res.lastInsertRowid),
  });
  refrescar();
  return { ok: true, mensaje: "Regla creada. Se aplica en cuanto se abra cada expediente." };
}

export async function eliminarRegla(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const regla = db
    .prepare("SELECT m.campo, m.valor, t.nombre FROM matriz_reglas m JOIN doc_tipos t ON t.id = m.doc_tipo_id WHERE m.id = ?")
    .get(id) as { campo: string; valor: string | null; nombre: string } | undefined;
  if (!regla) return { ok: false, error: "Esa regla ya no existe." };

  db.prepare("DELETE FROM matriz_reglas WHERE id = ?").run(id);
  await anotar({
    accion: "MATRIZ_BAJA",
    descripcion: `Dejó de pedirse ${regla.nombre} a ${regla.campo === "TODOS" ? "todo el personal" : regla.valor}`,
    entidad: "MATRIZ",
    entidadId: id,
  });
  refrescar();
  return {
    ok: true,
    mensaje: "Regla eliminada. A quien ya se le hubiera pedido, el requisito se le retira al recalcular su expediente.",
  };
}

/**
 * El botón de arranque: crea de un golpe las reglas del paquete que casi
 * cualquier empresa mexicana pide a todo su personal.
 *
 * Es un atajo, no una decisión tomada: quedan como reglas normales que se
 * pueden borrar una por una.
 */
export async function aplicarPaqueteBasico(): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const insertar = db.prepare(
    "INSERT INTO matriz_reglas (doc_tipo_id, campo, valor, obligatorio, nota) VALUES (?, 'TODOS', NULL, 1, ?)"
  );
  let creadas = 0;
  const faltantes: string[] = [];

  for (const codigo of PAQUETE_BASICO) {
    const tipo = db.prepare("SELECT id, nombre FROM doc_tipos WHERE codigo = ? AND activo = 1").get(codigo) as
      | { id: number; nombre: string }
      | undefined;
    if (!tipo) {
      faltantes.push(codigo);
      continue;
    }
    const ya = db.prepare("SELECT id FROM matriz_reglas WHERE doc_tipo_id = ? AND campo = 'TODOS'").get(tipo.id);
    if (ya) continue;
    insertar.run(tipo.id, "Paquete básico");
    creadas++;
  }

  await anotar({
    accion: "MATRIZ_PAQUETE",
    descripcion: `Aplicó el paquete básico: ${creadas} reglas nuevas para todo el personal`,
    entidad: "MATRIZ",
  });
  refrescar();

  if (!creadas) return { ok: true, mensaje: "Ya estaban todas puestas: no hizo falta agregar ninguna." };
  return {
    ok: true,
    mensaje: `Listo: ${creadas} documentos se le van a pedir a todo el personal.${
      faltantes.length ? ` (${faltantes.join(", ")} no están en el catálogo.)` : ""
    }`,
  };
}
