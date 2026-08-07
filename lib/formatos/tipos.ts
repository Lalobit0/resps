/**
 * Catálogo de los formatos de Revisiones-IT, cotejados contra los documentos
 * controlados. Cada uno declara sus secciones, sus campos y sus puntos de
 * revisión; la pantalla de captura y el PDF se arman a partir de aquí, así que
 * dar de alta un formato nuevo es describirlo, no volver a programar.
 */

export type CampoExtra = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "area" | "opciones" | "fecha" | "auto";
  opciones?: string[];
  /** Parte del ancho de la hoja que ocupa (1 = todo el renglón). */
  ancho?: number;
  /** De dónde se llena solo: datos del equipo que ya tiene el sistema. */
  origen?: "procesador" | "ram" | "so" | "hostname" | "activo" | "serie" | "marca_modelo" | "tipo_equipo" | "ubicacion";
};

export type SeccionFormato = { titulo: string; campos: CampoExtra[] };

/** Un bloque de puntos con casilla Sí/No; el FSI-03 los agrupa en columnas. */
export type GrupoPuntos = { titulo: string; puntos: string[] };

export type TipoRevision = {
  clave: string;
  codigo: string;
  nombre: string;
  titulo: string;
  descripcion: string;
  prefijo: string;
  requiereEquipo: boolean;
  /** Muestra los datos del usuario y del equipo al principio del documento. */
  encabezadoEstandar: boolean;
  secciones: SeccionFormato[];
  grupos: GrupoPuntos[];
  /** Se puede partir de un mantenimiento ya registrado en el sistema. */
  desdeMantenimiento?: boolean;
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
    encabezadoEstandar: true,
    secciones: [
      {
        titulo: "TIPO DE REVISION",
        campos: [
          {
            clave: "tipo_revision",
            etiqueta: "Tipo de revisión",
            tipo: "opciones",
            opciones: ["Programada", "Por reporte del usuario", "Seguimiento", "Extraordinaria"],
            ancho: 0.5,
          },
          { clave: "evidencia", etiqueta: "Evidencia", tipo: "texto", ancho: 0.5 },
        ],
      },
    ],
    grupos: [
      {
        titulo: "PUNTOS DE REVISION REMOTA",
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
      },
    ],
  },
  {
    clave: "FSI03",
    codigo: "FSI-03 Rev.00",
    nombre: "Mantenimiento equipo de cómputo",
    titulo: "MANTENIMIENTO EQUIPO DE COMPUTO",
    descripcion: "Mantenimiento preventivo o correctivo: qué se revisó, qué se encontró y cómo se resolvió.",
    prefijo: "FSI03",
    requiereEquipo: true,
    encabezadoEstandar: true,
    desdeMantenimiento: true,
    secciones: [
      {
        titulo: "DATOS TECNICOS DEL EQUIPO",
        campos: [
          { clave: "procesador", etiqueta: "Procesador", tipo: "auto", origen: "procesador", ancho: 0.34 },
          { clave: "ram", etiqueta: "RAM", tipo: "auto", origen: "ram", ancho: 0.2 },
          { clave: "so", etiqueta: "S.O", tipo: "auto", origen: "so", ancho: 0.46 },
        ],
      },
      {
        titulo: "TIPO DE MANTENIMIENTO",
        campos: [
          {
            clave: "tipo_mantenimiento",
            etiqueta: "Tipo de mantenimiento",
            tipo: "opciones",
            opciones: ["Preventivo", "Correctivo"],
            ancho: 0.35,
          },
          { clave: "condiciones", etiqueta: "Condiciones técnicas", tipo: "texto", ancho: 0.65 },
        ],
      },
    ],
    // Las tres columnas del formato: el síntoma, y qué se revisó de cada lado.
    grupos: [
      {
        titulo: "REVISION TECNICA",
        puntos: ["No enciende", "Se congela", "Se reinicia", "Equipo lento", "Internet", "Adm. Virus", "Otros"],
      },
      {
        titulo: "HARDWARE",
        puntos: ["HDD/SSD", "RAM", "Pantalla", "Mouse", "Teclado", "Fuente", "Otros"],
      },
      {
        titulo: "SOFTWARE",
        puntos: ["Todos", "Antivirus", "Office", "Correo", "Apps", "Impresora", "Otros"],
      },
    ],
  },
  {
    clave: "FSI05",
    codigo: "FSI-05 Rev.00",
    nombre: "Baja y disposición final de equipo informático",
    titulo: "BAJA Y DISPOSICION FINAL DE EQUIPO INFORMATICO",
    descripcion: "Baja del equipo: diagnóstico, tratamiento de la información, entrega y disposición final.",
    prefijo: "FSI05",
    requiereEquipo: true,
    // Este formato trae su propio encabezado de datos generales.
    encabezadoEstandar: false,
    secciones: [
      {
        titulo: "1. DATOS GENERALES",
        campos: [
          { clave: "area_solicitante", etiqueta: "Área solicitante", tipo: "texto", ancho: 0.34 },
          { clave: "ubicacion", etiqueta: "Ubicación", tipo: "texto", ancho: 0.33 },
          { clave: "responsable", etiqueta: "Responsable del equipo", tipo: "texto", ancho: 0.33 },
        ],
      },
      {
        titulo: "2. IDENTIFICACION DEL EQUIPO O COMPONENTE",
        campos: [
          { clave: "tipo_equipo", etiqueta: "Tipo de equipo/componente", tipo: "auto", origen: "tipo_equipo", ancho: 0.34 },
          { clave: "activo", etiqueta: "Número de activo", tipo: "auto", origen: "activo", ancho: 0.33 },
          { clave: "marca_modelo", etiqueta: "Marca y modelo", tipo: "auto", origen: "marca_modelo", ancho: 0.33 },
          { clave: "serie", etiqueta: "Número de serie", tipo: "auto", origen: "serie", ancho: 0.34 },
          { clave: "hostname", etiqueta: "Hostname / IP", tipo: "auto", origen: "hostname", ancho: 0.33 },
          {
            clave: "medio_almacenamiento",
            etiqueta: "Incluye medio de almacenamiento",
            tipo: "opciones",
            opciones: ["Sí", "No"],
            ancho: 0.33,
          },
          { clave: "tipo_medio", etiqueta: "Tipo / capacidad del medio", tipo: "texto", ancho: 1 },
        ],
      },
      {
        titulo: "3. DIAGNOSTICO Y MOTIVO DE BAJA — SISTEMAS",
        campos: [
          {
            clave: "condicion",
            etiqueta: "Condición determinada",
            tipo: "opciones",
            opciones: ["Dañado", "No funcional", "Obsoleto", "Reparación no viable", "Otro"],
            ancho: 0.5,
          },
          {
            clave: "recomendacion",
            etiqueta: "Recomendación",
            tipo: "opciones",
            opciones: ["Baja definitiva", "Destrucción", "Reciclaje", "Aprovechamiento de componentes autorizado"],
            ancho: 0.5,
          },
          { clave: "diagnostico", etiqueta: "Descripción de la falla y diagnóstico", tipo: "area", ancho: 1 },
        ],
      },
      {
        titulo: "4. TRATAMIENTO DE LA INFORMACION Y MEDIOS DE ALMACENAMIENTO",
        campos: [
          {
            clave: "respaldo",
            etiqueta: "Respaldo requerido / realizado",
            tipo: "opciones",
            opciones: ["No aplica", "Sí, realizado"],
            ancho: 0.5,
          },
          { clave: "ubicacion_respaldo", etiqueta: "Ubicación del respaldo", tipo: "texto", ancho: 0.5 },
          {
            clave: "tratamiento",
            etiqueta: "Tratamiento aplicado",
            tipo: "opciones",
            opciones: ["Borrado seguro", "Medio retirado", "Destrucción física requerida", "No aplica"],
            ancho: 0.5,
          },
          { clave: "id_medio", etiqueta: "Identificación del medio (marca/modelo/serie)", tipo: "texto", ancho: 0.5 },
          { clave: "confirma_sistemas", etiqueta: "Confirmación de Sistemas", tipo: "texto", ancho: 0.5 },
          { clave: "fecha_confirma", etiqueta: "Fecha de confirmación", tipo: "fecha", ancho: 0.5 },
        ],
      },
      {
        titulo: "5. ENTREGA A SEGURIDAD E HIGIENE",
        campos: [
          { clave: "fecha_entrega", etiqueta: "Fecha de entrega", tipo: "fecha", ancho: 0.25 },
          { clave: "piezas", etiqueta: "Cantidad de piezas", tipo: "texto", ancho: 0.25 },
          { clave: "entrega_sistemas", etiqueta: "Entrega — Sistemas", tipo: "texto", ancho: 0.25 },
          { clave: "recibe_shi", etiqueta: "Recibe — Seguridad e Higiene", tipo: "texto", ancho: 0.25 },
        ],
      },
      {
        titulo: "6. DISPOSICION FINAL CON PROVEEDOR",
        campos: [
          { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto", ancho: 0.34 },
          { clave: "fecha_recoleccion", etiqueta: "Fecha de recolección", tipo: "fecha", ancho: 0.33 },
          {
            clave: "proceso",
            etiqueta: "Proceso realizado",
            tipo: "opciones",
            opciones: ["Destrucción", "Reciclaje", "Otro"],
            ancho: 0.33,
          },
          { clave: "manifiesto", etiqueta: "Folio de manifiesto / constancia", tipo: "texto", ancho: 0.34 },
          {
            clave: "evidencia_adjunta",
            etiqueta: "Evidencia adjunta",
            tipo: "opciones",
            opciones: ["Sí", "No", "No aplica"],
            ancho: 0.33,
          },
          { clave: "fecha_cierre", etiqueta: "Fecha de cierre", tipo: "fecha", ancho: 0.33 },
          { clave: "responsable_shi", etiqueta: "Responsable Seguridad e Higiene", tipo: "texto", ancho: 0.5 },
          { clave: "validacion_sistemas", etiqueta: "Validación de Sistemas", tipo: "texto", ancho: 0.5 },
        ],
      },
    ],
    grupos: [],
  },
];

export function tipoRevision(clave: string): TipoRevision | undefined {
  return TIPOS_REVISION.find((t) => t.clave === clave);
}

/** Todos los campos de un formato, en orden. */
export function camposDe(tipo: TipoRevision): CampoExtra[] {
  return tipo.secciones.flatMap((s) => s.campos);
}
