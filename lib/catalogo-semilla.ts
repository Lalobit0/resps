/**
 * Catálogo documental con el que arranca el módulo.
 *
 * Son los tipos de documento del expediente de personal en México, ya
 * clasificados y con su configuración razonable. NO son una decisión cerrada:
 * todo esto se edita en Configuración → Tipos de documento sin tocar código, y
 * lo que aquí viene sirve para no empezar con una pantalla en blanco.
 *
 * Dos criterios al sembrarlos:
 *
 * 1. La vigencia se marca como FECHA solo en los documentos que traen impresa
 *    su propia fecha de vencimiento (INE, pasaporte, licencias). En los que la
 *    empresa decide cada cuánto se renuevan —certificado médico, capacitación—
 *    se deja SIN vigencia para que RH ponga el plazo que de verdad usa, en vez
 *    de que el sistema invente uno.
 * 2. Ninguno se le pide a nadie todavía. Los requisitos salen de la matriz, y
 *    la matriz empieza vacía: es RH quien decide qué pide a quién.
 */

/**
 * El grupo que trae el sistema de fábrica: las cuatro identificaciones que en
 * México se aceptan indistintamente. Con cualquiera de ellas el empleado tiene
 * cubierta su identificación, y el expediente cuenta el grupo como un solo
 * requisito en vez de cuatro.
 */
export const IDENTIFICACION_OFICIAL = "Identificación oficial";

/**
 * Las licencias de manejo van en su propio apartado.
 *
 * No son una identificación más: la categoría decide si alguien puede o no
 * hacer su trabajo, y confundir una con otra es justo lo que hay que evitar.
 */
export const LICENCIAS_DE_MANEJO = "Licencias de conducir";

export type CategoriaSemilla = { nombre: string; descripcion: string; orden: number };

export const CATEGORIAS_SEMILLA: CategoriaSemilla[] = [
  { nombre: "Identificación", descripcion: "Con qué se acredita quién es la persona.", orden: 10 },
  {
    nombre: LICENCIAS_DE_MANEJO,
    descripcion: "Quién puede manejar qué. La categoría no es un detalle: es lo que habilita el puesto.",
    orden: 15,
  },
  { nombre: "Fiscal", descripcion: "Lo que pide el SAT.", orden: 20 },
  { nombre: "Seguridad social", descripcion: "IMSS, Infonavit y Fonacot.", orden: 30 },
  { nombre: "Laboral", descripcion: "Lo que se firma con la empresa.", orden: 40 },
  { nombre: "Formación", descripcion: "Estudios, capacitación y certificaciones.", orden: 50 },
  { nombre: "Personal", descripcion: "Documentos personales del expediente.", orden: 60 },
  { nombre: "Seguridad e higiene", descripcion: "Salud ocupacional y habilitaciones de puesto.", orden: 70 },
  { nombre: "Bancario", descripcion: "Datos para el pago de nómina.", orden: 80 },
  { nombre: "Otros", descripcion: "Lo que no cae en las demás.", orden: 90 },
];

export type TipoSemilla = {
  codigo: string;
  nombre: string;
  categoria: string;
  descripcion?: string;
  /** SIN | FECHA | DIAS | MESES | ANIOS */
  vigencia?: string;
  vigenciaValor?: number;
  confidencialidad?: string;
  /** Su falta deja el expediente en rojo aunque el resto esté bien. */
  critico?: boolean;
  /** Varios documentos vigentes a la vez bajo el mismo requisito. */
  multiples?: boolean;
  /**
   * Documentos que valen uno por otro. Los que comparten grupo cubren el mismo
   * hueco: con cualquiera de ellos el requisito queda resuelto.
   */
  grupo?: string;
  firmaEmpleado?: boolean;
  notas?: string;
};

