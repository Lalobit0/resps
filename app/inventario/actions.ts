"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { db, BACKUP_DIR } from "../../lib/db";
import { CAMPOS_DETALLE, TIPO_DEFAULTS, TIPOS_EQUIPO, type TipoEquipo } from "../../lib/constants";
import { importarDeExcel, type Mapeo } from "../../lib/importar";
import { leerEscaneo } from "../../lib/escaneo";
import { CAMPOS_BLOQUEANTES, conflictosContra, detectarDuplicados, type EquipoRevisable } from "../../lib/duplicados";
import { fusionarInventario } from "../../lib/fusionar.mjs";
import { equiposPorLigar, idsSinResponsiva } from "../../lib/pendientes";
import { anotarMovimiento } from "../../lib/historial";
import type { Equipo, ResultadoAccion } from "../../lib/types";
import { exigir } from "../../lib/auth";

function revalidar() {
  revalidatePath("/inventario");
  revalidatePath("/");
  revalidatePath("/responsivas/nueva");
  revalidatePath("/mantenimientos");
}

function generarCodigo(prefijo: string): string {
  let n = (db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE codigo LIKE ?").get(`SP-${prefijo}-%`) as { c: number }).c + 1;
  let codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  while (db.prepare("SELECT 1 FROM equipos WHERE codigo = ?").get(codigo)) {
    n += 1;
    codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  }
  return codigo;
}

/** Carta de asignación vigente del equipo, si la tiene. */
function responsivaVigenteDe(equipoId: number): { folio: string; empleado_id: number } | null {
  return (
    (db
      .prepare(
        `SELECT r.folio, r.empleado_id FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
         WHERE ri.equipo_id = ? AND r.tipo='ASIGNACION' AND r.estado='VIGENTE'
         ORDER BY r.id DESC LIMIT 1`
      )
      .get(equipoId) as { folio: string; empleado_id: number } | undefined) ?? null
  );
}

function tieneResponsivaVigente(equipoId: number): boolean {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
       WHERE ri.equipo_id = ? AND r.tipo='ASIGNACION' AND r.estado='VIGENTE'`
    )
    .get(equipoId) as { c: number };
  return r.c > 0;
}

/** Serie comparable: sin espacios ni signos y en mayúsculas. Vacía si es relleno. */
function normalizarSerie(v: string): string {
  const s = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length > 2 && !["NA", "NA/", "SIN", "SINSERIE", "NINGUNO"].includes(s) ? s : "";
}

function componerSpecs(tipo: TipoEquipo, d: Record<string, string>): string {
  const j = (arr: (string | undefined)[]) => arr.filter((x) => x && x.trim()).join(" · ");
  if (tipo === "COMPUTO") return j([d.procesador, d.ram, d.hd, d.sistema_operativo]);
  if (tipo === "CELULAR") return j([d.numero, d.plan, d.imei]);
  if (tipo === "RADIO") return j([d.num_equipo ? `No. ${d.num_equipo}` : "", d.estado_radio]);
  return j([d.descripcion]);
}

function limpiarDetalles(tipo: TipoEquipo, detalles: Record<string, string>): Record<string, string> {
  const claves = new Set(CAMPOS_DETALLE[tipo].map((c) => c.clave));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(detalles)) {
    if (claves.has(k) && v && v.trim()) out[k] = v.trim();
  }
  return out;
}

export async function guardarEquipo(datos: {
  id?: number;
  tipo: string;
  codigo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  fecha_compra: string;
  costo: string;
  estado: string;
  notas: string;
  detalles: Record<string, string>;
  /** Área a la que pertenece el aparato, aunque no lo tenga nadie. */
  departamento?: string;
  area?: string;
  /** Administrativo, producción, sala… */
  clasificacion?: string;
  /** Empleado al que se le entrega. null = queda libre. */
  asignado_a?: number | null;
}): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const tipo = (TIPOS_EQUIPO as readonly string[]).includes(datos.tipo) ? (datos.tipo as TipoEquipo) : "OTRO";
    if (!datos.marca.trim() && !datos.modelo.trim()) {
      return { ok: false, error: "Indica al menos marca o modelo del equipo." };
    }

    const costo = datos.costo.trim() ? Number(datos.costo) : null;
    if (costo !== null && Number.isNaN(costo)) return { ok: false, error: "El costo debe ser un número." };

    const detalles = limpiarDetalles(tipo, datos.detalles || {});
    // Normaliza IMEI (sin espacios) para validar y comparar duplicados.
    if (detalles.imei) detalles.imei = detalles.imei.replace(/\s+/g, "");
    if (detalles.imei2) detalles.imei2 = detalles.imei2.replace(/\s+/g, "");

    // Validación: IMEI debe ser de 15 dígitos exactos.
    if (tipo === "CELULAR") {
      for (const [etiqueta, val] of [["IMEI", detalles.imei], ["IMEI 2", detalles.imei2]] as const) {
        if (val && !/^\d{15}$/.test(val)) {
          return { ok: false, error: `El ${etiqueta} debe tener 15 dígitos (capturaste ${val.replace(/\D/g, "").length}).` };
        }
      }
    }

    // El IMEI 2 no puede repetir al IMEI del mismo equipo.
    if (detalles.imei && detalles.imei2 && detalles.imei === detalles.imei2) {
      return { ok: false, error: "El IMEI y el IMEI 2 no pueden ser el mismo número." };
    }

    // Duplicados contra el resto del inventario (serie, IMEI y línea).
    const serieTrim = datos.numero_serie.trim();
    const idActual = datos.id ?? -1;
    const otros = db
      .prepare("SELECT id, codigo, numero_serie, detalles FROM equipos WHERE id != ?")
      .all(idActual) as EquipoRevisable[];
    const conflictos = conflictosContra({ numeroSerie: serieTrim, detalles }, otros).filter((c) =>
      CAMPOS_BLOQUEANTES.includes(c.campo)
    );
    if (conflictos.length) {
      const c = conflictos[0];
      return {
        ok: false,
        error: `El ${c.etiqueta} ${c.valor} ya está registrado en ${c.otros.length > 1 ? "los equipos" : "el equipo"} ${c.otros.join(", ")}.`,
      };
    }

    const specs = componerSpecs(tipo, detalles);
    const detallesJson = Object.keys(detalles).length ? JSON.stringify(detalles) : null;
    let codigo = datos.codigo.trim().toUpperCase();
    const estadoLibre = ["DISPONIBLE", "MANTENIMIENTO", "BAJA"].includes(datos.estado) ? datos.estado : "DISPONIBLE";

    if (datos.id) {
      const actual = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.id) as Equipo | undefined;
      if (!actual) return { ok: false, error: "El equipo ya no existe." };
      if (!codigo) codigo = actual.codigo;

      // A quién se le entrega. Si el formulario no manda el dato (llamadas
      // antiguas), se conserva lo que ya tenía.
      const pedido = datos.asignado_a === undefined ? actual.asignado_a : datos.asignado_a;
      const vigente = responsivaVigenteDe(datos.id);
      let estadoFinal: string;
      let asignadoFinal: number | null;
      if (vigente) {
        // Con carta vigente manda el documento: cambiar de dueño exige devolución.
        if (pedido !== null && pedido !== vigente.empleado_id) {
          const otro = db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(vigente.empleado_id) as
            | { numero_empleado: string; nombre: string }
            | undefined;
          return {
            ok: false,
            error:
              `Este equipo tiene la responsiva ${vigente.folio} vigente a nombre de ` +
              `${otro ? `${otro.numero_empleado} ${otro.nombre}` : "otro empleado"}. ` +
              `Registra primero su devolución para poder cambiarlo de empleado.`,
          };
        }
        estadoFinal = "ASIGNADO";
        asignadoFinal = vigente.empleado_id;
      } else if (pedido !== null) {
        if (!db.prepare("SELECT 1 FROM empleados WHERE id = ?").get(pedido)) {
          return { ok: false, error: "El empleado seleccionado ya no existe." };
        }
        estadoFinal = "ASIGNADO";
        asignadoFinal = pedido;
      } else {
        estadoFinal = estadoLibre;
        asignadoFinal = null;
      }

      const dup = db.prepare("SELECT id FROM equipos WHERE codigo = ? AND id != ?").get(codigo, datos.id);
      if (dup) return { ok: false, error: `Ya existe un equipo con el código ${codigo}.` };

      db.prepare(
        `UPDATE equipos SET codigo=?, tipo=?, categoria=?, marca=?, modelo=?, numero_serie=?, specs=?, detalles=?, fecha_compra=?, costo=?, estado=?, asignado_a=?, departamento=?, area=?, clasificacion=?, notas=? WHERE id=?`
      ).run(
        codigo,
        tipo,
        actual.categoria || TIPO_DEFAULTS[tipo].categoria,
        datos.marca.trim(),
        datos.modelo.trim(),
        datos.numero_serie.trim() || null,
        specs || null,
        detallesJson,
        datos.fecha_compra || null,
        costo,
        estadoFinal,
        asignadoFinal,
        (datos.departamento ?? actual.departamento ?? "").trim() || null,
        (datos.area ?? actual.area ?? "").trim() || null,
        (datos.clasificacion ?? actual.clasificacion ?? "").trim() || null,
        datos.notas.trim() || null,
        datos.id
      );
      revalidar();
      return { ok: true, id: datos.id };
    } else {
      if (!codigo) codigo = generarCodigo(TIPO_DEFAULTS[tipo].prefijo);
      const dup = db.prepare("SELECT id FROM equipos WHERE codigo = ?").get(codigo);
      if (dup) return { ok: false, error: `Ya existe un equipo con el código ${codigo}.` };
      const nuevoAsignado = datos.asignado_a ?? null;
      if (nuevoAsignado && !db.prepare("SELECT 1 FROM empleados WHERE id = ?").get(nuevoAsignado)) {
        return { ok: false, error: "El empleado seleccionado ya no existe." };
      }
      const info = db
        .prepare(
          "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, fecha_compra, costo, estado, notas, asignado_a, departamento, area, clasificacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          codigo,
          tipo,
          TIPO_DEFAULTS[tipo].categoria,
          datos.marca.trim(),
          datos.modelo.trim(),
          datos.numero_serie.trim() || null,
          specs || null,
          detallesJson,
          datos.fecha_compra || null,
          costo,
          nuevoAsignado ? "ASIGNADO" : estadoLibre,
          datos.notas.trim() || null,
          nuevoAsignado,
          (datos.departamento ?? "").trim() || null,
          (datos.area ?? "").trim() || null,
          (datos.clasificacion ?? "").trim() || null
        );
      revalidar();
      return { ok: true, id: Number(info.lastInsertRowid) };
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el equipo." };
  }
}

export async function eliminarEquipo(id: number): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const equipo = db.prepare("SELECT estado FROM equipos WHERE id=?").get(id) as { estado: string } | undefined;
    if (!equipo) return { ok: false, error: "El equipo ya no existe." };
    if (tieneResponsivaVigente(id)) {
      return { ok: false, error: "El equipo tiene una responsiva vigente. Registra la devolución antes de eliminarlo." };
    }
    const enResponsivas = db.prepare("SELECT COUNT(*) AS c FROM responsiva_items WHERE equipo_id=?").get(id) as { c: number };
    const enMant = db.prepare("SELECT COUNT(*) AS c FROM mantenimientos WHERE equipo_id=?").get(id) as { c: number };
    if (enResponsivas.c > 0 || enMant.c > 0) {
      return {
        ok: false,
        error: "El equipo tiene historial de responsivas o mantenimientos. Cámbialo a estado 'Baja' en lugar de eliminarlo.",
      };
    }
    db.prepare("DELETE FROM equipos WHERE id=?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el equipo." };
  }
}

// ---------- Importación desde Excel ----------
const naVacio = (s: string) => (/^#n\/?a$/i.test((s || "").trim()) ? "" : (s || "").trim());

const MAPEOS: Record<TipoEquipo, { hoja: string; mapeo: Mapeo }> = {
  COMPUTO: {
    hoja: "COMPUTO INVENTARIO",
    mapeo: {
      num_emp: ["usuario", "emp", "num empleado", "numero de empleado"],
      marca: ["marca"],
      modelo: ["modelo"],
      serie: ["serie"],
      nombre_computadora: ["nombre de la computadora", "nombre de la compu", "nombre de la pc"],
      procesador: ["procesador"],
      ram: ["mem ram", "memoria ram", "mem", "memoria"],
      hd: ["hd", "disco", "disco duro"],
      sistema_operativo: ["sistema operativo", "so"],
      ip: ["ipaddeth1 rsrv", "ip", "direccion ip", "ipaddeth1"],
      activo: ["av", "activo", "no de activo"],
      departamento: ["departamento"],
      notas: ["notas configuracion", "notas"],
    },
  },
  CELULAR: {
    hoja: "RELACION DE LINEAS TELCEL",
    mapeo: {
      num_emp: ["num", "emp", "numero de empleado", "no empleado"],
      usuario_nombre: ["usuario"],
      area: ["area"],
      modelo: ["telnuevo", "modelo", "equipo"],
      tel_actual: ["telactual"],
      numero: ["telefono", "linea", "numero de linea"],
      serie: ["serie"],
      imei: ["imei"],
      imei2: ["ime2", "imei2"],
      pin: ["pin"],
      icloud: ["icloud"],
      mac: ["mac"],
      plan: ["plan"],
      plan_precio: ["plan precio", "precio del plan", "precio"],
      region: ["region"],
      cuenta_padre: ["cuenta padre"],
      cuenta: ["cuenta"],
      condicion: ["entrego y condicion anterior", "condicion"],
    },
  },
  RADIO: {
    hoja: "RADIOS INVENTARIO",
    mapeo: {
      num_emp: ["empleado", "num empleado", "numero de empleado", "no empleado"],
      usuario_nombre: ["nombre"],
      supervisor: ["jefe directo", "jefe"],
      area: ["area dpto", "area", "dpto"],
      marca: ["marca de radio", "marca"],
      modelo: ["columna2", "modelo"],
      serie: ["serie"],
      num_equipo: ["n equipo", "num equipo", "no equipo", "equipo"],
      estado_radio: ["estado del radio", "estado"],
      fallas: ["fallas del radio", "fallas"],
      auricular: ["auricular"],
      comentarios: ["comentarios"],
    },
  },
  OTRO: { hoja: "", mapeo: {} },
};

export async function importarInventario(tipoRaw: string, formData: FormData): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const tipo = (TIPOS_EQUIPO as readonly string[]).includes(tipoRaw) ? (tipoRaw as TipoEquipo) : null;
    if (!tipo || tipo === "OTRO") return { ok: false, error: "Tipo de inventario no válido para importar." };
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") return { ok: false, error: "No se recibió ningún archivo." };

    const cfg = MAPEOS[tipo];
    const buf = Buffer.from(await archivo.arrayBuffer());
    const filas = await importarDeExcel(buf, cfg.mapeo, cfg.hoja);
    if (!filas.length) return { ok: false, error: "No se encontraron datos con los encabezados esperados." };

    const camposDetalle = new Set(CAMPOS_DETALLE[tipo].map((c) => c.clave));
    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;
    let vinculados = 0;

    const proceso = db.transaction(() => {
      const buscarEmp = db.prepare("SELECT id FROM empleados WHERE numero_empleado = ?");
      // El equipo se identifica por IMEI y, si no hay, por serie normalizada.
      // Buscar solo por serie exacta duplicaba equipos: los teléfonos cuya
      // "serie" es en realidad el código de modelo se guardan sin serie, y una
      // serie con distinto formato tampoco casaba.
      const catalogo = db
        .prepare("SELECT id, codigo, numero_serie, detalles FROM equipos")
        .all() as { id: number; codigo: string; numero_serie: string | null; detalles: string | null }[];
      const imeiDe = (raw: string | null) => {
        try {
          const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          return { imei: String(d.imei ?? "").replace(/\D/g, ""), imei2: String(d.imei2 ?? "").replace(/\D/g, "") };
        } catch {
          return { imei: "", imei2: "" };
        }
      };
      const buscarExistente = (serie: string, imei: string) => {
        if (imei) {
          const porImei = catalogo.find((c) => {
            const d = imeiDe(c.detalles);
            return d.imei === imei || d.imei2 === imei;
          });
          if (porImei) return porImei;
        }
        const s = normalizarSerie(serie);
        if (!s) return undefined;
        return catalogo.find((c) => {
          if (normalizarSerie(c.numero_serie ?? "") !== s) return false;
          const otro = imeiDe(c.detalles).imei;
          return !(imei && otro && imei !== otro); // misma "serie", distinto teléfono
        });
      };

      for (const f of filas) {
        const marca = naVacio(f.marca || "");
        const modelo = naVacio(f.modelo || "");
        const serie = naVacio(f.serie || "");
        // detalles: todo lo que sea campo del tipo
        const detalles: Record<string, string> = {};
        for (const [k, v] of Object.entries(f)) {
          if (camposDetalle.has(k)) {
            const val = naVacio(v);
            if (val) detalles[k] = val;
          }
        }
        if (!marca && !modelo && !serie && Object.keys(detalles).length === 0) {
          omitidos++;
          continue;
        }

        // vínculo con empleado
        const numEmp = naVacio(f.num_emp || "");
        let asignado: number | null = null;
        if (numEmp) {
          const emp = buscarEmp.get(numEmp) as { id: number } | undefined;
          if (emp) {
            asignado = emp.id;
            vinculados++;
          }
        }
        const estado = asignado ? "ASIGNADO" : "DISPONIBLE";
        const specs = componerSpecs(tipo, detalles);
        const detallesJson = Object.keys(detalles).length ? JSON.stringify(detalles) : null;

        const existente = buscarExistente(serie, (detalles.imei ?? "").replace(/\D/g, ""));
        if (existente) {
          db.prepare(
            "UPDATE equipos SET tipo=?, marca=?, modelo=?, specs=?, detalles=?, estado=?, asignado_a=? WHERE id=?"
          ).run(tipo, marca, modelo, specs || null, detallesJson, estado, asignado, existente.id);
          actualizados++;
        } else {
          const codigo = generarCodigo(TIPO_DEFAULTS[tipo].prefijo);
          db.prepare(
            "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, estado, asignado_a) VALUES (?,?,?,?,?,?,?,?,?,?)"
          ).run(codigo, tipo, TIPO_DEFAULTS[tipo].categoria, marca, modelo, serie || null, specs || null, detallesJson, estado, asignado);
          const nuevoId = db.prepare("SELECT id FROM equipos WHERE codigo = ?").get(codigo) as { id: number };
          catalogo.push({ id: nuevoId.id, codigo, numero_serie: serie || null, detalles: detallesJson });
          nuevos++;
        }
      }
    });
    proceso();

    revalidar();
    const partes = [`${nuevos} nuevos`, `${actualizados} actualizados`, `${vinculados} ligados a empleado`];
    if (omitidos) partes.push(`${omitidos} omitidos`);

    // Aviso de datos repetidos en todo el inventario tras la importación.
    const todos = db.prepare("SELECT id, codigo, numero_serie, detalles FROM equipos").all() as EquipoRevisable[];
    const conDuplicados = Object.keys(detectarDuplicados(todos)).length;
    const aviso = conDuplicados
      ? ` ⚠️ Hay ${conDuplicados} equipo(s) con datos repetidos: revísalos con el filtro “Solo duplicados”.`
      : "";
    return { ok: true, mensaje: `Importación lista: ${partes.join(", ")}.${aviso}` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo. Asegúrate de que sea un Excel (.xlsx) válido." };
  }
}

/**
 * Une los registros duplicados del inventario en uno solo.
 *
 * Descargar la actualización no limpia lo que ya estaba capturado: esto es lo
 * que sí lo limpia. Antes de tocar nada se guarda un respaldo en data/backups,
 * así que siempre se puede volver atrás desde la pantalla de Respaldos.
 */
export async function unirDuplicados(): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const antes = Object.keys(
      detectarDuplicados(db.prepare("SELECT id, codigo, numero_serie, detalles FROM equipos").all() as EquipoRevisable[])
    ).length;
    if (antes === 0) return { ok: true, mensaje: "No hay datos repetidos en el inventario." };

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const nombre = `app-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
    await db.backup(path.join(BACKUP_DIR, nombre));

    const res = fusionarInventario(db);

    const quedan = Object.keys(
      detectarDuplicados(db.prepare("SELECT id, codigo, numero_serie, detalles FROM equipos").all() as EquipoRevisable[])
    ).length;

    revalidar();
    revalidatePath("/empleados");

    if (res.equipos === 0 && quedan > 0) {
      return {
        ok: true,
        mensaje:
          `No se unió ningún registro: los ${quedan} equipos señalados no son copias del mismo aparato ` +
          `(comparten un dato pero tienen IMEI distintos). Corrige el dato repetido a mano desde “Editar”.`,
      };
    }

    const detalle = quedan > 0 ? ` Quedan ${quedan} por revisar a mano.` : " El inventario quedó sin datos repetidos.";
    return {
      ok: true,
      mensaje:
        `Se unieron ${res.equipos} registro(s) repetido(s) con el equipo que ya existía` +
        ` (de ${antes} señalados).${detalle} Respaldo: ${nombre}`,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron unir los duplicados. La base quedó igual que antes." };
  }
}

/**
 * Liga al empleado los equipos que tienen carta responsiva vigente pero
 * aparecen sin asignar en el inventario (típico de las responsivas escaneadas
 * que se cargaron después). El empleado sale del propio documento, así que no
 * hay nada que elegir a mano.
 *
 *   ligarConSuResponsiva()      -> todos los que estén así
 *   ligarConSuResponsiva(id)    -> solo ese equipo
 */
export async function ligarConSuResponsiva(equipoId?: number): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const pendientes = equiposPorLigar().filter((p) => !equipoId || p.equipo_id === equipoId);
    if (!pendientes.length) {
      return { ok: true, mensaje: "No hay equipos con responsiva vigente pendientes de ligar." };
    }

    const ligar = db.transaction(() => {
      for (const p of pendientes) {
        db.prepare("UPDATE equipos SET estado = 'ASIGNADO', asignado_a = ? WHERE id = ?").run(p.empleado_id, p.equipo_id);
        db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
          "LIGAR_POR_RESPONSIVA",
          `${p.codigo} se ligó a ${p.empleado_numero} ${p.empleado_nombre} según la responsiva ${p.folio}`,
          JSON.stringify({ equipo: p.codigo, folio: p.folio, empleado: p.empleado_numero })
        );
      }
    });
    ligar();

    revalidar();
    revalidatePath("/empleados");

    if (pendientes.length === 1) {
      const p = pendientes[0];
      return { ok: true, mensaje: `${p.codigo} quedó a nombre de ${p.empleado_numero} ${p.empleado_nombre} (responsiva ${p.folio}).` };
    }
    return { ok: true, mensaje: `Se ligaron ${pendientes.length} equipos con el empleado que firmó su responsiva.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron ligar los equipos." };
  }
}

/** Qué pasó con un equipo del escaneo, para poder revisarlo y corregirlo en pantalla. */
export type LineaEscaneo = {
  equipoId: number;
  codigo: string;
  descripcion: string;
  serie: string;
  accion: "NUEVO" | "ACTUALIZADO" | "IGUAL";
  cambios: string[];
  empleadoId: number | null;
  empleadoTexto: string | null;
  /** Se ligó en esta carga (no venía asignado desde antes). */
  ligadoAhora: boolean;
  usuarioEscaneo: string;
  aviso: string;
  sinResponsiva: boolean;
};

export type ResultadoEscaneo = {
  leidos: number;
  nuevos: number;
  actualizados: number;
  iguales: number;
  ligados: number;
  porFirmar: number;
  lineas: LineaEscaneo[];
  sinSerie: string[];
  ilegibles: string[];
};

/** Nombre legible de un empleado por id. */
function nombreEmpleado(id: number): string | null {
  const e = db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(id) as
    | { numero_empleado: string; nombre: string }
    | undefined;
  return e ? `${e.numero_empleado} ${e.nombre}` : null;
}

/**
 * Carga el archivo que genera el script de escaneo de las computadoras.
 *
 * La serie manda: con ella se busca el equipo en el inventario.
 *  - Si está, se actualiza solo lo que cambió y se dice qué cambió.
 *  - Si no está, se da de alta.
 *  - En los dos casos se liga al empleado por su número. Si ese número no
 *    existe en el sistema, el equipo se queda sin asignar y se avisa.
 *
 * No borra datos: un campo que el escaneo trae vacío conserva lo que ya había.
 */
export async function importarEscaneoComputo(
  formData: FormData
): Promise<ResultadoAccion & { escaneo?: ResultadoEscaneo }> {
  try {
    const archivos = formData.getAll("archivo").filter((a): a is File => a instanceof File);
    if (!archivos.length) return { ok: false, error: "No se recibió ningún archivo." };

    // El script genera un archivo por computadora, así que se pueden subir
    // varios de un jalón, o el ZIP con todos dentro.
    const filas: Awaited<ReturnType<typeof leerEscaneo>> = [];
    const ilegibles: string[] = [];
    for (const archivo of archivos) {
  await exigir("ti.editar");
      const buf = Buffer.from(await archivo.arrayBuffer());
      if (/\.zip$/i.test(archivo.name)) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buf);
        for (const entrada of Object.values(zip.files)) {
          if (entrada.dir || /(^|\/)__MACOSX\//.test(entrada.name)) continue;
          const contenido = Buffer.from(await entrada.async("nodebuffer"));
          const leidas = await leerEscaneo(contenido, entrada.name);
          if (leidas.length) filas.push(...leidas);
          else ilegibles.push(entrada.name);
        }
        continue;
      }
      const leidas = await leerEscaneo(buf, archivo.name);
      if (leidas.length) filas.push(...leidas);
      else ilegibles.push(archivo.name);
    }

    if (!filas.length) {
      return {
        ok: false,
        error:
          "No se reconoció ninguna columna del escaneo. Acepta CSV, TSV, JSON o Excel con encabezados " +
          "como: usuario, nombre del equipo, sistema operativo, marca, modelo, número de serie, procesador, " +
          "espacio del disco, IP, marca del monitor y serie del monitor.",
      };
    }

    const CAMPOS = [
      "nombre_computadora", "sistema_operativo", "procesador", "ram", "hd", "discos",
      "arquitectura", "ip", "monitor", "monitor_serie",
    ];
    const ETIQUETA: Record<string, string> = {
      nombre_computadora: "nombre del equipo",
      sistema_operativo: "sistema operativo",
      procesador: "procesador",
      ram: "RAM",
      hd: "disco",
      ip: "IP",
      discos: "discos",
      arquitectura: "arquitectura",
      monitor: "monitor",
      monitor_serie: "serie del monitor",
      marca: "marca",
      modelo: "modelo",
    };

    const lineas: LineaEscaneo[] = [];
    const sinSerie: string[] = [];

    const proceso = db.transaction(() => {
      const catalogo = db
        .prepare("SELECT id, codigo, numero_serie, detalles, marca, modelo, asignado_a FROM equipos")
        .all() as {
        id: number;
        codigo: string;
        numero_serie: string | null;
        detalles: string | null;
        marca: string;
        modelo: string;
        asignado_a: number | null;
      }[];

      for (const f of filas) {
        const serie = (f.serie ?? "").trim();
        const clave = normalizarSerie(serie);
        if (!clave) {
          sinSerie.push(`${f.nombre_computadora || f.num_emp || "(sin nombre)"} — el escaneo no trae número de serie`);
          continue;
        }

        // El empleado del escaneo: su número es el usuario de la máquina.
        const numEmp = (f.num_emp ?? "").trim();
        let empleado: { id: number; numero_empleado: string; nombre: string } | undefined;
        if (numEmp) {
          empleado = db
            .prepare("SELECT id, numero_empleado, nombre FROM empleados WHERE numero_empleado = ?")
            .get(numEmp) as typeof empleado;
        }

        const existente = catalogo.find((c) => normalizarSerie(c.numero_serie ?? "") === clave);

        if (existente) {
          let detalles: Record<string, string> = {};
          try {
            detalles = existente.detalles ? (JSON.parse(existente.detalles) as Record<string, string>) : {};
          } catch {
            detalles = {};
          }

          // Qué trae distinto el escaneo. Lo vacío no pisa lo que ya había.
          const diferencias: string[] = [];
          for (const campo of CAMPOS) {
            const valor = (f[campo] ?? "").trim();
            if (!valor || valor === (detalles[campo] ?? "").trim()) continue;
            diferencias.push(`${ETIQUETA[campo]}: ${detalles[campo] || "(vacío)"} → ${valor}`);
            detalles[campo] = valor;
          }
          const marca = (f.marca ?? "").trim() || existente.marca;
          const modelo = (f.modelo ?? "").trim() || existente.modelo;
          if (marca !== existente.marca) diferencias.push(`marca: ${existente.marca || "(vacío)"} → ${marca}`);
          if (modelo !== existente.modelo) diferencias.push(`modelo: ${existente.modelo || "(vacío)"} → ${modelo}`);

          // Vínculo con el empleado que usa la máquina.
          let asignado = existente.asignado_a;
          let aviso = "";
          let ligadoAhora = false;
          if (empleado && existente.asignado_a !== empleado.id) {
            const vigente = responsivaVigenteDe(existente.id);
            if (vigente && vigente.empleado_id !== empleado.id) {
              aviso =
                `Lo usa ${empleado.numero_empleado} ${empleado.nombre}, pero tiene la responsiva ${vigente.folio} ` +
                `vigente a nombre de otra persona: registra la devolución antes de cambiarlo.`;
            } else {
              asignado = empleado.id;
              ligadoAhora = true;
            }
          } else if (numEmp && !empleado) {
            aviso = `El usuario “${numEmp}” del escaneo no existe como empleado: elige a quién se le asigna.`;
          }

          const sinCambios = !diferencias.length && asignado === existente.asignado_a;
          lineas.push({
            equipoId: existente.id,
            codigo: existente.codigo,
            descripcion: `${marca} ${modelo}`.trim() || "(sin modelo)",
            serie,
            accion: sinCambios ? "IGUAL" : "ACTUALIZADO",
            cambios: diferencias,
            empleadoId: asignado,
            empleadoTexto: asignado
              ? empleado && asignado === empleado.id
                ? `${empleado.numero_empleado} ${empleado.nombre}`
                : nombreEmpleado(asignado)
              : null,
            ligadoAhora,
            usuarioEscaneo: numEmp,
            aviso,
            sinResponsiva: false,
          });
          if (sinCambios) continue;
          db.prepare(
            "UPDATE equipos SET marca=?, modelo=?, specs=?, detalles=?, estado=?, asignado_a=? WHERE id=?"
          ).run(
            marca,
            modelo,
            componerSpecs("COMPUTO", detalles) || null,
            JSON.stringify(detalles),
            asignado ? "ASIGNADO" : "DISPONIBLE",
            asignado,
            existente.id
          );
        } else {
          const detalles: Record<string, string> = {};
          for (const campo of CAMPOS) {
            const valor = (f[campo] ?? "").trim();
            if (valor) detalles[campo] = valor;
          }
          const codigo = generarCodigo(TIPO_DEFAULTS.COMPUTO.prefijo);
          const info = db
            .prepare(
              "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, estado, asignado_a) VALUES (?,?,?,?,?,?,?,?,?,?)"
            )
            .run(
              codigo,
              "COMPUTO",
              TIPO_DEFAULTS.COMPUTO.categoria,
              (f.marca ?? "").trim(),
              (f.modelo ?? "").trim(),
              serie,
              componerSpecs("COMPUTO", detalles) || null,
              Object.keys(detalles).length ? JSON.stringify(detalles) : null,
              empleado ? "ASIGNADO" : "DISPONIBLE",
              empleado ? empleado.id : null
            );
          catalogo.push({
            id: Number(info.lastInsertRowid),
            codigo,
            numero_serie: serie,
            detalles: null,
            marca: (f.marca ?? "").trim(),
            modelo: (f.modelo ?? "").trim(),
            asignado_a: empleado ? empleado.id : null,
          });
          lineas.push({
            equipoId: Number(info.lastInsertRowid),
            codigo,
            descripcion: `${(f.marca ?? "").trim()} ${(f.modelo ?? "").trim()}`.trim() || "(sin modelo)",
            serie,
            accion: "NUEVO",
            cambios: [],
            empleadoId: empleado ? empleado.id : null,
            empleadoTexto: empleado ? `${empleado.numero_empleado} ${empleado.nombre}` : null,
            ligadoAhora: !!empleado,
            usuarioEscaneo: numEmp,
            aviso:
              numEmp && !empleado
                ? `El usuario “${numEmp}” del escaneo no existe como empleado: elige a quién se le asigna.`
                : !numEmp
                  ? "El escaneo no trae usuario: elige a quién se le asigna."
                  : "",
            sinResponsiva: false,
          });
        }
      }
    });
    proceso();

    revalidar();
    revalidatePath("/empleados");

    // Marca cuáles quedaron entregados sin carta firmada.
    const pendientes = idsSinResponsiva();
    for (const l of lineas) l.sinResponsiva = l.empleadoId !== null && pendientes.has(l.equipoId);

    const escaneo: ResultadoEscaneo = {
      leidos: filas.length,
      nuevos: lineas.filter((l) => l.accion === "NUEVO").length,
      actualizados: lineas.filter((l) => l.accion === "ACTUALIZADO").length,
      iguales: lineas.filter((l) => l.accion === "IGUAL").length,
      ligados: lineas.filter((l) => l.ligadoAhora).length,
      porFirmar: lineas.filter((l) => l.sinResponsiva).length,
      lineas,
      sinSerie,
      ilegibles,
    };

    return { ok: true, escaneo };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo del escaneo. Acepta CSV, TSV, JSON o Excel." };
  }
}

// ---------- Fusión a mano de dos registros del mismo aparato ----------

/**
 * El escaneo de PCs a veces da de alta un segundo registro del mismo equipo
 * (la serie venía mal capturada, por ejemplo "83889LM3" contra "8389LM3"), así
 * que la unión automática no los toca: queda el viejo con la responsiva y el
 * nuevo con los datos buenos. Aquí se juntan a mano, eligiendo qué se conserva
 * de cada uno, y las responsivas y el historial pasan al que se queda.
 */

export type CampoFusion = {
  clave: string;
  etiqueta: string;
  /** "detalle" = vive dentro del JSON de detalles. */
  donde: "equipo" | "detalle";
  a: string;
  b: string;
};

export type EquipoFusionable = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  estado: string;
  asignado_a: number | null;
  asignado_nombre: string | null;
  created_at: string;
  responsivas: string[];
  mantenimientos: number;
  /** Cuántos datos trae llenos: ayuda a ver cuál está más completo. */
  llenos: number;
  motivo: string;
  /** Los datos que sirven para reconocerlo de un vistazo. */
  ficha: { etiqueta: string; valor: string }[];
};

const ETIQUETAS_EQUIPO: { clave: keyof Equipo; etiqueta: string }[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "tipo", etiqueta: "Tipo" },
  { clave: "categoria", etiqueta: "Categoría" },
  { clave: "marca", etiqueta: "Marca" },
  { clave: "modelo", etiqueta: "Modelo" },
  { clave: "numero_serie", etiqueta: "Número de serie" },
  { clave: "specs", etiqueta: "Características" },
  { clave: "fecha_compra", etiqueta: "Fecha de compra" },
  { clave: "costo", etiqueta: "Costo" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "notas", etiqueta: "Notas" },
];

function detallesDe(e: Equipo): Record<string, string> {
  try {
    const d = e.detalles ? JSON.parse(e.detalles) : {};
    return d && typeof d === "object" ? (d as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Cuántos campos trae con algo escrito. */
function datosLlenos(e: Equipo): number {
  const propios = ETIQUETAS_EQUIPO.filter((c) => String(e[c.clave] ?? "").trim()).length;
  return propios + Object.values(detallesDe(e)).filter((v) => String(v ?? "").trim()).length;
}

const soloAlfaNum = (v: string) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Rellenos que no identifican nada. Sin esto, un inventario donde el número de
 * activo quedó en "0" o "N/A" hacía que todos los equipos parecieran el mismo.
 */
const BASURA = new Set(["", "0", "00", "NA", "ND", "NULL", "NINGUNO", "SIN", "SN", "SINDATO", "NOAPLICA", "PENDIENTE", "X", "XX"]);

function valorUtil(v: string | null | undefined): string {
  const limpio = soloAlfaNum(String(v ?? ""));
  if (limpio.length < 3 || BASURA.has(limpio)) return "";
  return limpio;
}

/** Dos series se parecen si una contiene a la otra o difieren en un carácter. */
function seriesParecidas(a: string, b: string): boolean {
  const x = soloAlfaNum(a);
  const y = soloAlfaNum(b);
  if (!x || !y || x === y) return x === y && !!x;
  if (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x))) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  // Una sola edición de diferencia (un dígito de más, de menos o cambiado).
  const [corta, larga] = x.length <= y.length ? [x, y] : [y, x];
  let i = 0;
  let j = 0;
  let fallos = 0;
  while (i < corta.length && j < larga.length) {
    if (corta[i] === larga[j]) {
      i += 1;
      j += 1;
      continue;
    }
    fallos += 1;
    if (fallos > 1) return false;
    if (corta.length === larga.length) i += 1;
    j += 1;
  }
  return fallos + (larga.length - j) + (corta.length - i) <= 1;
}

/** Los datos con los que una persona reconoce el aparato en la mesa. */
function fichaDe(e: Equipo): { etiqueta: string; valor: string }[] {
  const d = detallesDe(e);
  const campos: [string, string | null | undefined][] = [
    ["Serie", e.numero_serie],
    ["Marca y modelo", `${e.marca} ${e.modelo}`.trim()],
    ["Nombre del equipo", d.nombre_computadora],
    ["No. de activo", d.activo],
    ["IMEI", d.imei],
    ["Línea", d.numero],
    ["Características", e.specs],
    ["Comprado", e.fecha_compra],
  ];
  return campos
    .filter(([, v]) => String(v ?? "").trim())
    .map(([etiqueta, v]) => ({ etiqueta, valor: String(v).trim() }));
}

/** Un equipo con todo lo que hace falta para compararlo con otro. */
function aFusionable(e: Equipo, motivo: string): EquipoFusionable {
  const emp = e.asignado_a
    ? (db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(e.asignado_a) as
        | { numero_empleado: string; nombre: string }
        | undefined)
    : undefined;
  return {
    id: e.id,
    codigo: e.codigo,
    tipo: e.tipo,
    marca: e.marca,
    modelo: e.modelo,
    numero_serie: e.numero_serie,
    estado: e.estado,
    asignado_a: e.asignado_a,
    asignado_nombre: emp ? `${emp.numero_empleado} ${emp.nombre}` : null,
    created_at: e.created_at,
    responsivas: (
      db
        .prepare(
          `SELECT r.folio FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
           WHERE ri.equipo_id = ? AND r.estado != 'ELIMINADA' ORDER BY r.id DESC`
        )
        .all(e.id) as { folio: string }[]
    ).map((r) => r.folio),
    mantenimientos: (db.prepare("SELECT COUNT(*) AS c FROM mantenimientos WHERE equipo_id = ?").get(e.id) as { c: number }).c,
    llenos: datosLlenos(e),
    motivo,
    ficha: fichaDe(e),
  };
}

/**
 * Otros registros del inventario que podrían ser el mismo aparato. No decide
 * nada: son sugerencias para que la persona compare y elija.
 */
export async function candidatosFusion(
  equipoId: number
): Promise<ResultadoAccion & { base?: EquipoFusionable; candidatos?: EquipoFusionable[] }> {
  try {
    const base = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoId) as Equipo | undefined;
    if (!base) return { ok: false, error: "El equipo ya no existe." };

    const otros = db.prepare("SELECT * FROM equipos WHERE id != ?").all(equipoId) as Equipo[];
    const detBase = detallesDe(base);

    // Cuántos equipos comparten cada valor: lo que se repite mucho no sirve.
    const repetidos = new Map<string, number>();
    for (const e of [base, ...otros]) {
  await exigir("ti.ver");
      const d = detallesDe(e);
      for (const clave of ["imei", "numero", "activo", "nombre_computadora"]) {
        const v = valorUtil(d[clave]);
        if (v) repetidos.set(`${clave}:${v}`, (repetidos.get(`${clave}:${v}`) ?? 0) + 1);
      }
    }

    const conMotivo: { equipo: Equipo; motivo: string; peso: number }[] = [];
    for (const o of otros) {
      const det = detallesDe(o);
      const motivos: string[] = [];
      let peso = 0;

      if (base.numero_serie && o.numero_serie && seriesParecidas(base.numero_serie, o.numero_serie)) {
        const iguales = soloAlfaNum(base.numero_serie) === soloAlfaNum(o.numero_serie);
        motivos.push(iguales ? "misma serie" : "serie casi igual");
        peso += iguales ? 100 : 60;
      }
      for (const clave of ["imei", "numero", "activo", "nombre_computadora"]) {
        const x = valorUtil(detBase[clave]);
        const y = valorUtil(det[clave]);
        // Si ese mismo valor lo traen tres o más equipos, no distingue a nadie.
        if (x && x === y && (repetidos.get(`${clave}:${x}`) ?? 0) < 3) {
          motivos.push(`mismo ${clave.replace(/_/g, " ")}`);
          peso += 50;
        }
      }
      if (base.asignado_a && o.asignado_a === base.asignado_a) {
        motivos.push("mismo empleado");
        peso += 20;
      }
      if (soloAlfaNum(base.modelo) && soloAlfaNum(base.modelo) === soloAlfaNum(o.modelo)) {
        motivos.push("mismo modelo");
        peso += 10;
      }

      // Hace falta al menos un dato propio del aparato (serie, IMEI, activo,
      // nombre): compartir empleado y modelo le pasa a media oficina.
      if (peso >= 50) conMotivo.push({ equipo: o, motivo: motivos.join(" · "), peso });
    }

    conMotivo.sort((x, y) => y.peso - x.peso || x.equipo.codigo.localeCompare(y.equipo.codigo));

    return {
      ok: true,
      base: aFusionable(base, "este equipo"),
      candidatos: conMotivo.slice(0, 12).map((c) => aFusionable(c.equipo, c.motivo)),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron buscar equipos parecidos." };
  }
}

/**
 * Busca cualquier equipo del inventario por código, marca, modelo o serie. Las
 * sugerencias no siempre aciertan y quien está frente a los dos aparatos sabe
 * cuál es: esto le deja elegirlo sin pelear con la lista.
 */
export async function buscarParaFusion(
  equipoId: number,
  texto: string
): Promise<ResultadoAccion & { equipos?: EquipoFusionable[]; aviso?: string }> {
  await exigir("ti.ver");
  try {
    const q = (texto || "").trim();
    if (q.length < 2) return { ok: true, equipos: [] };
    const like = `%${q}%`;

    // Se admite buscar por el folio de una carta: devuelve los equipos que
    // ampara. Es lo que la gente escribe cuando tiene la responsiva delante.
    const esFolio = /^(RESP|VALE|HIST)-/i.test(q);
    let aviso = "";
    let filas: Equipo[] = [];

    if (esFolio) {
  await exigir("ti.ver");
      const carta = db.prepare("SELECT id, folio FROM responsivas WHERE folio LIKE ? LIMIT 1").get(like) as
        | { id: number; folio: string }
        | undefined;
      if (carta) {
        filas = db
          .prepare(
            `SELECT e.* FROM equipos e JOIN responsiva_items ri ON ri.equipo_id = e.id
             WHERE ri.responsiva_id = ? AND e.id != ? ORDER BY e.codigo ASC`
          )
          .all(carta.id, equipoId) as Equipo[];
        aviso = filas.length
          ? `${carta.folio} es una carta responsiva; abajo va el equipo que ampara. ` +
            `Ojo: aquí se unen equipos repetidos del inventario, no cartas. Para unir dos cartas, cierra esto y usa ` +
            `“Corregir” en el renglón de la carta.`
          : `${carta.folio} es una carta responsiva y no tiene ningún equipo ligado, por eso no aparece nada. ` +
            `Aquí se unen equipos repetidos del inventario. Si lo que quieres es unir esa carta con otra, cierra esto ` +
            `y usa “Corregir” en su renglón.`;
      } else {
        aviso = `No existe ninguna carta con el folio “${q}”. Y de todos modos, aquí se unen equipos del inventario: ` +
          `busca por código, marca, modelo o serie.`;
      }
    } else {
      filas = db
        .prepare(
          `SELECT * FROM equipos
           WHERE id != ? AND (codigo LIKE ? OR marca LIKE ? OR modelo LIKE ? OR numero_serie LIKE ? OR detalles LIKE ?)
           ORDER BY codigo ASC LIMIT 20`
        )
        .all(equipoId, like, like, like, like, like) as Equipo[];
    }

    const res = await candidatosFusion(equipoId);
    const yaSugeridos = new Set((res.candidatos ?? []).map((c) => c.id));
    return {
      ok: true,
      aviso,
      equipos: filas.filter((e) => !yaSugeridos.has(e.id)).map((e) => aFusionable(e, "elegido a mano")),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo buscar." };
  }
}

/** Los campos de los dos equipos, para compararlos uno junto al otro. */
export async function camposFusion(
  idA: number,
  idB: number
): Promise<ResultadoAccion & { campos?: CampoFusion[] }> {
  await exigir("ti.ver");
  try {
    const a = db.prepare("SELECT * FROM equipos WHERE id = ?").get(idA) as Equipo | undefined;
    const b = db.prepare("SELECT * FROM equipos WHERE id = ?").get(idB) as Equipo | undefined;
    if (!a || !b) return { ok: false, error: "Alguno de los dos equipos ya no existe." };

    const campos: CampoFusion[] = ETIQUETAS_EQUIPO.map((c) => ({
      clave: String(c.clave),
      etiqueta: c.etiqueta,
      donde: "equipo" as const,
      a: a[c.clave] == null ? "" : String(a[c.clave]),
      b: b[c.clave] == null ? "" : String(b[c.clave]),
    }));

    // Los detalles del tipo de los dos (por si uno quedó con el tipo cambiado).
    const detA = detallesDe(a);
    const detB = detallesDe(b);
    const vistos = new Set<string>();
    for (const tipo of [a.tipo, b.tipo] as TipoEquipo[]) {
  await exigir("ti.ver");
      for (const c of CAMPOS_DETALLE[tipo] ?? []) {
        if (vistos.has(c.clave)) continue;
        vistos.add(c.clave);
        campos.push({
          clave: c.clave,
          etiqueta: c.etiqueta,
          donde: "detalle",
          a: String(detA[c.clave] ?? ""),
          b: String(detB[c.clave] ?? ""),
        });
      }
    }
    // Cualquier dato suelto que no esté en la lista del tipo, para no perderlo.
    for (const clave of [...Object.keys(detA), ...Object.keys(detB)]) {
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      campos.push({
        clave,
        etiqueta: clave.replace(/_/g, " "),
        donde: "detalle",
        a: String(detA[clave] ?? ""),
        b: String(detB[clave] ?? ""),
      });
    }

    return { ok: true, campos };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron leer los datos de los equipos." };
  }
}

/**
 * Junta los dos registros en el que se decidió conservar, con los valores
 * elegidos campo por campo. Las responsivas y los mantenimientos de los dos
 * quedan en el que se conserva, y el otro desaparece del inventario.
 */
export async function fusionarEquiposManual(datos: {
  conservarId: number;
  eliminarId: number;
  valores: { clave: string; donde: "equipo" | "detalle"; valor: string }[];
}): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    if (datos.conservarId === datos.eliminarId) return { ok: false, error: "Son el mismo registro." };
    const queda = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.conservarId) as Equipo | undefined;
    const sobra = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.eliminarId) as Equipo | undefined;
    if (!queda || !sobra) return { ok: false, error: "Alguno de los dos equipos ya no existe." };

    // Respaldo antes de tocar nada: la fusión borra un registro.
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const nombreRespaldo = `app-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
      d.getMinutes()
    )}${p(d.getSeconds())}.db`;
    await db.backup(path.join(BACKUP_DIR, nombreRespaldo));

    const permitidos = new Set(ETIQUETAS_EQUIPO.map((c) => String(c.clave)));
    const detalles = detallesDe(queda);
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    for (const v of datos.valores) {
      const valor = (v.valor ?? "").trim();
      if (v.donde === "detalle") {
        if (valor) detalles[v.clave] = valor;
        else delete detalles[v.clave];
        continue;
      }
      if (!permitidos.has(v.clave)) continue;
      sets.push(`${v.clave} = ?`);
      params.push(v.clave === "costo" ? (valor ? Number(valor) : null) : valor || null);
    }

    const foliosMovidos: string[] = [];
    const fusion = db.transaction(() => {
      // Si los dos estaban en la misma carta, el renglón sobrante se quita.
      const compartidas = db
        .prepare(
          `SELECT ri.id FROM responsiva_items ri
           WHERE ri.equipo_id = ? AND ri.responsiva_id IN (SELECT responsiva_id FROM responsiva_items WHERE equipo_id = ?)`
        )
        .all(sobra.id, queda.id) as { id: number }[];
      for (const c of compartidas) db.prepare("DELETE FROM responsiva_items WHERE id = ?").run(c.id);

      const folios = db
        .prepare(
          `SELECT r.folio FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id WHERE ri.equipo_id = ?`
        )
        .all(sobra.id) as { folio: string }[];
      foliosMovidos.push(...folios.map((f) => f.folio));

      db.prepare("UPDATE responsiva_items SET equipo_id = ? WHERE equipo_id = ?").run(queda.id, sobra.id);
      db.prepare("UPDATE mantenimientos SET equipo_id = ? WHERE equipo_id = ?").run(queda.id, sobra.id);

      // El sobrante se borra ANTES de guardar los datos elegidos: si se decidió
      // quedarse con su código, ese código tiene que estar libre (es único).
      db.prepare("DELETE FROM equipos WHERE id = ?").run(sobra.id);

      sets.push("detalles = ?");
      params.push(Object.keys(detalles).length ? JSON.stringify(detalles) : null);
      db.prepare(`UPDATE equipos SET ${sets.join(", ")} WHERE id = ?`).run(...params, queda.id);
    });
    fusion();

    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,?)").run(
      "FUSION_MANUAL",
      `Se unió ${sobra.codigo} con ${queda.codigo}${foliosMovidos.length ? ` (pasaron las responsivas ${foliosMovidos.join(", ")})` : ""}`,
      JSON.stringify({ conservado: queda.id, eliminado: sobra, foliosMovidos, respaldo: nombreRespaldo }),
      0
    );

    revalidar();
    revalidatePath("/empleados");
    revalidatePath("/responsivas");

    const actualizado = db.prepare("SELECT codigo FROM equipos WHERE id = ?").get(queda.id) as { codigo: string };
    return {
      ok: true,
      mensaje:
        `Quedó un solo registro: ${actualizado.codigo}. Se eliminó ${sobra.codigo}` +
        `${foliosMovidos.length ? ` y sus responsivas (${foliosMovidos.join(", ")}) pasaron al que se conservó` : ""}. ` +
        `Respaldo previo: ${nombreRespaldo}`,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: `No se pudo unir: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---------- Revisión de datos repetidos ----------

