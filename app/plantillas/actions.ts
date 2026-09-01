"use server";

import { revalidatePath } from "next/cache";
import { db, getConfig } from "../../lib/db";
import { generarCarta, type FilaCarta } from "../../lib/pdf";
import { llenarPlantilla } from "../../lib/plantilla";
import { filasEquipo, filasUsuario, partirPlantilla } from "../../lib/carta";
import { CARTAS, ETIQ_EMPLEADO, ETIQ_RH, ETIQ_SISTEMAS, type ClaseCarta } from "../../lib/constants";
import { fechaCorta, fechaLarga, hoyISO, montoEnLetra } from "../../lib/helpers";
import type { Empleado, Equipo, ResultadoAccion } from "../../lib/types";
import { exigir } from "../../lib/auth";

export async function guardarPlantilla(clave: string, contenido: string): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    if (!contenido.trim()) return { ok: false, error: "La plantilla no puede quedar vacía." };
    // El marcador {{tabla_equipo}} es opcional (la carta de Wi-Fi y el vale no llevan tabla de equipo).
    db.prepare("UPDATE plantillas SET contenido = ? WHERE clave = ?").run(contenido, clave);
    revalidatePath("/plantillas");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la plantilla." };
  }
}

export async function guardarConfig(datos: {
  app_nombre: string;
  empresa: string;
  ciudad: string;
  entrega_default: string;
  direccion: string;
  firma_empleado: string;
  firma_sistemas: string;
  firma_rh: string;
}): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    const upsert = db.prepare(
      "INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
    );
    upsert.run("app_nombre", datos.app_nombre.trim().slice(0, 40) || "Control Sultana");
    upsert.run("empresa", datos.empresa.trim() || "Sultana Packaging");
    upsert.run("ciudad", datos.ciudad.trim() || "Tijuana, Baja California");
    upsert.run("entrega_default", datos.entrega_default.trim() || "Departamento de TI");
    upsert.run("direccion", datos.direccion.trim());
    // Textos bajo las líneas de firma de las cartas.
    upsert.run("firma_empleado", datos.firma_empleado.trim() || ETIQ_EMPLEADO);
    upsert.run("firma_sistemas", datos.firma_sistemas.trim() || ETIQ_SISTEMAS);
    upsert.run("firma_rh", datos.firma_rh.trim() || ETIQ_RH);
    revalidatePath("/plantillas");
    revalidatePath("/responsivas");
    revalidatePath("/responsivas/nueva");
    // El nombre del sistema se lee en el menú, que vive en el layout.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la configuración." };
  }
}

// ---------- Vista previa ----------
const EMP_DEMO: Empleado = {
  id: 0,
  numero_empleado: "0001",
  nombre: "Juan Pérez López (ejemplo)",
  puesto: "Supervisor de Producción",
  departamento: "Producción",
  area: "PRODUCCIÓN",
  clase: "ADMINISTRATIVOS",
  supervisor: "María García Torres",
  fecha_alta: "2018-05-01",
  correo: null,
  telefono: null,
  activo: 1,
  fecha_baja: null,
  motivo_baja: null,
  created_at: "",
};

function equipoDemo(tipo: string, detalles: Record<string, string>): Equipo {
  return {
    id: 0,
    codigo: "SP-EJEMPLO-001",
    tipo,
    categoria: tipo,
    marca: detalles.__marca || "DELL",
    modelo: detalles.__modelo || "VOSTRO",
    numero_serie: detalles.__serie || "EJEMPLO123",
    specs: null,
    detalles: JSON.stringify(detalles),
    fecha_compra: null,
    costo: null,
    estado: "DISPONIBLE",
    asignado_a: null,
    departamento: null,
    area: null,
    clasificacion: null,
    notas: null,
    created_at: "",
  };
}

const EQ_DEMO: Record<string, Equipo> = {
  COMPUTO: equipoDemo("COMPUTO", {
    __marca: "DELL",
    __modelo: "VOSTRO",
    __serie: "BKY6F93",
    activo: "A-102",
    nombre_computadora: "SPK-EJEMPLO-W",
    descripcion: "DELL WINDOWS 11 PRO 1TB 8GB RAM",
    accesorios: "Cargador",
    monitor: 'LG 24" Full HD',
  }),
  CELULAR: equipoDemo("CELULAR", {
    __marca: "Apple",
    __modelo: "iPhone 17",
    __serie: "F2LXK9ABC",
    imei: "356789012345678",
    numero: "664-155-2210",
    plan: "7.5 GB",
    condicion: "Nuevo",
    accesorios: "Cargador y funda",
    descripcion: "iPhone 17 128 GB",
  }),
  OTROS: equipoDemo("RADIO", {
    __marca: "TXPRO",
    __modelo: "TK-320",
    __serie: "2312A04938",
    num_equipo: "533",
    estado_radio: "Funciona",
    auricular: "Sí tiene",
    comentarios: "Ejemplo",
  }),
};

