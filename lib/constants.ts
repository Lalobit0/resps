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

// Campos de detalle (JSON) que se capturan por tipo de equipo
export type CampoDetalle = { clave: string; etiqueta: string };

export const CAMPOS_DETALLE: Record<TipoEquipo, CampoDetalle[]> = {
  COMPUTO: [
    { clave: "nombre_computadora", etiqueta: "Nombre de la computadora" },
    { clave: "procesador", etiqueta: "Procesador" },
    { clave: "ram", etiqueta: "Memoria RAM" },
    { clave: "hd", etiqueta: "Disco duro" },
    { clave: "sistema_operativo", etiqueta: "Sistema operativo" },
    { clave: "ip", etiqueta: "Dirección IP" },
    { clave: "activo", etiqueta: "No. de activo" },
    { clave: "descripcion", etiqueta: "Descripción del equipo" },
    { clave: "accesorios", etiqueta: "Accesorios" },
    { clave: "monitor", etiqueta: "Monitor" },
  ],
  CELULAR: [
    { clave: "numero", etiqueta: "Número (línea)" },
    { clave: "imei", etiqueta: "IMEI" },
    { clave: "imei2", etiqueta: "IMEI 2" },
    { clave: "plan", etiqueta: "Plan" },
    { clave: "plan_precio", etiqueta: "Precio del plan" },
    { clave: "pin", etiqueta: "PIN" },
    { clave: "icloud", etiqueta: "iCloud / cuenta" },
    { clave: "mac", etiqueta: "MAC" },
    { clave: "region", etiqueta: "Región" },
    { clave: "cuenta_padre", etiqueta: "Cuenta padre" },
    { clave: "cuenta", etiqueta: "Cuenta" },
    { clave: "condicion", etiqueta: "Condición" },
    { clave: "descripcion", etiqueta: "Descripción" },
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
export const CLASES_CARTA = ["COMPUTO", "CELULAR", "OTROS", "WIFI"] as const;
export type ClaseCarta = (typeof CLASES_CARTA)[number];

export type ConfigCarta = {
  etiqueta: string; // para menús
  titulo: string; // subtítulo del PDF
  plantilla: string; // clave en tabla plantillas
  tiposEquipo: TipoEquipo[]; // qué equipos se pueden asignar (vacío = sin equipo)
};

export const ETIQUETA_CLASE: Record<string, string> = {
  COMPUTO: "Cómputo",
  CELULAR: "Celular",
  OTROS: "Otros equipos",
  WIFI: "Red Wi-Fi",
};

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
};
