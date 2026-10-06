/**
 * Qué le cambió a cada quien al subir la plantilla de Recursos Humanos.
 *
 * Antes la importación solo decía "137 actualizados", y eso no dice nada:
 * esos 137 son casi siempre la misma gente con los mismos datos, y entre
 * ellos van escondidos los tres cambios que sí importan —a alguien lo
 * pasaron de Producción a Embarques, a otro lo subieron de puesto—. Sin
 * verlos, la plantilla cambia sola y nadie se entera hasta que algo no cuadra.
 *
 * Esto compara renglón por renglón y deja solo lo que de verdad cambió.
 *
 * Es un módulo puro —no toca la base— para que la pantalla lo pueda usar sin
 * arrastrar el motor de SQLite al navegador.
 */

export type CampoPersonal = {
  clave: "nombre" | "puesto" | "departamento" | "area" | "clase" | "supervisor" | "fecha_alta";
  etiqueta: string;
};

/** Lo que trae el Excel de RH, en el orden en que se lee una ficha. */
export const CAMPOS_PERSONAL: CampoPersonal[] = [
  { clave: "nombre", etiqueta: "Nombre" },
  { clave: "puesto", etiqueta: "Puesto" },
  { clave: "departamento", etiqueta: "Departamento" },
  { clave: "area", etiqueta: "Área" },
  { clave: "clase", etiqueta: "Clase" },
  { clave: "supervisor", etiqueta: "Jefe directo" },
  { clave: "fecha_alta", etiqueta: "Fecha de alta" },
];

export type CambioCampo = {
  etiqueta: string;
  antes: string;
  despues: string;
};

export type CambioEmpleado = {
  numero_empleado: string;
  /** Cómo se llama ahora, para poder nombrarlo en la lista. */
  nombre: string;
  cambios: CambioCampo[];
};

export type DatosPersonal = Partial<Record<CampoPersonal["clave"], string | null>>;

/** Cómo quedó la plantilla después de subir el archivo. */
export type ResumenPersonal = {
  /** Los que no estaban en el sistema. */
  nuevos: { numero_empleado: string; nombre: string }[];
  /** Los que ya estaban y les cambió algo, con qué. */
  cambios: CambioEmpleado[];
  /** Los que vinieron igual que como estaban. */
  sinCambios: number;
  /** Renglones sin número o sin nombre, que no se pueden usar. */
  omitidos: number;
  /** Los que estaban activos y ya no vienen en el archivo. */
  ausentes: number;
  /** De esos, cuántos traen equipo a su nombre. */
  ausentesConEquipo: number;
};

/** Vacío, nulo y espacios en blanco son lo mismo: nadie capturó ese dato. */
const limpio = (v: string | null | undefined) => String(v ?? "").trim();

/**
 * Qué cambió entre lo que estaba guardado y lo que trae el archivo.
 *
 * Solo se compara en mayúsculas porque el Excel de RH viene unas veces en
 * altas y otras no, y eso no es un cambio: es la misma persona escrita
 * distinto. Lo que se guarda es lo que trae el archivo, tal cual.
 */
export function compararPersonal(antes: DatosPersonal, despues: DatosPersonal): CambioCampo[] {
  const salida: CambioCampo[] = [];
  for (const campo of CAMPOS_PERSONAL) {
    const a = limpio(antes[campo.clave]);
    const b = limpio(despues[campo.clave]);
    if (a.toUpperCase() === b.toUpperCase()) continue;
    salida.push({
      etiqueta: campo.etiqueta,
      antes: a || "—",
      despues: b || "—",
    });
  }
  return salida;
}

/** "Puesto: OPERADOR → SUPERVISOR · Departamento: PRODUCCION → EMBARQUES" */
export function resumirCambios(cambios: CambioCampo[]): string {
  return cambios.map((c) => `${c.etiqueta}: ${c.antes} → ${c.despues}`).join(" · ");
}
