export const CATEGORIAS = [
  "Laptop",
  "Desktop",
  "Celular",
  "Tablet",
  "Monitor",
  "Impresora",
  "Radio",
  "Accesorio",
  "Red / Telecom",
  "Otro",
] as const;

export const PREFIJO_CATEGORIA: Record<string, string> = {
  Laptop: "LAP",
  Desktop: "DES",
  Celular: "CEL",
  Tablet: "TAB",
  Monitor: "MON",
  Impresora: "IMP",
  Radio: "RAD",
  Accesorio: "ACC",
  "Red / Telecom": "RED",
  Otro: "OTR",
};

export const ESTADOS_EQUIPO = ["DISPONIBLE", "ASIGNADO", "MANTENIMIENTO", "BAJA"] as const;

export const ETIQUETA_ESTADO: Record<string, string> = {
  DISPONIBLE: "Disponible",
  ASIGNADO: "Asignado",
  MANTENIMIENTO: "En mantenimiento",
  BAJA: "Baja",
};

export const TIPOS_MANTENIMIENTO = ["PREVENTIVO", "CORRECTIVO"] as const;

export const ETIQUETA_MANTENIMIENTO: Record<string, string> = {
  PREVENTIVO: "Preventivo",
  CORRECTIVO: "Correctivo",
};

export const ESTADOS_MANTENIMIENTO: Record<string, string> = {
  PROGRAMADO: "Programado",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export const CONDICIONES_DEVOLUCION = ["Buen estado", "Con detalles menores", "Dañado"] as const;

// ---------- Tipos de equipo del inventario ----------
export const TIPOS_EQUIPO = ["COMPUTO", "CELULAR", "RADIO", "OTRO"] as const;
export type TipoEquipo = (typeof TIPOS_EQUIPO)[number];

export const ETIQUETA_TIPO: Record<string, string> = {
  COMPUTO: "Cómputo",
  CELULAR: "Teléfono / Celular",
  RADIO: "Radio",
  OTRO: "Otro equipo",
};

// Categoría por defecto y prefijo de código sugerido por tipo
export const TIPO_DEFAULTS: Record<TipoEquipo, { categoria: string; prefijo: string }> = {
  COMPUTO: { categoria: "Desktop", prefijo: "PC" },
  CELULAR: { categoria: "Celular", prefijo: "CEL" },
  RADIO: { categoria: "Radio", prefijo: "RAD" },
  OTRO: { categoria: "Otro", prefijo: "OTR" },
};

// Campos de detalle (JSON) que se capturan por tipo de equipo.
// Si un campo trae `opciones`, se captura con lista desplegable en vez de texto libre.
// `permitirOtro` agrega la opción "Otro (escribir)…" para capturar un valor libre.
export type OpcionCampo = { valor: string; etiqueta: string };
export type CampoDetalle = { clave: string; etiqueta: string; opciones?: OpcionCampo[]; permitirOtro?: boolean };

/**
 * Cómo está clasificado el equipo, que no es lo mismo que qué aparato es.
 * Una computadora puede ser administrativa, de piso de producción o de una
 * sala de juntas, y se compra, se revisa y se reemplaza distinto en cada caso.
 * La lista admite escribir otra: cada empresa nombra sus áreas a su manera.
 */
export const CLASIFICACIONES_EQUIPO: OpcionCampo[] = [
  { valor: "ADMINISTRATIVO", etiqueta: "Administrativo" },
  { valor: "PRODUCCION", etiqueta: "Producción" },
  { valor: "SALA", etiqueta: "Sala de juntas" },
  { valor: "GERENCIAL", etiqueta: "Gerencial / Dirección" },
  { valor: "COMPARTIDO", etiqueta: "Compartido / Uso común" },
];

export const ETIQUETA_CLASIFICACION: Record<string, string> = Object.fromEntries(
  CLASIFICACIONES_EQUIPO.map((c) => [c.valor, c.etiqueta])
);


const lista = (valores: string[]): OpcionCampo[] => valores.map((v) => ({ valor: v, etiqueta: v }));

// Marcas de equipo de cómputo (con opción de escribir otra).
export const OPCIONES_MARCA_COMPUTO: OpcionCampo[] = lista(["DELL", "LENOVO", "HP"]);
// Memoria RAM (GB).
export const OPCIONES_RAM: OpcionCampo[] = lista(["8 GB", "12 GB", "16 GB", "24 GB", "32 GB", "40 GB", "48 GB"]);
// Disco duro (con opción de escribir otro).
export const OPCIONES_HD: OpcionCampo[] = lista(["256 GB", "512 GB", "1 TB", "2 TB"]);

// Planes Telcel que se manejan actualmente (tarifario vigente).
export const PLANES_CELULAR = [
  { plan: "TELCEL EMPRESA CONTROLADO 2", precio: "$329.00", gb: "6 GB" },
  { plan: "TELCEL EMPRESA CONTROLADO 3", precio: "$429.00", gb: "7.2 GB" },
  { plan: "TELCEL EMPRESA CONTROLADO 4", precio: "$549.00", gb: "12 GB" },
  { plan: "TELCEL EMPRESA 5", precio: "$599.00", gb: "24 GB" },
] as const;

export const OPCIONES_PLAN_CELULAR: OpcionCampo[] = PLANES_CELULAR.map((p) => ({
  valor: p.plan,
  etiqueta: `${p.plan} · ${p.gb} · ${p.precio}`,
}));

export const OPCIONES_PRECIO_PLAN: OpcionCampo[] = PLANES_CELULAR.map((p) => ({
  valor: p.precio,
  etiqueta: `${p.precio} (${p.plan})`,
}));

// Para autollenar el precio al elegir el plan.
export const PRECIO_POR_PLAN: Record<string, string> = Object.fromEntries(
  PLANES_CELULAR.map((p) => [p.plan, p.precio])
);

export const OPCIONES_CONDICION: OpcionCampo[] = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "USADO", etiqueta: "Usado" },
  { valor: "REEMPLAZO", etiqueta: "Reemplazo" },
];