/**
 * Los dos equipos de un par ya elegido, listos para compararse.
 *
 * `candidatosFusion` sugiere con quién unir; esto es para cuando ya se sabe:
 * desde la revisión de duplicados el par viene dado y no hay nada que elegir.
 */
export async function parejaFusion(
  equipoId: number,
  otroId: number
): Promise<ResultadoAccion & { base?: EquipoFusionable; pareja?: EquipoFusionable }> {
  try {
    if (equipoId === otroId) return { ok: false, error: "Son el mismo registro." };
    const base = db.prepare("SELECT * FROM equipos WHERE id = ?").get(equipoId) as Equipo | undefined;
    const otro = db.prepare("SELECT * FROM equipos WHERE id = ?").get(otroId) as Equipo | undefined;
    if (!base || !otro) return { ok: false, error: "Uno de los dos registros ya no existe." };
    return { ok: true, base: aFusionable(base, "este equipo"), pareja: aFusionable(otro, "dato repetido") };
  } catch (e) {
  await exigir("ti.ver");
    console.error(e);
    return { ok: false, error: "No se pudieron cargar los dos equipos." };
  }
}

/**
 * Marca un dato repetido como ya revisado: son equipos distintos que casualmente
 * comparten ese valor. Deja de aparecer en la revisión, pero queda anotado por
 * si hay que volver a mirarlo.
 */
