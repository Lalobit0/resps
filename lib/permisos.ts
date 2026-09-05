/**
 * Qué puede hacer cada quien.
 *
 * El permiso es la unidad, no el rol: un rol es nada más un paquete de
 * permisos con nombre. Así se puede crear "Analista de RH que además valida"
 * sin tocar el código, que es lo que pide el punto 41 de la especificación.
 *
 * Los permisos viven aquí (el código los nombra, tienen que existir) y los
 * roles viven en la base (se editan desde Configuración → Usuarios y roles).
 */

export type Permiso = (typeof PERMISOS)[number]["clave"];

export const PERMISOS = [
  // --- Sistema ---
  { clave: "usuarios.administrar", grupo: "Sistema", nombre: "Administrar usuarios y roles", ayuda: "Crear personas, asignarles rol y cambiar qué puede hacer cada rol." },
  { clave: "config.administrar", grupo: "Sistema", nombre: "Configuración general", ayuda: "Plantillas, datos de la empresa, firmas y respaldos." },
  { clave: "auditoria.ver", grupo: "Sistema", nombre: "Ver la bitácora", ayuda: "Consultar el rastro de quién hizo qué y cuándo." },

  // --- Personal (la tabla de empleados es compartida por TI y RH) ---
  { clave: "empleados.ver", grupo: "Personal", nombre: "Ver el directorio de personal", ayuda: "Consultar la lista de empleados y su ficha." },
  { clave: "empleados.editar", grupo: "Personal", nombre: "Dar de alta, editar y dar de baja personal", ayuda: "Modificar la ficha del empleado y registrar su baja." },
  { clave: "gafetes.ver", grupo: "Personal", nombre: "Ver la matriz de gafetes", ayuda: "Consultar quién tiene qué gafete y qué puertas abre." },
  { clave: "gafetes.editar", grupo: "Personal", nombre: "Asignar gafetes y accesos", ayuda: "Dar de alta gafetes, cambiar su perfil y configurar puertas y perfiles." },

  // --- Inventario y responsivas (lo que ya existía) ---
  { clave: "ti.ver", grupo: "Tecnología", nombre: "Ver inventario y responsivas", ayuda: "Consultar equipos, líneas, cartas responsivas y mantenimientos." },
  { clave: "ti.editar", grupo: "Tecnología", nombre: "Mover inventario y generar responsivas", ayuda: "Dar de alta equipos, asignarlos, generar cartas y vales." },

  // --- Expedientes digitales ---
  { clave: "exp.ver", grupo: "Expedientes", nombre: "Ver expedientes", ayuda: "Entrar al expediente de un empleado y ver qué le falta." },
  { clave: "exp.ver_documentos", grupo: "Expedientes", nombre: "Abrir documentos", ayuda: "Ver el archivo en pantalla, no solo saber que existe." },
  { clave: "exp.ver_confidencial", grupo: "Expedientes", nombre: "Abrir documentos confidenciales", ayuda: "Información médica, bancaria, legal o disciplinaria." },
  { clave: "exp.descargar", grupo: "Expedientes", nombre: "Descargar documentos", ayuda: "Bajar el archivo a la computadora. Queda registrado quién lo bajó." },
  { clave: "exp.cargar", grupo: "Expedientes", nombre: "Cargar documentos", ayuda: "Subir archivos al expediente y capturar sus datos." },
  { clave: "exp.validar", grupo: "Expedientes", nombre: "Validar documentos", ayuda: "Dar por bueno un documento cargado." },
  { clave: "exp.rechazar", grupo: "Expedientes", nombre: "Rechazar documentos", ayuda: "Devolver un documento con motivo para que lo repongan." },
  { clave: "exp.editar_metadatos", grupo: "Expedientes", nombre: "Corregir datos de un documento", ayuda: "Fechas, folio, entidad emisora y notas." },
  { clave: "exp.eliminar", grupo: "Expedientes", nombre: "Archivar o eliminar documentos", ayuda: "Mandar a la papelera. La eliminación definitiva pide confirmación aparte." },
  { clave: "exp.no_aplica", grupo: "Expedientes", nombre: "Marcar requisitos como no aplica", ayuda: "Con motivo obligatorio y registro de quién lo marcó." },
  { clave: "exp.requisitos", grupo: "Expedientes", nombre: "Agregar o quitar requisitos a un empleado", ayuda: "Excepciones manuales sobre lo que dicta la matriz." },
  { clave: "exp.comentar", grupo: "Expedientes", nombre: "Comentar en el expediente", ayuda: "Notas internas de RH o visibles para el empleado." },
  { clave: "exp.exportar", grupo: "Expedientes", nombre: "Exportar listados y reportes", ayuda: "Sacar a Excel. Queda registrado." },
  { clave: "exp.tablero", grupo: "Expedientes", nombre: "Ver el tablero de cumplimiento", ayuda: "Indicadores y pendientes de todo el personal." },
  { clave: "exp.configurar", grupo: "Expedientes", nombre: "Configurar el catálogo documental", ayuda: "Tipos de documento, categorías, vigencias y matriz de requisitos." },
] as const;

