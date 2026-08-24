"use client";

import { Label, inputCls } from "./ui";

/**
 * Los campos de un empleado, en un solo lugar.
 *
 * Los usan el alta y la edición del listado y el botón de editar de su
 * histórico: si mañana se agrega un dato, se agrega aquí y aparece en los tres.
 */

export type DatosEmpleado = {
  id?: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  area: string;
  clase: string;
  supervisor: string;
  fecha_alta: string;
  correo: string;
  telefono: string;
};

export const EMPLEADO_VACIO: DatosEmpleado = {
  numero_empleado: "",
  nombre: "",
  puesto: "",
  departamento: "",
  area: "",
  clase: "",
  supervisor: "",
  fecha_alta: "",
  correo: "",
  telefono: "",
};

/** Pasa un empleado de la base al formulario, con los nulos ya en blanco. */
export function empleadoAFormulario(e: {
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
}): DatosEmpleado {
  return {
    id: e.id,
    numero_empleado: e.numero_empleado,
    nombre: e.nombre,
    puesto: e.puesto,
    departamento: e.departamento,
    area: e.area ?? "",
    clase: e.clase ?? "",
    supervisor: e.supervisor ?? "",
    fecha_alta: e.fecha_alta ?? "",
    correo: e.correo ?? "",
    telefono: e.telefono ?? "",
  };
}

export default function CamposEmpleado({
  valor,
  onCambio,
  deshabilitado = false,
}: {
  valor: DatosEmpleado;
  onCambio: (campo: keyof DatosEmpleado, texto: string) => void;
  deshabilitado?: boolean;
}) {
  const campo = (c: keyof DatosEmpleado) => ({
    className: inputCls,
    value: String(valor[c] ?? ""),
    disabled: deshabilitado,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onCambio(c, ev.target.value),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>Número de empleado *</Label>
        <input {...campo("numero_empleado")} placeholder="0045" />
      </div>
      <div className="lg:col-span-2">
        <Label>Nombre completo *</Label>
        <input {...campo("nombre")} placeholder="Nombre y apellidos" />
      </div>
      <div>
        <Label>Puesto *</Label>
        <input {...campo("puesto")} />
      </div>
      <div>
        <Label>Departamento *</Label>
        <input {...campo("departamento")} />
      </div>
      <div>
        <Label>Área</Label>
        <input {...campo("area")} />
      </div>
      <div>
        <Label>Jefe directo / Supervisor</Label>
        <input {...campo("supervisor")} />
      </div>
      <div>
        <Label>Clase de empleado</Label>
        <input {...campo("clase")} placeholder="ADMINISTRATIVOS…" />
      </div>
      <div>
        <Label>Fecha de alta</Label>
        <input {...campo("fecha_alta")} type="date" />
      </div>
      <div>
        <Label>Correo</Label>
        <input {...campo("correo")} type="email" />
      </div>
      <div>
        <Label>Teléfono</Label>
        <input {...campo("telefono")} />
      </div>
    </div>
  );
}