export const TIPOS_SEMILLA: TipoSemilla[] = [
  // --- Identificación ---
  { codigo: "INE", nombre: "Credencial para votar (INE)", categoria: "Identificación", vigencia: "FECHA", critico: true, grupo: IDENTIFICACION_OFICIAL, descripcion: "Ambos lados. La vigencia es la que trae impresa." },
  { codigo: "CURP", nombre: "CURP", categoria: "Identificación", critico: true, descripcion: "Impresión del registro nacional de población." },
  { codigo: "PASAPORTE", nombre: "Pasaporte", categoria: "Identificación", vigencia: "FECHA", grupo: IDENTIFICACION_OFICIAL },
  { codigo: "CEDULA_PROFESIONAL", nombre: "Cédula profesional", categoria: "Identificación", grupo: IDENTIFICACION_OFICIAL, descripcion: "También sirve como comprobante de estudios si el puesto lo pide." },
  { codigo: "CARTILLA_MILITAR", nombre: "Cartilla del servicio militar", categoria: "Identificación", grupo: IDENTIFICACION_OFICIAL },
  { codigo: "VISA", nombre: "Visa", categoria: "Identificación", vigencia: "FECHA" },

  // --- Licencias de conducir ---
  // La licencia federal (SICT) se divide en categorías y cada una habilita un
  // tipo de vehículo distinto. Las descripciones están para que RH sepa cuál
  // pedir sin tener que consultar la norma, pero conviene confirmarlas contra
  // una licencia real: el texto se edita desde Configuración.
  {
    codigo: "LICENCIA_CONDUCIR",
    nombre: "Licencia de conducir estatal",
    categoria: LICENCIAS_DE_MANEJO,
    vigencia: "FECHA",
    descripcion: "La que expide el estado. Sirve para manejar dentro de la ciudad, no para transporte federal.",
  },
  {
    codigo: "LICENCIA_FED_A",
    nombre: "Licencia federal · Categoría A",
    categoria: LICENCIAS_DE_MANEJO,
    vigencia: "FECHA",
    critico: true,
    descripcion: "Pasaje y turismo: autobuses. Confirma la categoría contra la licencia física.",
  },
  {
    codigo: "LICENCIA_FED_B",
    nombre: "Licencia federal · Categoría B",
    categoria: LICENCIAS_DE_MANEJO,
    vigencia: "FECHA",
    critico: true,
    descripcion: "Carga general: tractocamión y camión de carga. Es la de los choferes de reparto y traslado.",
  },
  {
    codigo: "LICENCIA_FED_C",
    nombre: "Licencia federal · Categoría C",
    categoria: LICENCIAS_DE_MANEJO,
    vigencia: "FECHA",
    critico: true,
    descripcion: "Chofer-guía de turismo. Confirma la categoría contra la licencia física.",
  },
  {
    codigo: "LICENCIA_FED_DE",
    nombre: "Licencia federal · Categoría D/E",
    categoria: LICENCIAS_DE_MANEJO,
    vigencia: "FECHA",
    critico: true,
    descripcion: "Servicios auxiliares (grúas, arrastre) y materiales o residuos peligrosos. Confirma cuál de las dos trae la licencia.",
  },

  // --- Fiscal ---
  { codigo: "RFC", nombre: "RFC", categoria: "Fiscal", critico: true },
  { codigo: "CSF", nombre: "Constancia de situación fiscal", categoria: "Fiscal", descripcion: "Conviene renovarla cada año; pon la vigencia que maneje RH.", critico: true },

  // --- Seguridad social ---
  { codigo: "NSS", nombre: "Número de seguridad social", categoria: "Seguridad social", critico: true },
  { codigo: "INFONAVIT", nombre: "Documentación de Infonavit", categoria: "Seguridad social", confidencialidad: "RESTRINGIDO" },
  { codigo: "FONACOT", nombre: "Documentación de Fonacot", categoria: "Seguridad social", confidencialidad: "RESTRINGIDO" },

  // --- Laboral ---
  { codigo: "CONTRATO", nombre: "Contrato individual de trabajo", categoria: "Laboral", critico: true, firmaEmpleado: true },
  { codigo: "AVISO_PRIVACIDAD", nombre: "Aviso de privacidad firmado", categoria: "Laboral", firmaEmpleado: true },
  { codigo: "CONFIDENCIALIDAD", nombre: "Carta de confidencialidad", categoria: "Laboral", firmaEmpleado: true },
  { codigo: "ANTECEDENTES", nombre: "Carta de no antecedentes penales", categoria: "Laboral", confidencialidad: "RESTRINGIDO", descripcion: "Suele pedirse reciente; define su vigencia si aplica." },
  { codigo: "SOLICITUD_EMPLEO", nombre: "Solicitud de empleo", categoria: "Laboral" },

  // --- Formación ---
  { codigo: "ESTUDIOS", nombre: "Comprobante de estudios", categoria: "Formación", descripcion: "Certificado, título o cédula, según el puesto." },
  { codigo: "DC3", nombre: "DC-3 · Constancia de competencias", categoria: "Formación", multiples: true, descripcion: "Formato de la STPS. Un empleado puede tener varias." },
  { codigo: "CAPACITACION", nombre: "Constancia de capacitación", categoria: "Formación", multiples: true },
  { codigo: "CERTIFICACION", nombre: "Certificación", categoria: "Formación", vigencia: "FECHA", multiples: true },

  // --- Personal ---
  { codigo: "ACTA_NACIMIENTO", nombre: "Acta de nacimiento", categoria: "Personal", critico: true },
  { codigo: "DOMICILIO", nombre: "Comprobante de domicilio", categoria: "Personal", descripcion: "Se pide reciente; ponle vigencia en meses si RH lo renueva." },
  { codigo: "FOTOGRAFIA", nombre: "Fotografía", categoria: "Personal" },

  // --- Seguridad e higiene ---
  { codigo: "CERT_MEDICO", nombre: "Certificado médico", categoria: "Seguridad e higiene", confidencialidad: "CONFIDENCIAL", descripcion: "Dato sensible. Define cada cuánto se renueva en tu empresa." },
  { codigo: "EXAMEN_MEDICO", nombre: "Examen médico ocupacional", categoria: "Seguridad e higiene", confidencialidad: "CONFIDENCIAL", multiples: true },
  { codigo: "LICENCIA_MONTACARGAS", nombre: "Licencia de montacargas", categoria: "Seguridad e higiene", vigencia: "FECHA", critico: true, descripcion: "Habilitación de puesto: sin ella no puede operar." },
  { codigo: "DOC_SEGURIDAD", nombre: "Documentación de seguridad", categoria: "Seguridad e higiene", multiples: true, descripcion: "Entrega de equipo de protección, reglamentos, inducción." },

  // --- Bancario ---
  { codigo: "BANCARIO", nombre: "Documentación bancaria", categoria: "Bancario", confidencialidad: "CONFIDENCIAL", descripcion: "Carátula de estado de cuenta o CLABE para la nómina." },

  // --- Otros ---
  { codigo: "ESPECIFICO_PUESTO", nombre: "Documentación específica del puesto", categoria: "Otros", multiples: true },
];

/**
 * El paquete que casi cualquier empresa mexicana pide a todo su personal.
 *
 * No se aplica solo: aparece como un botón en la configuración de la matriz,
 * para que RH lo revise antes de que el sistema empiece a exigir documentos.
 */
export const PAQUETE_BASICO = [
  "INE",
  "CURP",
  "RFC",
  "NSS",
  "ACTA_NACIMIENTO",
  "DOMICILIO",
  "CONTRATO",
  "AVISO_PRIVACIDAD",
];