export async function descartarDuplicado(campo: string, valor: string, nota?: string): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    if (!campo || !valor) return { ok: false, error: "Falta saber qué dato se está descartando." };
    db.prepare(
      "INSERT INTO duplicados_revisados (campo, valor, nota) VALUES (?, ?, ?) ON CONFLICT(campo, valor) DO UPDATE SET nota = excluded.nota"
    ).run(campo, valor, (nota ?? "").trim() || null);
    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "DUPLICADO_DESCARTADO",
      `Se marcó como revisado el ${campo} repetido "${valor}": no son el mismo equipo.`,
      JSON.stringify({ campo, valor, nota: nota ?? "" })
    );
    revalidar();
    revalidatePath("/inventario/duplicados");
    return { ok: true, mensaje: "Listo, ya no aparecerá en la revisión." };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo marcar como revisado." };
  }
}

/** Devuelve a la revisión un dato repetido que se había descartado. */
export async function reabrirDuplicado(campo: string, valor: string): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    db.prepare("DELETE FROM duplicados_revisados WHERE campo = ? AND valor = ?").run(campo, valor);
    revalidar();
    revalidatePath("/inventario/duplicados");
    return { ok: true, mensaje: "Vuelve a estar en la lista por revisar." };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo devolver a la lista." };
  }
}

