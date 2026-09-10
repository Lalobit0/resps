/**
 * Lo que se sabe de un préstamo sin tocar la base.
 *
 * Va aparte de `prestamos.ts` porque la pantalla necesita estas reglas —si
 * está vencido, cuántos días faltan, cómo se lee su estado— y un componente
 * de cliente no puede importar nada que arrastre SQLite al navegador.
 */

export type EstadoPrestamo = "PRESTADO" | "DEVUELTO" | "CANCELADO";

export const ETIQUETA_ESTADO_PRESTAMO: Record<string, string> = {
  PRESTADO: "Prestado",
  DEVUELTO: "Devuelto",
  CANCELADO: "Cancelado",
};

export type Prestamo = {
  id: number;
  folio: string;
  empleado_id: number;
  equipo_id: number | null;
  descripcion: string;
  cantidad: number;
  motivo: string | null;
  fecha_prestamo: string;
  fecha_compromiso: string | null;
  fecha_devolucion: string | null;
  estado: string;
  condicion_entrega: string | null;
  condicion_regreso: string | null;
  entregado_por: string | null;
  recibido_por: string | null;
  pdf_path: string | null;
  pdf_firmado: string | null;
  fecha_firma: string | null;
  notas: string | null;
  created_at: string;
  /** De la plantilla, para no tener que buscarlo aparte. */
  numero_empleado: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  area: string | null;
  empleado_activo: number;
  /** Del inventario, cuando el préstamo es de un equipo dado de alta. */
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  tipo: string | null;
};

/** Sigue afuera: ni devuelto ni cancelado. */
export function sigueFuera(p: Prestamo): boolean {
  return p.estado === "PRESTADO";
}

/**
 * Días que faltan para la fecha comprometida. Negativo si ya se pasó.
 * Sin fecha comprometida devuelve null: no hay plazo que vencer.
 */
export function diasPara(p: Prestamo, hoy = new Date()): number | null {
  if (!p.fecha_compromiso) return null;
  const limite = new Date(`${p.fecha_compromiso}T00:00:00`);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((limite.getTime() - base.getTime()) / 86400000);
}

/** Se pasó de la fecha y todavía no lo traen. */
export function estaVencido(p: Prestamo, hoy = new Date()): boolean {
  if (!sigueFuera(p)) return false;
  const d = diasPara(p, hoy);
  return d !== null && d < 0;
}

/** Cómo se lee la situación de un préstamo en una sola frase. */
export function situacion(p: Prestamo, hoy = new Date()): { texto: string; tono: "verde" | "ambar" | "rojo" | "gris" } {
  if (p.estado === "CANCELADO") return { texto: "Cancelado", tono: "gris" };
  if (p.estado === "DEVUELTO") return { texto: "Devuelto", tono: "verde" };
  const d = diasPara(p, hoy);
  if (d === null) return { texto: "Prestado", tono: "ambar" };
  if (d < 0) return { texto: `Vencido ${Math.abs(d)} día(s)`, tono: "rojo" };
  if (d === 0) return { texto: "Lo trae hoy", tono: "ambar" };
  if (d <= 3) return { texto: `En ${d} día(s)`, tono: "ambar" };
  return { texto: `Para el ${p.fecha_compromiso}`, tono: "verde" };
}

/** Lo que se prestó, en una línea: del inventario o escrito a mano. */
export function queSePresto(p: Prestamo): string {
  const cantidad = p.cantidad > 1 ? `${p.cantidad} × ` : "";
  if (p.codigo) {
    const equipo = [p.marca, p.modelo].filter(Boolean).join(" ");
    return `${cantidad}${p.codigo}${equipo ? ` · ${equipo}` : ""}`;
  }
  return `${cantidad}${p.descripcion}`;
}

/** El pase está firmado si se subió el escaneo del papel. */
export function estaFirmado(p: Prestamo): boolean {
  return !!p.pdf_firmado;
}
