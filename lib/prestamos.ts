import { db } from "./db";
import type { Prestamo } from "./prestamos-comun";
import { estaVencido, sigueFuera } from "./prestamos-comun";

/**
 * Las consultas de los pases de préstamo.
 *
 * Las reglas —si está vencido, cómo se lee— viven en `prestamos-comun.ts`,
 * sin tocar la base, para que la pantalla las pueda usar.
 */

export * from "./prestamos-comun";

const SELECT_PRESTAMO = `
  SELECT p.*, em.numero_empleado, em.nombre, em.puesto, em.departamento, em.area,
         em.activo AS empleado_activo,
         q.codigo, q.marca, q.modelo, q.numero_serie, q.tipo
  FROM prestamos p
  JOIN empleados em ON em.id = p.empleado_id
  LEFT JOIN equipos q ON q.id = p.equipo_id`;

export function prestamos(): Prestamo[] {
  return db
    .prepare(
      `${SELECT_PRESTAMO}
       ORDER BY CASE p.estado WHEN 'PRESTADO' THEN 0 ELSE 1 END,
                COALESCE(p.fecha_compromiso, '9999-12-31') ASC,
                p.id DESC`
    )
    .all() as Prestamo[];
}

export function prestamo(id: number): Prestamo | null {
  return (db.prepare(`${SELECT_PRESTAMO} WHERE p.id = ?`).get(id) as Prestamo | undefined) ?? null;
}

/** Los préstamos de una persona, para su ficha y para darla de baja. */
export function prestamosDe(empleadoId: number): Prestamo[] {
  return db
    .prepare(`${SELECT_PRESTAMO} WHERE p.empleado_id = ? ORDER BY p.id DESC`)
    .all(empleadoId) as Prestamo[];
}

/** Los que siguen fuera de un equipo del inventario. */
export function prestamoVigenteDe(equipoId: number): Prestamo | null {
  return (
    (db
      .prepare(`${SELECT_PRESTAMO} WHERE p.equipo_id = ? AND p.estado = 'PRESTADO' ORDER BY p.id DESC`)
      .get(equipoId) as Prestamo | undefined) ?? null
  );
}

/**
 * Lo que se puede prestar: del anaquel, sin dueño y sin estar ya prestado.
 *
 * Un equipo asignado no aparece a propósito. Si alguien lo trae a su nombre,
 * prestarlo es un lío de responsabilidad —¿de quién es si se pierde?— y la
 * salida correcta es devolverlo primero al inventario.
 */
export type EquipoPrestable = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  area: string | null;
  estado: string;
};

export function equiposPrestables(): EquipoPrestable[] {
  return db
    .prepare(
      `SELECT id, codigo, tipo, marca, modelo, numero_serie,
              COALESCE(area, departamento) AS area, estado
       FROM equipos
       WHERE estado = 'DISPONIBLE' AND asignado_a IS NULL
       ORDER BY tipo, codigo`
    )
    .all() as EquipoPrestable[];
}

// ------------------------------------------------------------------ resumen

export type ResumenPrestamos = {
  fuera: number;
  vencidos: number;
  hoy: number;
  devueltos: number;
  sinFirmar: number;
};

export function resumenPrestamos(): ResumenPrestamos {
  const lista = prestamos();
  const ahora = new Date();
  return {
    fuera: lista.filter(sigueFuera).length,
    vencidos: lista.filter((p) => estaVencido(p, ahora)).length,
    hoy: lista.filter((p) => sigueFuera(p) && p.fecha_compromiso === ahora.toISOString().slice(0, 10)).length,
    devueltos: lista.filter((p) => p.estado === "DEVUELTO").length,
    // Un pase sin el escaneo firmado es un préstamo sin respaldo en papel.
    sinFirmar: lista.filter((p) => sigueFuera(p) && !p.pdf_firmado).length,
  };
}

/** Los vencidos, para el aviso de la pantalla de inicio. */
export function prestamosVencidos(): Prestamo[] {
  const ahora = new Date();
  return prestamos().filter((p) => estaVencido(p, ahora));
}
