/**
 * Sustituye los marcadores {{campo}} de una plantilla con los datos dados.
 * El marcador {{tabla_equipos}} se deja intacto: lo interpreta el generador de PDF
 * para insertar la tabla de equipos en esa posición.
 */
export function llenarPlantilla(contenido: string, datos: Record<string, string>): string {
  return contenido.replace(/\{\{(\w+)\}\}/g, (completo, clave: string) => {
    if (clave === "tabla_equipos") return completo;
    return datos[clave] ?? "";
  });
}

export const MARCADORES_DISPONIBLES = [
  "{{fecha}}",
  "{{ciudad}}",
  "{{empresa}}",
  "{{nombre_empleado}}",
  "{{numero_empleado}}",
  "{{puesto}}",
  "{{departamento}}",
  "{{tabla_equipos}}",
  "{{observaciones}}",
  "{{folio}}",
  "{{folio_origen}}",
];
