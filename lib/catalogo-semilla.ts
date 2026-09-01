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

export type CategoriaSemilla = { nombre: string; descripcion: string; orden: number };

export const CATEGORIAS_SEMILLA: CategoriaSemilla[] = [
  { nombre: "Identificación", descripcion: "Con qué se acredita quién es la persona.", orden: 10 },
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
  firmaEmpleado?: boolean;
  notas?: string;
};

export const TIPOS_SEMILLA: TipoSemilla[] = [
  // --- Identificación ---
  { codigo: "INE", nombre: "Credencial para votar (INE)", categoria: "Identificación", vigencia: "FECHA", critico: true, descripcion: "Ambos lados. La vigencia es la que trae impresa." },
  { codigo: "CURP", nombre: "CURP", categoria: "Identificación", critico: true, descripcion: "Impresión del registro nacional de población." },
  { codigo: "PASAPORTE", nombre: "Pasaporte", categoria: "Identificación", vigencia: "FECHA" },
  { codigo: "LICENCIA_CONDUCIR", nombre: "Licencia de conducir", categoria: "Identificación", vigencia: "FECHA" },
  { codigo: "VISA", nombre: "Visa", categoria: "Identificación", vigencia: "FECHA" },

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
