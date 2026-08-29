import { db, getConfig } from "./db";
import { generarCarta } from "./pdf";
import { llenarPlantilla } from "./plantilla";
import { filasEquipo, filasUsuario, partirPlantilla } from "./carta";
import { CARTAS, ETIQ_EMPLEADO, ETIQ_RH, ETIQ_SISTEMAS, type ClaseCarta } from "./constants";
import { fechaCorta, fechaLarga, montoEnLetra } from "./helpers";
import type { Empleado, Equipo } from "./types";

/**
 * El PDF de una carta, armado en un solo lugar.
 *
 * Vive aparte de las acciones porque no solo se usa al guardar: la vista
 * previa arma el mismo documento sin escribir nada, y así lo que se ve en
 * pantalla es exactamente lo que va a salir impreso —no una imitación que se
 * desfase la próxima vez que alguien cambie la plantilla.
 */

export type Firmante = { nombre?: string | null; puesto?: string | null; ausencia?: boolean };

export function contenidoPlantilla(clave: string): string {
  const r = db.prepare("SELECT contenido FROM plantillas WHERE clave = ?").get(clave) as { contenido: string } | undefined;
  return r?.contenido ?? "{{tabla_equipo}}";
}

/** Quién firma del lado de la empresa, con la salvedad de las ausencias. */
export function etiquetaAutoridad(clase: ClaseCarta, firmante: Firmante | null): string {
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

export type DatosCarta = {
  clase: ClaseCarta;
  folio: string;
  fecha: string;
  observaciones: string | null;
  concepto: string | null;
  monto: number | null;
  /** El precio con letra, tal como está en el catálogo. */
  montoTexto?: string | null;
  firmaEmpleado: string | null;
  firmaAutoridad: string | null;
  firmante: Firmante | null;
  empleado: Empleado;
  equipo: Equipo | undefined;
};

/** Arma el PDF de una carta de asignación con los datos que se le pasen. */
export async function bytesAsignacion(datos: DatosCarta): Promise<Uint8Array> {
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
    // El precio se escribe como lo trae el catálogo de RH; si no está ahí, se
    // arma del número.
    monto: datos.montoTexto?.trim() || (datos.monto != null ? montoEnLetra(datos.monto) : ""),
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
