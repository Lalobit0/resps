import { db } from "./db";

/**
 * Equipos entregados a un empleado que no tienen una carta responsiva vigente
 * que los respalde. Son los que hay que generar y mandar a firmar.
 */
export type EquipoSinResponsiva = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  asignado_a: number;
  empleado_numero: string;
  empleado_nombre: string;
  empleado_puesto: string;
  empleado_departamento: string;
  empleado_area: string | null;
  empleado_clase: string | null;
};

const CONSULTA = `
  SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.numero_serie, e.asignado_a,
         em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre,
         em.puesto AS empleado_puesto, em.departamento AS empleado_departamento,
         em.area AS empleado_area, em.clase AS empleado_clase
  FROM equipos e
  JOIN empleados em ON em.id = e.asignado_a
  WHERE e.estado = 'ASIGNADO'
    AND e.asignado_a IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM responsiva_items ri
      JOIN responsivas r ON r.id = ri.responsiva_id
      WHERE ri.equipo_id = e.id
        AND r.tipo = 'ASIGNACION'
        AND r.estado = 'VIGENTE'
        AND r.empleado_id = e.asignado_a
    )
`;

/** Lista completa de equipos asignados sin responsiva vigente. */
export function equiposSinResponsiva(): EquipoSinResponsiva[] {
  return db.prepare(`${CONSULTA} ORDER BY e.tipo ASC, e.codigo ASC`).all() as EquipoSinResponsiva[];
}

/**
 * Lo mismo, ordenado como conviene para imprimir y repartir en piso: por
 * departamento y empleado, de modo que las cartas de una misma área salgan
 * juntas del cajón de la impresora.
 */
export function equiposSinResponsivaParaGenerar(): EquipoSinResponsiva[] {
  return db
    .prepare(`${CONSULTA} ORDER BY em.departamento ASC, COALESCE(em.area,'') ASC, em.nombre ASC, e.tipo ASC`)
    .all() as EquipoSinResponsiva[];
}

/** Solo el conteo, para los avisos del tablero. */
export function totalSinResponsiva(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM (${CONSULTA})`).get() as { c: number }).c;
}

/** Ids de los equipos sin responsiva, para marcarlos en un listado. */
export function idsSinResponsiva(): Set<number> {
  const filas = db.prepare(`SELECT e.id FROM (${CONSULTA}) AS e`).all() as { id: number }[];
  return new Set(filas.map((f) => f.id));
}

/**
 * El caso contrario: equipos que SÍ tienen carta responsiva vigente pero que en
 * el inventario aparecen sin empleado. Pasa con las responsivas escaneadas que
 * se cargaron después del inventario. El empleado ya está en el documento, así
 * que el sistema puede ligarlos sin que nadie tenga que decidir nada.
 */
export type EquipoPorLigar = {
  equipo_id: number;
  codigo: string;
  marca: string;
  modelo: string;
  folio: string;
  empleado_id: number;
  empleado_numero: string;
  empleado_nombre: string;
};

const POR_LIGAR = `
  SELECT e.id AS equipo_id, e.codigo, e.marca, e.modelo, r.folio,
         em.id AS empleado_id, em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre
  FROM equipos e
  JOIN responsiva_items ri ON ri.equipo_id = e.id
  JOIN responsivas r ON r.id = ri.responsiva_id
  JOIN empleados em ON em.id = r.empleado_id
  WHERE e.asignado_a IS NULL
    AND e.estado != 'BAJA'
    AND r.tipo = 'ASIGNACION'
    AND r.estado = 'VIGENTE'
    -- Si tuviera varias, manda la más reciente.
    AND r.id = (
      SELECT MAX(r2.id) FROM responsiva_items ri2
      JOIN responsivas r2 ON r2.id = ri2.responsiva_id
      WHERE ri2.equipo_id = e.id AND r2.tipo = 'ASIGNACION' AND r2.estado = 'VIGENTE'
    )
`;

/** Equipos con responsiva vigente a los que les falta el empleado en el inventario. */
export function equiposPorLigar(): EquipoPorLigar[] {
  return db.prepare(`${POR_LIGAR} ORDER BY e.codigo ASC`).all() as EquipoPorLigar[];
}

/**
 * Responsivas generadas en el sistema que todavía no tienen el escaneo de la
 * carta firmada en papel. Son las que hay que imprimir, firmar y subir.
 *
 * Se consideran firmadas: las que ya traen el escaneo, las que se cargaron
 * desde un documento firmado (origen CARGADA) y las viejas que se firmaron
 * digitalmente.
 */
export type ResponsivaSinFirma = {
  id: number;
  folio: string;
  tipo: string;
  clase: string;
  fecha: string;
  empleado_id: number;
  empleado_numero: string;
  empleado_nombre: string;
  equipos: string | null;
};

const SIN_FIRMA = `
  SELECT r.id, r.folio, r.tipo, r.clase, r.fecha, r.empleado_id,
         em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre,
         (SELECT GROUP_CONCAT(e.codigo, ', ') FROM responsiva_items ri
            JOIN equipos e ON e.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
  FROM responsivas r
  JOIN empleados em ON em.id = r.empleado_id
  WHERE r.estado != 'ELIMINADA'
    AND COALESCE(r.pdf_firmado, '') = ''
    AND COALESCE(r.origen, 'SISTEMA') != 'CARGADA'
    AND COALESCE(r.firma_empleado, '') = ''
`;

/** Todas las responsivas pendientes de subir firmadas. */
export function responsivasSinFirma(): ResponsivaSinFirma[] {
  return db.prepare(`${SIN_FIRMA} ORDER BY r.fecha DESC, r.id DESC`).all() as ResponsivaSinFirma[];
}

/** Las de un empleado, para su ficha. */
export function responsivasSinFirmaDe(empleadoId: number): ResponsivaSinFirma[] {
  return db.prepare(`${SIN_FIRMA} AND r.empleado_id = ? ORDER BY r.fecha DESC, r.id DESC`).all(empleadoId) as ResponsivaSinFirma[];
}

/** Solo el conteo, para los avisos. */
export function totalSinFirma(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM (${SIN_FIRMA})`).get() as { c: number }).c;
}

