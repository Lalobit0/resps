export const CATEGORIAS = [
  "Laptop",
  "Desktop",
  "Celular",
  "Tablet",
  "Monitor",
  "Impresora",
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