export const CAMPOS_DETALLE: Record<TipoEquipo, CampoDetalle[]> = {
  COMPUTO: [
    { clave: "nombre_computadora", etiqueta: "Nombre de la computadora" },
    { clave: "procesador", etiqueta: "Procesador" },
    { clave: "ram", etiqueta: "Memoria RAM", opciones: OPCIONES_RAM },
    { clave: "hd", etiqueta: "Disco duro", opciones: OPCIONES_HD, permitirOtro: true },
    { clave: "sistema_operativo", etiqueta: "Sistema operativo" },
    { clave: "ip", etiqueta: "Dirección IP" },
    { clave: "activo", etiqueta: "No. de activo" },
    { clave: "descripcion", etiqueta: "Descripción del equipo" },
    { clave: "accesorios", etiqueta: "Accesorios" },
    { clave: "discos", etiqueta: "Discos (detalle)" },
    { clave: "arquitectura", etiqueta: "Arquitectura" },
    { clave: "monitor", etiqueta: "Monitor (marca / modelo)" },
    { clave: "monitor_serie", etiqueta: "Serie del monitor" },
  ],
  CELULAR: [
    { clave: "numero", etiqueta: "Número (línea)" },
    { clave: "imei", etiqueta: "IMEI" },
    { clave: "imei2", etiqueta: "IMEI 2" },
    { clave: "plan", etiqueta: "Plan", opciones: OPCIONES_PLAN_CELULAR },
    { clave: "plan_precio", etiqueta: "Precio del plan", opciones: OPCIONES_PRECIO_PLAN },
    { clave: "pin", etiqueta: "PIN" },
    { clave: "icloud", etiqueta: "iCloud / cuenta" },
    { clave: "icloud_password", etiqueta: "Contraseña (cuenta / iCloud)" },
    { clave: "mac", etiqueta: "MAC" },
    { clave: "region", etiqueta: "Región" },
    { clave: "cuenta_padre", etiqueta: "Cuenta padre" },
    { clave: "cuenta", etiqueta: "Cuenta" },
    { clave: "condicion", etiqueta: "Condición", opciones: OPCIONES_CONDICION },
    { clave: "descripcion", etiqueta: "Descripción" },
    { clave: "accesorios", etiqueta: "Accesorios" },
  ],
  RADIO: [
    { clave: "num_equipo", etiqueta: "No. de equipo" },
    { clave: "estado_radio", etiqueta: "Estado del radio" },
    { clave: "fallas", etiqueta: "Fallas" },
    { clave: "auricular", etiqueta: "Auricular" },
    { clave: "comentarios", etiqueta: "Comentarios" },
  ],
  OTRO: [
    { clave: "nombre_equipo", etiqueta: "Nombre del equipo" },
    { clave: "descripcion", etiqueta: "Descripción del equipo" },
    { clave: "accesorios", etiqueta: "Accesorios" },
  ],
};

