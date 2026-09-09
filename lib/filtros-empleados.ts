/**
 * Lo que se le puede preguntar a la lista de empleados.
 *
 * Antes la lista solo dejaba filtrar por departamento, clase y "con o sin
 * cómputo". Pero las preguntas que se hacen de verdad son otras: quiénes
 * firmaron la carta de Wi-Fi, a quién le falta, quién trae un vale de
 * descuento vigente, quién tiene mantenimiento programado.
 *
 * Cada condición se define una sola vez, con la subconsulta que la cuenta, y
 * de ahí salen las tres cosas: las columnas que trae la página, las pastillas
 * de la pantalla y el WHERE de las exportaciones a Excel y PDF. Así el Excel
 * baja exactamente lo que se está viendo.
 *
 * Este archivo no toca la base de datos, así que el cliente puede importarlo.
 */

export type GrupoCondicion = "Equipos" | "Cartas" | "Pendientes" | "Otros";

export type CondicionEmpleado = {
  clave: string;
  etiqueta: string;
  grupo: GrupoCondicion;
  /** Qué significa la pastilla cuando se pide que sí, y cuando se pide que no. */
  ayuda: string;
  /**
   * Subconsulta que cuenta el hecho para el empleado `e`. Mayor que cero
   * quiere decir "sí lo tiene". Es texto de este archivo, nunca del usuario.
   */
  sql: string;
};

const equiposDeTipo = (tipo: string) =>
  `SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id AND q.tipo = '${tipo}'`;

export const CONDICIONES_EMPLEADO: CondicionEmpleado[] = [
  {
    clave: "computo",
    etiqueta: "Cómputo",
    grupo: "Equipos",
    ayuda: "Tiene computadora o laptop asignada",
    sql: equiposDeTipo("COMPUTO"),
  },
  {
    clave: "celular",
    etiqueta: "Celular",
    grupo: "Equipos",
    ayuda: "Tiene teléfono de la empresa",
    sql: equiposDeTipo("CELULAR"),
  },
  {
    clave: "radio",
    etiqueta: "Radio",
    grupo: "Equipos",
    ayuda: "Tiene radio asignado",
    sql: equiposDeTipo("RADIO"),
  },
  {
    clave: "otro",
    etiqueta: "Otro equipo",
    grupo: "Equipos",
    ayuda: "Tiene algún equipo que no es cómputo, celular ni radio",
    sql: `SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id AND q.tipo NOT IN ('COMPUTO','CELULAR','RADIO')`,
  },
  {
    clave: "equipo",
    etiqueta: "Algún equipo",
    grupo: "Equipos",
    ayuda: "Trae cualquier equipo a su nombre",
    sql: `SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id`,
  },
  {
    clave: "wifi",
    etiqueta: "Carta de Wi-Fi",
    grupo: "Cartas",
    ayuda: "Tiene la responsiva de uso de la red Wi-Fi",
    sql: `SELECT COUNT(*) FROM responsivas r
          WHERE r.empleado_id = e.id AND r.clase = 'WIFI' AND r.estado != 'ELIMINADA'`,
  },
  {
    clave: "carta_computo",
    etiqueta: "Carta de cómputo",
    grupo: "Cartas",
    ayuda: "Tiene responsiva vigente de equipo de cómputo",
    sql: `SELECT COUNT(*) FROM responsivas r
          WHERE r.empleado_id = e.id AND r.clase = 'COMPUTO'
            AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'`,
  },
  {
    clave: "vale",
    etiqueta: "Vale de descuento",
    grupo: "Cartas",
    ayuda: "Trae un vale de descuento vigente",
    sql: `SELECT COUNT(*) FROM responsivas r
          WHERE r.empleado_id = e.id AND r.clase = 'VALE' AND r.estado = 'VIGENTE'`,
  },
  {
    clave: "sin_responsiva",
    etiqueta: "Equipo sin carta",
    grupo: "Pendientes",
    ayuda: "Tiene equipo entregado que ninguna responsiva vigente respalda",
    sql: `SELECT COUNT(*) FROM equipos q
          WHERE q.asignado_a = e.id AND q.estado = 'ASIGNADO'
            AND NOT EXISTS (
              SELECT 1 FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
              WHERE ri.equipo_id = q.id AND r.tipo = 'ASIGNACION' AND r.estado = 'VIGENTE'
                AND r.empleado_id = e.id)`,
  },
  {
    clave: "sin_firma",
    etiqueta: "Carta sin firmar",
    grupo: "Pendientes",
    ayuda: "Tiene cartas generadas que nunca regresaron firmadas",
    sql: `SELECT COUNT(*) FROM responsivas r
          WHERE r.empleado_id = e.id AND r.estado != 'ELIMINADA'
            AND r.pdf_firmado IS NULL AND COALESCE(r.origen, '') != 'CARGADA'`,
  },
  {
    clave: "mantenimiento",
    etiqueta: "Mantenimiento programado",
    grupo: "Pendientes",
    ayuda: "Alguno de sus equipos tiene mantenimiento por hacerse",
    sql: `SELECT COUNT(*) FROM mantenimientos m JOIN equipos q ON q.id = m.equipo_id
          WHERE q.asignado_a = e.id AND m.estado = 'PROGRAMADO'`,
  },
  {
    clave: "gafete",
    etiqueta: "Gafete de acceso",
    grupo: "Otros",
    ayuda: "Tiene gafete activo en la matriz de accesos",
    sql: `SELECT COUNT(*) FROM gafetes g WHERE g.empleado_id = e.id AND g.estado = 'ACTIVO'`,
  },
  {
    clave: "expediente",
    etiqueta: "Documentos en expediente",
    grupo: "Otros",
    ayuda: "Tiene al menos un documento cargado en su expediente",
    sql: `SELECT COUNT(*) FROM documentos d WHERE d.empleado_id = e.id AND d.situacion = 'ACTIVO'`,
  },
];

