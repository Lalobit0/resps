"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { CAMPOS_DETALLE, TIPO_DEFAULTS, TIPOS_EQUIPO, type TipoEquipo } from "../../lib/constants";
import { importarDeExcel, type Mapeo } from "../../lib/importar";
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

function tieneResponsivaVigente(equipoId: number): boolean {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
       WHERE ri.equipo_id = ? AND r.tipo='ASIGNACION' AND r.estado='VIGENTE'`
    )
    .get(equipoId) as { c: number };
  return r.c > 0;
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

    // Duplicados: misma serie o mismo IMEI en otro equipo.
    const serieTrim = datos.numero_serie.trim();
    const idActual = datos.id ?? -1;
    if (serieTrim) {
      const dupSerie = db
        .prepare("SELECT codigo FROM equipos WHERE numero_serie = ? AND id != ?")
        .get(serieTrim, idActual) as { codigo: string } | undefined;
      if (dupSerie) return { ok: false, error: `La serie ${serieTrim} ya está registrada en el equipo ${dupSerie.codigo}.` };
    }
    if (detalles.imei) {
      const dupImei = db
        .prepare("SELECT codigo FROM equipos WHERE json_extract(detalles, '$.imei') = ? AND id != ?")
        .get(detalles.imei, idActual) as { codigo: string } | undefined;
      if (dupImei) return { ok: false, error: `El IMEI ${detalles.imei} ya está registrado en el equipo ${dupImei.codigo}.` };
    }

    const specs = componerSpecs(tipo, detalles);
    const detallesJson = Object.keys(detalles).length ? JSON.stringify(detalles) : null;
    let codigo = datos.codigo.trim().toUpperCase();
    const estadoLibre = ["DISPONIBLE", "MANTENIMIENTO", "BAJA"].includes(datos.estado) ? datos.estado : "DISPONIBLE";

    if (datos.id) {
      const actual = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.id) as Equipo | undefined;
      if (!actual) return { ok: false, error: "El equipo ya no existe." };
      if (!codigo) codigo = actual.codigo;

      const vigente = tieneResponsivaVigente(datos.id);
      // Responsiva vigente => lo controla el flujo de devolución.
      // Asignación importada (sin responsiva) => se conserva si no la cambian.
      let estadoFinal: string;
      let asignadoFinal: number | null;
      if (vigente) {
        estadoFinal = "ASIGNADO";
        asignadoFinal = actual.asignado_a;
      } else if (datos.estado === "ASIGNADO" && actual.asignado_a) {
        estadoFinal = "ASIGNADO";
        asignadoFinal = actual.asignado_a;
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
      const info = db
        .prepare(
          "INSERT INTO equipos (codigo, tipo, categoria, marca, modelo, numero_serie, specs, detalles, fecha_compra, costo, estado, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
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
          estadoLibre,
          datos.notas.trim() || null
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
      const buscarPorSerie = db.prepare("SELECT id, codigo FROM equipos WHERE numero_serie = ? AND numero_serie IS NOT NULL");

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

        const existente = serie ? (buscarPorSerie.get(serie) as { id: number } | undefined) : undefined;
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
          nuevos++;
        }
      }
    });
    proceso();

    revalidar();
    const partes = [`${nuevos} nuevos`, `${actualizados} actualizados`, `${vinculados} ligados a empleado`];
    if (omitidos) partes.push(`${omitidos} omitidos`);

    // Aviso de posibles duplicados (misma serie o mismo IMEI en más de un equipo).
    const dupSerie = (db
      .prepare(
        "SELECT COUNT(*) AS c FROM (SELECT numero_serie FROM equipos WHERE numero_serie IS NOT NULL AND numero_serie != '' GROUP BY numero_serie HAVING COUNT(*) > 1)"
      )
      .get() as { c: number }).c;
    const dupImei = (db
      .prepare(
        "SELECT COUNT(*) AS c FROM (SELECT json_extract(detalles,'$.imei') AS im FROM equipos WHERE im IS NOT NULL AND im != '' GROUP BY im HAVING COUNT(*) > 1)"
      )
      .get() as { c: number }).c;
    const avisos: string[] = [];
    if (dupSerie) avisos.push(`${dupSerie} serie(s) repetida(s)`);
    if (dupImei) avisos.push(`${dupImei} IMEI repetido(s)`);
    const aviso = avisos.length ? ` ⚠️ Revisa: ${avisos.join(" y ")}.` : "";
    return { ok: true, mensaje: `Importación lista: ${partes.join(", ")}.${aviso}` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo. Asegúrate de que sea un Excel (.xlsx) válido." };
  }
}
