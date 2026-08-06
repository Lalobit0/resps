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
import type { Equipo, ResultadoAccion } from "../../lib/types";

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
  /** Empleado al que se le entrega. null = queda libre. */
  asignado_a?: number | null;
}): Promise<ResultadoAccion> {
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
        `UPDATE equipos SET codigo=?, tipo=?, categoria=?, marca=?, modelo=?, numero_serie=?, specs=?, detalles=?, fecha_compra=?, costo=?, estado=?, asignado_a=?, notas=? WHERE id=?`
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
          "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, fecha_compra, costo, estado, notas, asignado_a) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
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
          nuevoAsignado
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
export async function importarEscaneoComputo(formData: FormData): Promise<ResultadoAccion> {
  try {
    const archivos = formData.getAll("archivo").filter((a): a is File => a instanceof File);
    if (!archivos.length) return { ok: false, error: "No se recibió ningún archivo." };

    // El script genera un archivo por computadora, así que se pueden subir
    // varios de un jalón, o el ZIP con todos dentro.
    const filas: Awaited<ReturnType<typeof leerEscaneo>> = [];
    const ilegibles: string[] = [];
    for (const archivo of archivos) {
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

    const nuevos: string[] = [];
    const cambiados: string[] = [];
    const ligados: string[] = [];
    const idsLigados: number[] = [];
    const sinEmpleado: string[] = [];
    const sinSerie: string[] = [];
    let iguales = 0;

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
          if (empleado && existente.asignado_a !== empleado.id) {
            const vigente = responsivaVigenteDe(existente.id);
            if (vigente && vigente.empleado_id !== empleado.id) {
              sinEmpleado.push(
                `${existente.codigo} lo usa ${empleado.numero_empleado} ${empleado.nombre} pero tiene la responsiva ` +
                  `${vigente.folio} vigente a nombre de otra persona: registra la devolución antes de cambiarlo.`
              );
            } else {
              asignado = empleado.id;
              ligados.push(`${existente.codigo} → ${empleado.numero_empleado} ${empleado.nombre}`);
              idsLigados.push(existente.id);
            }
          } else if (numEmp && !empleado) {
            sinEmpleado.push(`${existente.codigo}: el número de empleado ${numEmp} no existe en el sistema`);
          }

          if (!diferencias.length && asignado === existente.asignado_a) {
            iguales += 1;
            continue;
          }
          if (diferencias.length) {
            cambiados.push(`${existente.codigo} (${serie}) — ${diferencias.join("; ")}`);
          }
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
          if (numEmp && !empleado) sinEmpleado.push(`serie ${serie}: el número de empleado ${numEmp} no existe en el sistema`);

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
          nuevos.push(
            `${codigo} ${(f.marca ?? "").trim()} ${(f.modelo ?? "").trim()} (${serie})` +
              (empleado ? ` → ${empleado.numero_empleado} ${empleado.nombre}` : " — sin empleado")
          );
          if (empleado) {
            ligados.push(`${codigo} → ${empleado.numero_empleado} ${empleado.nombre}`);
            idsLigados.push(Number(info.lastInsertRowid));
          }
        }
      }
    });
    proceso();

    revalidar();
    revalidatePath("/empleados");

    const bloque = (titulo: string, lista: string[], tope = 25) =>
      lista.length ? `\n\n${titulo} (${lista.length}):\n· ${lista.slice(0, tope).join("\n· ")}${lista.length > tope ? `\n· …y ${lista.length - tope} más` : ""}` : "";

    // De lo que quedó ligado, cuáles siguen sin carta firmada.
    const pendientes = idsLigados.length ? idsSinResponsiva() : new Set<number>();
    const porFirmar = idsLigados.filter((id) => pendientes.has(id)).length;

    const resumen =
      `Se leyeron ${filas.length} equipos del escaneo: ${nuevos.length} nuevos, ${cambiados.length} actualizados, ` +
      `${iguales} ya estaban al día, ${ligados.length} ligados a su empleado.` +
      (porFirmar
        ? `\n\n📄 ${porFirmar} de ellos quedaron entregados SIN carta responsiva: genérala con "Ver los que faltan" ` +
          `de aquí arriba, o desde la ficha del empleado.`
        : "") +
      bloque("Ligados a su empleado", ligados) +
      bloque("Datos actualizados", cambiados) +
      bloque("Altas nuevas", nuevos) +
      bloque("Requieren revisión", [...sinEmpleado, ...sinSerie]) +
      bloque("Archivos que no se pudieron leer", ilegibles);

    return { ok: true, mensaje: resumen };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo del escaneo. Acepta CSV, TSV, JSON o Excel." };
  }
}