export async function previsualizarPlantilla(clave: string, contenido: string): Promise<ResultadoAccion & { pdf?: string }> {
  await exigir("config.administrar");
  try {
    if (!contenido.trim()) return { ok: false, error: "La plantilla está vacía." };
    const fecha = hoyISO();
    const datosMarcadores: Record<string, string> = {
      fecha: fechaLarga(fecha),
      ciudad: getConfig("ciudad"),
      empresa: getConfig("empresa"),
      nombre_empleado: EMP_DEMO.nombre,
      numero_empleado: EMP_DEMO.numero_empleado,
      puesto: EMP_DEMO.puesto,
      departamento: EMP_DEMO.departamento,
      observaciones: "",
      folio: "EJEMPLO-2026-001",
      folio_origen: "RESP-2026-001",
      concepto: "RADIO PORTÁTIL TXPRO",
      monto: montoEnLetra(450),
    };
    const { intro, cuerpo } = partirPlantilla(llenarPlantilla(contenido, datosMarcadores));

    const entrada = (Object.entries(CARTAS) as [ClaseCarta, (typeof CARTAS)[ClaseCarta]][]).find(
      ([, c]) => c.plantilla === clave
    );

    let base: {
      encabezado?: string;
      titulo: string;
      filasUsuario: FilaCarta[];
      filasEquipo: FilaCarta[];
      etiquetaIzq: string;
      etiquetaDer: string;
      sustituye: boolean;
    };

    if (entrada) {
  await exigir("config.administrar");
      const [claseCarta, cfg] = entrada;
      const equipoDemoUso = cfg.tiposEquipo.length ? EQ_DEMO[claseCarta] : undefined;
      base = {
        encabezado: cfg.encabezado,
        titulo: cfg.titulo,
        filasUsuario: cfg.esVale ? [] : filasUsuario(EMP_DEMO),
        filasEquipo: equipoDemoUso ? filasEquipo(claseCarta, equipoDemoUso) : [],
        etiquetaIzq: cfg.esVale ? "EMPLEADO — Firma de conformidad" : "Nombre, Firma y No. de empleado quien recibe",
        etiquetaDer: cfg.esVale ? getConfig("firma_rh", ETIQ_RH) : getConfig("firma_sistemas", ETIQ_SISTEMAS),
        sustituye: !cfg.esVale && claseCarta !== "WIFI",
      };
    } else {
      // devolución u otra plantilla con tabla genérica
      base = {
        titulo: "DE DEVOLUCIÓN DE EQUIPO",
        filasUsuario: filasUsuario(EMP_DEMO),
        filasEquipo: [
          { etiqueta: "Código", valor: "SP-EJEMPLO-001" },
          { etiqueta: "Equipo", valor: "DELL VOSTRO" },
          { etiqueta: "Serie", valor: "BKY6F93" },
          { etiqueta: "Condición al devolver", valor: "Buen estado" },
        ],
        etiquetaIzq: "Nombre, Firma y No. de empleado que entrega",
        etiquetaDer: getConfig("firma_sistemas", ETIQ_SISTEMAS),
        sustituye: false,
      };
    }

    const bytes = await generarCarta({
      encabezado: base.encabezado,
      titulo: base.titulo,
      fecha: fechaCorta(fecha),
      folio: "EJEMPLO",
      empresa: getConfig("empresa"),
      direccion: getConfig("direccion"),
      filasUsuario: base.filasUsuario,
      intro,
      filasEquipo: base.filasEquipo,
      cuerpo,
      firma: null,
      etiquetaIzq: base.etiquetaIzq,
      etiquetaDer: base.etiquetaDer,
      sustituye: base.sustituye,
    });

    return { ok: true, pdf: Buffer.from(bytes).toString("base64") };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo generar la vista previa." };
  }
}