/** El orden en que se pintan los grupos de pastillas. */
export const GRUPOS_CONDICION: GrupoCondicion[] = ["Equipos", "Cartas", "Pendientes", "Otros"];

/** Sí lo tiene / no lo tiene. Sin entrada en el mapa, la condición no se pide. */
export type Pedido = "si" | "no";
export type Condiciones = Record<string, Pedido>;

/** El nombre de la columna con la que viaja cada condición desde el servidor. */
export function columnaDe(clave: string): string {
  return `c_${clave}`;
}

/** El SELECT que agrega una columna por condición a la consulta de empleados. */
export function columnasDeCondiciones(): string {
  return CONDICIONES_EMPLEADO.map((c) => `(${c.sql}) AS ${columnaDe(c.clave)}`).join(",\n         ");
}

/** "computo:si,wifi:no" — lo que viaja en la URL de las exportaciones. */
export function serializarCondiciones(cond: Condiciones): string {
  return Object.entries(cond)
    .filter(([, v]) => v === "si" || v === "no")
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

export function leerCondiciones(texto: string): Condiciones {
  const validas = new Set(CONDICIONES_EMPLEADO.map((c) => c.clave));
  const salida: Condiciones = {};
  for (const parte of (texto || "").split(",")) {
    const [clave, valor] = parte.split(":");
    // Solo se aceptan claves del catálogo: lo que llega por la URL nunca se
    // vuelve SQL, únicamente escoge cuál de las subconsultas de arriba se usa.
    if (validas.has(clave) && (valor === "si" || valor === "no")) salida[clave] = valor;
  }
  return salida;
}

/** Las condiciones pedidas, ya como pedazos de WHERE para la exportación. */
export function condicionesASql(texto: string): string[] {
  const pedidas = leerCondiciones(texto);
  return CONDICIONES_EMPLEADO.filter((c) => pedidas[c.clave]).map(
    (c) => `(${c.sql}) ${pedidas[c.clave] === "si" ? "> 0" : "= 0"}`
  );
}
