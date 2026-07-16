export interface Empleado {
  id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  correo: string | null;
  telefono: string | null;
  activo: number;
  created_at: string;
}

export interface EmpleadoConEquipos extends Empleado {
  equipos_asignados: number;
}

export interface Equipo {
  id: number;
  codigo: string;
  categoria: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  specs: string | null;
  fecha_compra: string | null;
  costo: number | null;
  estado: string;
  asignado_a: number | null;
  notas: string | null;
  created_at: string;
}

export interface EquipoConAsignado extends Equipo {
  asignado_nombre: string | null;
}

export interface Responsiva {
  id: number;
  folio: string;
  tipo: string; // ASIGNACION | DEVOLUCION
  empleado_id: number;
  fecha: string;
  estado: string; // VIGENTE | CERRADA
  responsiva_origen_id: number | null;
  entregado_por: string | null;
  observaciones: string | null;
  pdf_path: string | null;
  created_at: string;
}

export interface ResponsivaLista extends Responsiva {
  empleado_nombre: string;
  equipos: string | null;
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
  id?: number;
  folio?: string;
};