// ---------- Ubicar equipos por área ----------

/**
 * Pone área y clasificación a varios equipos de una vez.
 *
 * Es lo que hace falta después de importar: 120 aparatos sin área, y editarlos
 * uno por uno no es trabajo de nadie. Solo toca lo que se manda; lo que venga
 * vacío se queda como estaba.
 */
export async function ubicarEquipos(
  cambios: { id: number; departamento?: string; area?: string; clasificacion?: string }[]
): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const utiles = (cambios ?? []).filter(
      (c) => Number.isFinite(c.id) && ((c.departamento ?? "").trim() || (c.area ?? "").trim() || (c.clasificacion ?? "").trim())
    );
    if (!utiles.length) return { ok: false, error: "No hay nada que guardar: llena al menos un área o una clasificación." };

    const antes = new Map<number, Equipo>();
    for (const c of utiles) {
      const eq = db.prepare("SELECT * FROM equipos WHERE id = ?").get(c.id) as Equipo | undefined;
      if (eq) antes.set(c.id, eq);
    }

    const aplicar = db.transaction(() => {
      for (const c of utiles) {
        const eq = antes.get(c.id);
        if (!eq) continue;
        const depto = (c.departamento ?? "").trim();
        const area = (c.area ?? "").trim();
        const clase = (c.clasificacion ?? "").trim();
        db.prepare(
          `UPDATE equipos SET departamento = COALESCE(NULLIF(?,''), departamento),
                              area = COALESCE(NULLIF(?,''), area),
                              clasificacion = COALESCE(NULLIF(?,''), clasificacion)
           WHERE id = ?`
        ).run(depto, area, clase, c.id);
      }
    });
    aplicar();

    for (const c of utiles) {
      const eq = antes.get(c.id);
      if (!eq) continue;
      const depto = (c.departamento ?? "").trim();
      if (depto && depto !== (eq.departamento ?? "")) {
        anotarMovimiento({
          equipoId: c.id,
          accion: "AREA",
          departamento: depto,
          area: (c.area ?? "").trim() || depto,
          detalle: eq.departamento ? `Pasó de ${eq.departamento} a ${depto}` : `Se ubicó en ${depto}`,
        });
      }
    }

    db.prepare("INSERT INTO bitacora (accion, descripcion, snapshot, revertible) VALUES (?,?,?,0)").run(
      "UBICAR_EQUIPOS",
      `Se ubicaron ${utiles.length} equipo(s) por área o clasificación.`,
      JSON.stringify(
        utiles.map((c) => ({
          codigo: antes.get(c.id)?.codigo,
          antes: { departamento: antes.get(c.id)?.departamento, area: antes.get(c.id)?.area, clasificacion: antes.get(c.id)?.clasificacion },
          ahora: { departamento: c.departamento, area: c.area, clasificacion: c.clasificacion },
        }))
      )
    );

    revalidar();
    revalidatePath("/inventario/ubicar");
    return { ok: true, mensaje: `${utiles.length} equipo(s) quedaron ubicados.` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: `No se pudieron ubicar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Sube el archivo actualizador: pone área y clasificación por lotes.
 *
 * El equipo se busca por código y, si no aparece, por número de serie. Una
 * celda vacía no borra nada: deja el dato como está, que es lo que se espera
 * de un archivo que se llena a medias y se sube varias veces.
 */
export async function importarUbicaciones(formData: FormData): Promise<ResultadoAccion> {
  await exigir("ti.editar");
  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || !archivo.size) return { ok: false, error: "Elige el archivo Excel." };

    const filas = await importarDeExcel(
      Buffer.from(await archivo.arrayBuffer()),
      {
        codigo: ["codigo", "código", "clave"],
        serie: ["serie", "numero de serie", "número de serie", "num serie"],
        area: ["area", "área", "area departamento", "área departamento", "departamento"],
        clasificacion: ["clasificacion", "clasificación", "clase", "tipo de equipo"],
      },
      "Actualizar"
    );
    if (!filas.length) return { ok: false, error: "El archivo no trae renglones con Código o Serie." };

    const cambios: { id: number; departamento?: string; area?: string; clasificacion?: string }[] = [];
    const sinEncontrar: string[] = [];
    for (const f of filas) {
      const codigo = (f.codigo ?? "").trim();
      const serie = (f.serie ?? "").trim();
      const area = (f.area ?? "").trim().toUpperCase();
      const clasificacion = (f.clasificacion ?? "").trim().toUpperCase();
      if (!area && !clasificacion) continue;

      const eq = (codigo
        ? db.prepare("SELECT id FROM equipos WHERE UPPER(codigo) = UPPER(?)").get(codigo)
        : undefined) as { id: number } | undefined;
      const porSerie = (!eq && serie
        ? db.prepare("SELECT id FROM equipos WHERE UPPER(REPLACE(numero_serie,' ','')) = UPPER(REPLACE(?,' ',''))").get(serie)
        : undefined) as { id: number } | undefined;
      const encontrado = eq ?? porSerie;
      if (!encontrado) {
        sinEncontrar.push(codigo || serie);
        continue;
      }
      cambios.push({ id: encontrado.id, departamento: area, area, clasificacion });
    }

    if (!cambios.length) {
      return {
        ok: false,
        error: sinEncontrar.length
          ? `Ninguno de los ${sinEncontrar.length} renglones con datos coincide con un equipo del inventario. Revisa el código o la serie: ${sinEncontrar.slice(0, 5).join(", ")}…`
          : "El archivo no trae ningún área ni clasificación que aplicar.",
      };
    }

    const res = await ubicarEquipos(cambios);
    if (!res.ok) return res;
    return {
      ok: true,
      mensaje:
        `${cambios.length} equipo(s) actualizados desde el archivo.` +
        (sinEncontrar.length
          ? ` No se encontraron ${sinEncontrar.length} en el inventario: ${sinEncontrar.slice(0, 8).join(", ")}${sinEncontrar.length > 8 ? "…" : ""}.`
          : ""),
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo. Asegúrate de que sea el Excel del actualizador." };
  }
}