export const GRUPOS_PERMISO = ["Sistema", "Personal", "Tecnología", "Expedientes"] as const;

export const CLAVES_PERMISO: Permiso[] = PERMISOS.map((p) => p.clave);

export function permisosDelGrupo(grupo: string) {
  return PERMISOS.filter((p) => p.grupo === grupo);
}

export function nombrePermiso(clave: string): string {
  return PERMISOS.find((p) => p.clave === clave)?.nombre ?? clave;
}

/**
 * Roles que trae el sistema de fábrica.
 *
 * Son un punto de partida editable, no una camisa de fuerza: quien tenga
 * "usuarios.administrar" puede palomear o despalomear permisos de cada rol, y
 * crear roles nuevos.
 */
export type RolSemilla = {
  clave: string;
  nombre: string;
  descripcion: string;
  /** El superadministrador no se limita con la lista: siempre puede todo. */
  todo?: boolean;
  permisos: Permiso[];
};

const TODOS_EXP: Permiso[] = [
  "exp.ver",
  "exp.ver_documentos",
  "exp.ver_confidencial",
  "exp.descargar",
  "exp.cargar",
  "exp.validar",
  "exp.rechazar",
  "exp.editar_metadatos",
  "exp.eliminar",
  "exp.no_aplica",
  "exp.requisitos",
  "exp.comentar",
  "exp.exportar",
  "exp.tablero",
  "exp.configurar",
];

export const ROLES_SEMILLA: RolSemilla[] = [
  {
    clave: "SUPERADMIN",
    nombre: "Superadministrador",
    descripcion: "Configura el sistema completo. Es el único que administra usuarios y roles.",
    todo: true,
    permisos: [],
  },
  {
    clave: "ADMIN_RH",
    nombre: "Administrador de RH",
    descripcion: "Manda en Recursos Humanos: configura el catálogo documental, valida, corrige y ve todo el expediente.",
    permisos: [...TODOS_EXP, "empleados.ver", "empleados.editar", "gafetes.ver", "gafetes.editar", "auditoria.ver"],
  },
  {
    clave: "ANALISTA_RH",
    nombre: "Analista de RH",
    descripcion: "Trabaja el día a día: carga documentos, los captura y da seguimiento. No valida ni ve lo confidencial.",
    permisos: [
      "exp.ver",
      "exp.ver_documentos",
      "exp.descargar",
      "exp.cargar",
      "exp.editar_metadatos",
      "exp.comentar",
      "exp.tablero",
      "exp.exportar",
      "empleados.ver",
      "gafetes.ver",
      "gafetes.editar",
    ],
  },
  {
    clave: "VALIDADOR_RH",
    nombre: "Validador de RH",
    descripcion: "Revisa lo que se cargó y decide si pasa o se rechaza. No carga ni corrige.",
    permisos: [
      "exp.ver",
      "exp.ver_documentos",
      "exp.validar",
      "exp.rechazar",
      "exp.comentar",
      "exp.tablero",
      "empleados.ver",
      "gafetes.ver",
    ],
  },
  {
    clave: "AUDITOR",
    nombre: "Auditor",
    descripcion: "Solo lectura. Ve el cumplimiento y la bitácora, no toca nada.",
    permisos: [
      "exp.ver",
      "exp.ver_documentos",
      "exp.tablero",
      "exp.exportar",
      "auditoria.ver",
      "empleados.ver",
      "gafetes.ver",
    ],
  },
  {
    clave: "SISTEMAS",
    nombre: "Sistemas / TI",
    descripcion: "Inventario, responsivas, líneas y mantenimientos. No entra a los expedientes de RH.",
    permisos: [
      "ti.ver",
      "ti.editar",
      "empleados.ver",
      "empleados.editar",
      "gafetes.ver",
      "config.administrar",
      "auditoria.ver",
    ],
  },
];