/**
 * Tandas generadas de golpe. Sirven para reimprimir el paquete completo y para
 * repartir después el escaneo de las cartas firmadas, que vuelve en el mismo
 * orden en que salieron impresas.
 */
export type LoteGenerado = {
  lote: string;
  total: number;
  sin_firma: number;
  creado: string;
  departamentos: string | null;
};

export function lotesGenerados(): LoteGenerado[] {
  return db
    .prepare(
      `SELECT r.lote,
              COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(r.pdf_firmado,'') = '' THEN 1 ELSE 0 END) AS sin_firma,
              MIN(r.created_at) AS creado,
              (SELECT GROUP_CONCAT(d, ', ') FROM (
                 SELECT DISTINCT em2.departamento AS d FROM responsivas r2
                 JOIN empleados em2 ON em2.id = r2.empleado_id
                 WHERE r2.lote = r.lote AND r2.estado != 'ELIMINADA' ORDER BY d
               )) AS departamentos
       FROM responsivas r
       WHERE COALESCE(r.lote,'') != '' AND r.estado != 'ELIMINADA'
       GROUP BY r.lote
       ORDER BY creado DESC`
    )
    .all() as LoteGenerado[];
}

/** Las cartas de una tanda, en el mismo orden en que se imprimieron. */
export type ResponsivaDeLote = {
  id: number;
  folio: string;
  clase: string;
  pdf_path: string | null;
  firmada: number;
  empleado_id: number;
  empleado_numero: string;
  empleado_nombre: string;
  equipos: string | null;
};

export function responsivasDeLote(lote: string): ResponsivaDeLote[] {
  return db
    .prepare(
      `SELECT r.id, r.folio, r.clase, r.pdf_path,
              CASE WHEN COALESCE(r.pdf_firmado,'') = '' THEN 0 ELSE 1 END AS firmada,
              r.empleado_id, em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre,
              (SELECT GROUP_CONCAT(e.codigo, ', ') FROM responsiva_items ri
                 JOIN equipos e ON e.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r
       JOIN empleados em ON em.id = r.empleado_id
       WHERE r.lote = ? AND r.estado != 'ELIMINADA'
       ORDER BY r.id ASC`
    )
    .all(lote) as ResponsivaDeLote[];
}

/**
 * Cartas partidas en dos: la misma entrega quedó como un par donde una tiene la
 * firma (el escaneo se cargó aparte) y la otra el equipo. Pasa al subir una
 * carga masiva sin decir que la página era de una carta que ya existía.
 */
export type ParPartido = {
  empleado_id: number;
  empleado_numero: string;
  empleado_nombre: string;
  clase: string;
  /** La generada por el sistema: tiene el equipo pero le falta la firma. */
  sin_firma_id: number;
  sin_firma_folio: string;
  sin_firma_fecha: string;
  equipos: string | null;
  /** El escaneo que entró como carta aparte: firmada pero sin equipo. */
  firmada_id: number;
  firmada_folio: string;
  firmada_fecha: string;
};

export function paresPartidos(): ParPartido[] {
  return db
    .prepare(
      `SELECT s.empleado_id, em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre, s.clase,
              s.id AS sin_firma_id, s.folio AS sin_firma_folio, s.fecha AS sin_firma_fecha,
              (SELECT GROUP_CONCAT(e.codigo, ', ') FROM responsiva_items ri
                 JOIN equipos e ON e.id = ri.equipo_id WHERE ri.responsiva_id = s.id) AS equipos,
              f.id AS firmada_id, f.folio AS firmada_folio, f.fecha AS firmada_fecha
       FROM responsivas s
       JOIN responsivas f
         ON f.empleado_id = s.empleado_id AND f.clase = s.clase AND f.id != s.id
        AND f.tipo = 'ASIGNACION' AND f.estado = 'VIGENTE'
        -- la otra sí tiene documento firmado…
        AND (COALESCE(f.pdf_firmado,'') != '' OR f.origen = 'CARGADA')
        -- …y ningún equipo ligado, que es lo que la delata
        AND NOT EXISTS (SELECT 1 FROM responsiva_items ri2 WHERE ri2.responsiva_id = f.id)
       JOIN empleados em ON em.id = s.empleado_id
       WHERE s.tipo = 'ASIGNACION' AND s.estado = 'VIGENTE'
         AND COALESCE(s.pdf_firmado,'') = '' AND COALESCE(s.origen,'SISTEMA') != 'CARGADA'
         AND COALESCE(s.firma_empleado,'') = ''
         AND EXISTS (SELECT 1 FROM responsiva_items ri3 WHERE ri3.responsiva_id = s.id)
       GROUP BY s.id
       ORDER BY em.nombre ASC`
    )
    .all() as ParPartido[];
}
