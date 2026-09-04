export interface Empleado {
  id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  area: string | null;
  clase: string | null;
  supervisor: string | null;
  fecha_alta: string | null;
  correo: string | null;
  telefono: string | null;
  activo: number;
  /** Cuándo dejó la empresa y por qué; vacío mientras siga activo. */
  fecha_baja: string | null;
  motivo_baja: string | null;
  created_at: string;
}

export interface EmpleadoConEquipos extends Empleado {
  equipos_asignados: number;
  /** Equipos asignados por tipo, para ver de un vistazo qué trae cada persona. */
  computo?: number;
  celular?: number;
  radio?: number;
  otro?: number;
  /** Equipos entregados a este empleado que no tienen carta responsiva vigente. */
  sin_responsiva?: number;
}

export interface Equipo {
  id: number;
  codigo: string;
  tipo: string; // COMPUTO | CELULAR | RADIO | OTRO
  categoria: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  specs: string | null;
  detalles: string | null; // JSON con campos por tipo
  fecha_compra: string | null;
  costo: number | null;
  estado: string;
  asignado_a: number | null;
  /** Área a la que pertenece el aparato, aunque ahora no lo tenga nadie. */
  departamento: string | null;
  area: string | null;
  /** Cómo está clasificado: administrativo, de producción, de sala… */
  clasificacion: string | null;
  notas: string | null;
  created_at: string;
}

export interface EquipoConAsignado extends Equipo {
  asignado_nombre: string | null;
  asignado_numero: string | null;
  asignado_departamento: string | null;
  asignado_area: string | null;
}

export interface Responsiva {
  id: number;
  folio: string;
  tipo: string; // ASIGNACION | DEVOLUCION
  clase: string; // COMPUTO | CELULAR | OTROS | WIFI | VALE
  origen: string; // SISTEMA | CARGADA
  empleado_id: number;
  fecha: string;
  estado: string; // VIGENTE | CERRADA
  responsiva_origen_id: number | null;
  entregado_por: string | null;
  observaciones: string | null;
  pdf_path: string | null;
  firma_autoridad: string | null;
  firma_autoridad_nombre: string | null;
  firma_autoridad_puesto: string | null;
  firma_autoridad_ausencia: number;
  firma_empleado: string | null;
  concepto: string | null;
  monto: number | null;
  /** Solo en los vales: EQUIPO o CONSUMIBLE. */
  vale_clausula?: string | null;
  created_at: string;
  /** Escaneo de la carta ya firmada en papel. */
  pdf_firmado?: string | null;
  fecha_firma?: string | null;
  /** Tanda de generación masiva a la que pertenece (null si se hizo suelta). */
  lote?: string | null;
}

/** Firma guardada del jefe de sistemas, de RH o de quien firma por ausencia. */
export interface FirmaGuardada {
  id: number;
  nombre: string;
  puesto: string;
  rol: string; // SISTEMAS | RH | OTRO
  imagen: string;
  activo: number;
  created_at: string;
}

export interface ResponsivaLista extends Responsiva {
  empleado_nombre: string;
  empleado_numero: string;
  equipos: string | null;
  es_duplicado?: number;
}

export interface Bitacora {
  id: number;
  fecha: string;
  accion: string;
  descripcion: string;
  snapshot: string | null;
  revertible: number;
  revertida: number;
}

export interface ResponsivaItem {
  id: number;
  responsiva_id: number;
  equipo_id: number;
  descripcion: string;
  condiciones: string | null;
}

export interface ItemConEquipo extends ResponsivaItem {
  codigo: string;
  categoria: string;
  numero_serie: string | null;
  estado_equipo: string;
}

export interface Mantenimiento {
  id: number;
  equipo_id: number;
  tipo: string; // PREVENTIVO | CORRECTIVO
  descripcion: string;
  fecha_programada: string;
  fecha_realizada: string | null;
  estado: string; // PROGRAMADO | COMPLETADO | CANCELADO
  costo: number | null;
  tecnico: string | null;
  notas: string | null;
  created_at: string;
}

export interface MantenimientoConEquipo extends Mantenimiento {
  equipo_codigo: string;
  equipo_desc: string;
  equipo_categoria: string;
}

export interface Plantilla {
  id: number;
  clave: string;
  nombre: string;
  contenido: string;
}

export type ResultadoAccion = {
  ok: boolean;
  error?: string;
  mensaje?: string;
  id?: number;
  folio?: string;
};
