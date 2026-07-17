import type { ClaseCarta } from "./constants";
import type { Empleado, Equipo } from "./types";
import type { FilaCarta } from "./pdf";

export function parseDetalles(equipo: Pick<Equipo, "detalles">): Record<string, string> {
  try {
    const d = equipo.detalles ? (JSON.parse(equipo.detalles) as Record<string, unknown>) : {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) out[k] = v == null ? "" : String(v);
    return out;
  } catch {
    return {};
  }
}

export function filasUsuario(emp: Empleado): FilaCarta[] {
  return [
    { etiqueta: "Nombre del Usuario", valor: emp.nombre },
    { etiqueta: "Numero de empleado", valor: emp.numero_empleado },
    { etiqueta: "Área", valor: emp.area || emp.departamento || "" },
    { etiqueta: "Nombre de jefe directo", valor: emp.supervisor || "" },
  ];
}

/** Descripción corta del equipo para el renglón de responsiva_items */
export function descripcionEquipo(equipo: Equipo): string {
  const base = `${equipo.marca} ${equipo.modelo}`.trim();
  return equipo.specs ? `${base} (${equipo.specs})` : base;
}

/** Renglones de la tabla de equipo del PDF según la clase de carta */
export function filasEquipo(clase: ClaseCarta, equipo: Equipo): FilaCarta[] {
  const d = parseDetalles(equipo);
  const serie = equipo.numero_serie || "";
  if (clase === "COMPUTO") {
    return [
      { etiqueta: "Marca", valor: equipo.marca },
      { etiqueta: "Modelo", valor: equipo.modelo },
      { etiqueta: "Serie", valor: serie },
      { etiqueta: "Activo", valor: d.activo || "" },
      { etiqueta: "Nombre del equipo", valor: d.nombre_computadora || equipo.codigo },
      { etiqueta: "Descripción del equipo", valor: d.descripcion || equipo.specs || "" },
      { etiqueta: "Accesorios", valor: d.accesorios || "" },
      { etiqueta: "Monitor", valor: d.monitor || "" },
    ];
  }
  if (clase === "CELULAR") {
    return [
      { etiqueta: "Marca", valor: equipo.marca },
      { etiqueta: "Modelo", valor: equipo.modelo },
      { etiqueta: "Serie", valor: serie },
      { etiqueta: "IMEI", valor: d.imei || "" },
      { etiqueta: "Número", valor: d.numero || "" },
      { etiqueta: "Plan", valor: d.plan || "" },
      { etiqueta: "Descripción", valor: d.descripcion || equipo.specs || "" },
      { etiqueta: "Condición", valor: d.condicion || "" },
      { etiqueta: "Accesorios", valor: d.accesorios || "" },
    ];
  }
  if (clase === "OTROS") {
    const nombre =
      d.nombre_equipo || (equipo.tipo === "RADIO" ? `Radio ${d.num_equipo || ""}`.trim() : equipo.codigo);
    const desc =
      d.descripcion || equipo.specs || [d.estado_radio, d.comentarios].filter(Boolean).join(" · ");
    return [
      { etiqueta: "Marca", valor: equipo.marca },
      { etiqueta: "Modelo", valor: equipo.modelo },
      { etiqueta: "Serie", valor: serie },
      { etiqueta: "Nombre del equipo", valor: nombre },
      { etiqueta: "Descripción del equipo", valor: desc },
      { etiqueta: "Accesorios", valor: d.accesorios || d.auricular || "" },
    ];
  }
  return [];
}

/** Separa el texto de la plantilla en intro (antes de la tabla) y cuerpo (normas) */
export function partirPlantilla(contenido: string): { intro: string; cuerpo: string } {
  if (contenido.includes("{{tabla_equipo}}")) {
    const partes = contenido.split("{{tabla_equipo}}");
    return { intro: partes[0].trim(), cuerpo: partes.slice(1).join("").trim() };
  }
  const idx = contenido.indexOf("\n\n");
  if (idx > 0) return { intro: contenido.slice(0, idx).trim(), cuerpo: contenido.slice(idx).trim() };
  return { intro: "", cuerpo: contenido.trim() };
}
