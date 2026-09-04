import { db, getConfig } from "./db";
import { generarCarta } from "./pdf";
import { dato, generarVale } from "./pdf-vale";
import { llenarPlantilla } from "./plantilla";
import { filasEquipo, filasUsuario, partirPlantilla } from "./carta";
import { CARTAS, ETIQ_EMPLEADO, ETIQ_RH, ETIQ_SISTEMAS, type ClaseCarta } from "./constants";
import { fechaCorta, fechaLarga, montoEnLetra } from "./helpers";
import { conceptoValePorNombre, plantillaDeClausula } from "./vales";
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
  /** Cuál cláusula lleva el vale: EQUIPO o CONSUMIBLE. */
  clausula?: string | null;
  firmaEmpleado: string | null;
  firmaAutoridad: string | null;
  firmante: Firmante | null;
  empleado: Empleado;
  equipo: Equipo | undefined;
};

/**
 * El precio como se escribe en el vale.
 *
 * Se prefiere el texto del catálogo, que es el que RH trae en su formato con
 * su redacción exacta —"POR PIEZA", el ocasional error de dedo—. Al regenerar
 * un vale viejo ese texto no viene en la responsiva, así que se rescata del
 * catálogo por el nombre del concepto; solo si tampoco está ahí se arma del
 * número, que ya sale con otra redacción.
 */
function precioEnLetra(datos: DatosCarta): string {
  const guardado = datos.montoTexto?.trim();
  if (guardado) return guardado;

  const nombre = datos.concepto?.trim();
  const delCatalogo = nombre ? conceptoValePorNombre(nombre)?.texto?.trim() : "";
  if (delCatalogo) return delCatalogo;

  return datos.monto != null ? montoEnLetra(datos.monto) : "";
}

/** Arma el PDF de una carta de asignación con los datos que se le pasen. */
export async function bytesAsignacion(datos: DatosCarta): Promise<Uint8Array> {
  const config = CARTAS[datos.clase];

  // El vale no es una carta: es un formulario con espacios en blanco, y se
  // arma con su propio motor para que salga como el papel de RH.
  if (config.esVale) return bytesVale(datos, config.encabezado ?? "VALE DE DESCUENTO DE NÓMINA");

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
    monto: precioEnLetra(datos),
  });
  const { intro, cuerpo } = partirPlantilla(plantilla);

  return generarCarta({
    encabezado: config.encabezado,
    titulo: config.titulo,
    fecha: fechaCorta(datos.fecha),
    folio: datos.folio,
    empresa: getConfig("empresa"),
    direccion: getConfig("direccion"),
    filasUsuario: filasUsuario(datos.empleado),
    intro,
    filasEquipo: datos.equipo ? filasEquipo(datos.clase, datos.equipo) : [],
    cuerpo,
    firma: datos.firmaEmpleado,
    firmaDer: datos.firmaAutoridad,
    etiquetaIzq: getConfig("firma_empleado", ETIQ_EMPLEADO),
    etiquetaDer: etiquetaAutoridad(datos.clase, datos.firmante),
    sustituye: datos.clase !== "WIFI",
  });
}

/**
 * El PDF del vale de descuento.
 *
 * Los datos que imprime el sistema —nombre, número de empleado, concepto y
 * precio— se envuelven con `dato()` para que salgan en negritas, como en el
 * formato de papel; el resto de la plantilla se queda tal cual, con sus rayas
 * en blanco para que el empleado las llene al firmar.
 */
async function bytesVale(datos: DatosCarta, encabezado: string): Promise<Uint8Array> {
  // Un radio se entrega y el descuento se cancela; una playera ya no se puede
  // recibir de vuelta. Cada caso tiene su cláusula, y su plantilla.
  const clausula = datos.clausula?.trim() || conceptoValePorNombre(datos.concepto?.trim() ?? "")?.clausula;
  const cuerpo = llenarPlantilla(contenidoPlantilla(plantillaDeClausula(clausula)), {
    fecha: fechaLarga(datos.fecha),
    ciudad: getConfig("ciudad"),
    empresa: getConfig("empresa"),
    nombre_empleado: dato(datos.empleado.nombre),
    numero_empleado: dato(datos.empleado.numero_empleado),
    puesto: datos.empleado.puesto ?? "",
    departamento: datos.empleado.departamento ?? "",
    observaciones: "",
    folio: datos.folio,
    concepto: dato(datos.concepto?.trim() || ""),
    monto: dato(precioEnLetra(datos)),
  });

  return generarVale({
    razonSocial: getConfig("razon_social", getConfig("empresa").toUpperCase()),
    encabezado,
    cuerpo,
    folio: datos.folio,
    empresa: getConfig("empresa"),
    direccion: getConfig("direccion"),
    firmaEmpleado: datos.firmaEmpleado,
    firmaAutoridad: datos.firmaAutoridad,
    etiquetaEmpleado: ["EMPLEADO", "FIRMA DE CONFORMIDAD"],
    // El titular de RH es quien firma; si firmó otro por ausencia, la etiqueta
    // ya lo dice y se parte en renglones para que quepa bajo la raya.
    etiquetaAutoridad: etiquetaAutoridad(datos.clase, datos.firmante).split(" — "),
  });
}
