/**
 * Catálogo de los formatos de Revisiones-IT. Cada uno declara sus puntos y sus
 * campos propios; la pantalla de captura y el PDF se arman solos a partir de
 * aquí, así que dar de alta un formato nuevo es añadirlo a esta lista.
 */

export type CampoExtra = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "area" | "opciones" | "fecha";
  opciones?: string[];
  ancho?: number;
};

export type TipoRevision = {
  clave: string;
  codigo: string;
  nombre: string;
  titulo: string;
  descripcion: string;
  /** Prefijo del folio: FSI04-2026-001. */
  prefijo: string;
  /** Necesita un equipo del inventario (no solo el empleado). */
  requiereEquipo: boolean;
  /** Puntos con casilla Sí/No; lo que marca la revisión. */
  puntos: string[];
  /** Campos propios del formato. */
  extras: CampoExtra[];
  /** Está confirmado contra el documento controlado oficial. */
  confirmado: boolean;
};

export const TIPOS_REVISION: TipoRevision[] = [
  {
    clave: "FSI04",
    codigo: "FSI-04 Rev.00",
    nombre: "Bitácora de conexión remota",
    titulo: "BITACORA CONEXION REMOTA",
    descripcion: "Revisión remota del equipo de un usuario: qué se revisó y qué se encontró.",
    prefijo: "FSI04",
    requiereEquipo: true,
    puntos: [
      "Equipo bloqueado",
      "Internet",
      "Páginas de trabajo",
      "Carpetas",
      "Carpetas de depto.",
      "Accesos",
      "Contraseñas",
      "Software",
      "Teams",
    ],
    extras: [
      {
        clave: "tipo_revision",
        etiqueta: "Tipo de revisión",
        tipo: "opciones",
        opciones: ["Programada", "Por reporte del usuario", "Seguimiento", "Extraordinaria"],
      },
      { clave: "evidencia", etiqueta: "Evidencia", tipo: "texto" },
    ],
    confirmado: true,
  },
  {
    clave: "FSI03",
    codigo: "FSI-03 Rev.00",
    nombre: "Bitácora de revisión de sistemas",
    titulo: "BITACORA DE REVISION DE SISTEMAS",
    descripcion: "Revisión del equipo en sitio: estado del hardware, software y respaldos.",
    prefijo: "FSI03",
    requiereEquipo: true,
    puntos: [
      "Sistema operativo actualizado",
      "Antivirus vigente",
      "Respaldo de información",
      "Software autorizado",
      "Limpieza física",
      "Perifericos completos",
      "Conectividad de red",
      "Cuentas y accesos",
    ],
    extras: [
      {
        clave: "tipo_revision",
        etiqueta: "Tipo de revisión",
        tipo: "opciones",
        opciones: ["Programada", "Por reporte del usuario", "Seguimiento"],
      },
      { clave: "acciones", etiqueta: "Acciones realizadas", tipo: "area" },
    ],
    // Pendiente de cotejar contra el documento controlado: falta el PDF oficial.
    confirmado: false,
  },
  {
    clave: "FSI05",
    codigo: "FSI-05 Rev.00",
    nombre: "Baja y disposición final de equipo informático",
    titulo: "BAJA Y DISPOSICION FINAL DE EQUIPO INFORMATICO",
    descripcion: "Retiro definitivo de un equipo del inventario y qué se hizo con él.",
    prefijo: "FSI05",
    requiereEquipo: true,
    puntos: [
      "Información respaldada",
      "Borrado seguro de datos",
      "Licencias liberadas",
      "Cuentas y accesos retirados",
      "Equipo desinventariado",
      "Accesorios recuperados",
    ],
    extras: [
      {
        clave: "motivo",
        etiqueta: "Motivo de la baja",
        tipo: "opciones",
        opciones: ["Fin de vida útil", "Daño irreparable", "Obsolescencia", "Robo o extravío", "Reemplazo"],
      },
      {
        clave: "disposicion",
        etiqueta: "Disposición final",
        tipo: "opciones",
        opciones: ["Almacén de resguardo", "Reciclaje electrónico", "Donación", "Venta", "Destrucción", "Proveedor / garantía"],
      },
      { clave: "destino", etiqueta: "Destinatario o responsable del retiro", tipo: "texto" },
      { clave: "estado_fisico", etiqueta: "Estado físico del equipo", tipo: "texto" },
    ],
    confirmado: false,
  },
];

export function tipoRevision(clave: string): TipoRevision | undefined {
  return TIPOS_REVISION.find((t) => t.clave === clave);
}