// ---------- Clases de carta responsiva ----------
export const CLASES_CARTA = ["COMPUTO", "CELULAR", "OTROS", "WIFI", "VALE"] as const;
export type ClaseCarta = (typeof CLASES_CARTA)[number];

export type ConfigCarta = {
  etiqueta: string; // para menús
  titulo: string; // subtítulo del PDF
  encabezado?: string; // encabezado principal (por defecto "CARTA RESPONSIVA")
  plantilla: string; // clave en tabla plantillas
  tiposEquipo: TipoEquipo[]; // qué equipos se pueden asignar (vacío = sin equipo)
  esVale?: boolean; // usa campos concepto/monto en vez de equipo
};

export const ETIQUETA_CLASE: Record<string, string> = {
  COMPUTO: "Cómputo",
  CELULAR: "Celular",
  OTROS: "Otros equipos",
  WIFI: "Red Wi-Fi",
  VALE: "Vale de descuento",
};

// Clase de carta que corresponde a cada tipo de equipo del inventario.
// Permite elegir primero el equipo y que el tipo de carta se ajuste solo.
export const CLASE_POR_TIPO: Record<TipoEquipo, ClaseCarta> = {
  COMPUTO: "COMPUTO",
  CELULAR: "CELULAR",
  RADIO: "OTROS",
  OTRO: "OTROS",
};

// ---------- Firmas de la empresa ----------
export const ROLES_FIRMA = ["SISTEMAS", "RH", "OTRO"] as const;
export type RolFirma = (typeof ROLES_FIRMA)[number];

export const ETIQUETA_ROL_FIRMA: Record<RolFirma, string> = {
  SISTEMAS: "Jefe de sistemas",
  RH: "Encargado de Recursos Humanos",
  OTRO: "Otra persona (firma por ausencia)",
};

/** Rol que corresponde firmar según la clase de carta. */
export function rolRequerido(clase: string): RolFirma {
  return clase === "VALE" ? "RH" : "SISTEMAS";
}

/** Quién firma del lado de la empresa según la clase de carta. */
export function rolAutoridad(clase: string): string {
  return clase === "VALE" ? "Encargado de RH" : "Jefe de sistemas";
}

/** Una firma de otro rol al que toca firmar se registra "por ausencia" del titular. */
export function esPorAusencia(clase: string, rolFirma: string): boolean {
  return rolFirma !== rolRequerido(clase);
}

export const CARTAS: Record<ClaseCarta, ConfigCarta> = {
  COMPUTO: {
    etiqueta: "Equipo de cómputo",
    titulo: "DE ASIGNACIÓN DE EQUIPO DE CÓMPUTO",
    plantilla: "carta_computo",
    tiposEquipo: ["COMPUTO"],
  },
  CELULAR: {
    etiqueta: "Equipo celular",
    titulo: "DE ASIGNACIÓN DE EQUIPO CELULAR",
    plantilla: "carta_celular",
    tiposEquipo: ["CELULAR"],
  },
  OTROS: {
    etiqueta: "Otros equipos (radio, etc.)",
    titulo: "DE ASIGNACIÓN DE OTROS EQUIPOS",
    plantilla: "carta_otros",
    tiposEquipo: ["RADIO", "OTRO"],
  },
  WIFI: {
    etiqueta: "Acceso a red Wi-Fi",
    titulo: "PARA EL USO DE RED WI-FI EMPRESARIAL",
    plantilla: "carta_wifi",
    tiposEquipo: [],
  },
  VALE: {
    etiqueta: "Vale de descuento de nómina",
    titulo: "",
    encabezado: "VALE DE DESCUENTO DE NÓMINA",
    plantilla: "vale_descuento",
    tiposEquipo: [],
    esVale: true,
  },
};

// Textos bajo las líneas de firma de las cartas. Se pueden cambiar desde
// "Plantillas y datos"; estos son los valores por defecto.
export const ETIQ_EMPLEADO = "Nombre, Firma y No. de empleado quien recibe";
export const ETIQ_SISTEMAS = "Nombre y firma del Jefe de sistemas";
export const ETIQ_RH = "RECURSOS HUMANOS";
