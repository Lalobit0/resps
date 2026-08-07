import { db, getConfig } from "./db";
import { fechaCorta, fechaLarga } from "./helpers";
import { generarFormato, type Bloque, type Hoja } from "./formatos/motor";
import { tipoRevision, camposDe, type CampoExtra, type TipoRevision } from "./formatos/tipos";

/** Una revisión ya capturada, con todo lo que el documento necesita. */
export type Revision = {
  id: number;
  tipo: string;
  folio: string;
  fecha: string;
  empleado_id: number | null;
  equipo_id: number | null;
  realizada_por: string | null;
  resultado: string | null;
  datos: string | null;
  observaciones: string | null;
  created_at: string;
  // Traídos del empleado y del equipo relacionados.
  empleado_numero: string | null;
  empleado_nombre: string | null;
  empleado_puesto: string | null;
  empleado_departamento: string | null;
  empleado_area: string | null;
  empleado_correo: string | null;
  equipo_codigo: string | null;
  equipo_marca: string | null;
  equipo_modelo: string | null;
  equipo_serie: string | null;
  equipo_detalles: string | null;
  equipo_specs: string | null;
  equipo_compra: string | null;
};

const CONSULTA = `
  SELECT r.*,
         em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre, em.puesto AS empleado_puesto,
         em.departamento AS empleado_departamento, em.area AS empleado_area, em.correo AS empleado_correo,
         e.codigo AS equipo_codigo, e.marca AS equipo_marca, e.modelo AS equipo_modelo,
         e.numero_serie AS equipo_serie, e.detalles AS equipo_detalles, e.specs AS equipo_specs,
         e.fecha_compra AS equipo_compra
  FROM revisiones r
  LEFT JOIN empleados em ON em.id = r.empleado_id
  LEFT JOIN equipos e ON e.id = r.equipo_id
`;

export function listarRevisiones(filtros: { tipo?: string; empleadoId?: number } = {}): Revision[] {
  const cond: string[] = [];
  const val: (string | number)[] = [];
  if (filtros.tipo) {
    cond.push("r.tipo = ?");
    val.push(filtros.tipo);
  }
  if (filtros.empleadoId) {
    cond.push("r.empleado_id = ?");
    val.push(filtros.empleadoId);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  return db.prepare(`${CONSULTA} ${where} ORDER BY r.fecha DESC, r.id DESC`).all(...val) as Revision[];
}

export function obtenerRevision(id: number): Revision | undefined {
  return db.prepare(`${CONSULTA} WHERE r.id = ?`).get(id) as Revision | undefined;
}

function detallesDe(json: string | null): Record<string, string> {
  try {
    const d = json ? JSON.parse(json) : {};
    return d && typeof d === "object" ? (d as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Lo que el sistema sabe del equipo y llena solo en los campos "auto". */
export function valorAutomatico(r: Revision, origen: CampoExtra["origen"]): string {
  const det = detallesDe(r.equipo_detalles);
  switch (origen) {
    case "procesador":
      return det.procesador ?? "";
    case "ram":
      return det.ram ?? "";
    case "so":
      return det.sistema_operativo ?? "";
    case "hostname":
      return [det.nombre_computadora, det.ip].filter(Boolean).join(" / ");
    case "activo":
      return det.activo ?? "";
    case "serie":
      return r.equipo_serie ?? "";
    case "marca_modelo":
      return `${r.equipo_marca ?? ""} ${r.equipo_modelo ?? ""}`.trim();
    case "tipo_equipo":
      return r.equipo_codigo ? `${r.equipo_codigo}` : "";
    case "ubicacion":
      return [r.empleado_departamento, r.empleado_area].filter(Boolean).join(" / ");
    default:
      return "";
  }
}

/** Arma la hoja del documento con lo que se capturó. */
export function hojaDeRevision(r: Revision): Hoja {
  const tipo = tipoRevision(r.tipo);
  const datos = detallesDe(r.datos);
  const det = detallesDe(r.equipo_detalles);

  const valorDe = (c: CampoExtra): string =>
    (datos[c.clave] ?? "").trim() || (c.tipo === "auto" ? valorAutomatico(r, c.origen) : "");

  const bloques: Bloque[] = [];

  // Los formatos que lo llevan abren con quién es el usuario y qué equipo es.
  if (tipo?.encabezadoEstandar !== false) {
    bloques.push(
      { tipo: "seccion", texto: "DATOS DEL USUARIO" },
      {
        tipo: "campos",
        campos: [
          { etiqueta: "Nombre", valor: r.empleado_nombre, ancho: 0.62 },
          { etiqueta: "Num. de empleado", valor: r.empleado_numero, ancho: 0.38 },
        ],
      },
      {
        tipo: "campos",
        campos: [
          {
            etiqueta: "Area de trabajo",
            valor: [r.empleado_departamento, r.empleado_area].filter(Boolean).join(" / "),
            ancho: 0.38,
          },
          { etiqueta: "Cargo", valor: r.empleado_puesto, ancho: 0.32 },
          { etiqueta: "Correo", valor: r.empleado_correo, ancho: 0.3 },
        ],
      },
      { tipo: "espacio", alto: 6 },
      { tipo: "seccion", texto: "DATOS DEL EQUIPO" },
      {
        tipo: "campos",
        campos: [
          { etiqueta: "Marca y Modelo", valor: `${r.equipo_marca ?? ""} ${r.equipo_modelo ?? ""}`.trim(), ancho: 0.4 },
          { etiqueta: "Identificador del Equipo", valor: det.nombre_computadora || r.equipo_codigo, ancho: 0.3 },
          { etiqueta: "Serie", valor: r.equipo_serie, ancho: 0.3 },
        ],
      }
    );
  } else {
    // El FSI-05 abre con sus datos generales.
    bloques.push(
      { tipo: "seccion", texto: "DATOS GENERALES" },
      {
        tipo: "campos",
        campos: [
          { etiqueta: "Fecha de solicitud", valor: fechaCorta(r.fecha), ancho: 0.25 },
          { etiqueta: "Folio", valor: r.folio, ancho: 0.25 },
          { etiqueta: "Usuario del equipo", valor: `${r.empleado_numero ?? ""} ${r.empleado_nombre ?? ""}`.trim(), ancho: 0.5 },
        ],
      }
    );
  }

  if (tipo?.encabezadoEstandar !== false) {
    bloques.push({
      tipo: "campos",
      campos: [
        { etiqueta: "Fecha", valor: fechaCorta(r.fecha), ancho: 0.3 },
        { etiqueta: "Folio", valor: r.folio, ancho: 0.3 },
        { etiqueta: "Realizada por", valor: r.realizada_por ?? "", ancho: 0.4 },
      ],
    });
  }

  // Las secciones propias del formato.
  for (const sec of tipo?.secciones ?? []) {
    const cortos = sec.campos.filter((c) => c.tipo !== "area");
    const areas = sec.campos.filter((c) => c.tipo === "area");
    bloques.push({ tipo: "espacio", alto: 6 });
    bloques.push({ tipo: "seccion", texto: sec.titulo });
    // Se reparten en renglones según el ancho que declara cada campo.
    let fila: { etiqueta: string; valor: string; ancho: number }[] = [];
    let suma = 0;
    for (const c of cortos) {
      const ancho = c.ancho ?? 0.5;
      if (suma + ancho > 1.001 && fila.length) {
        bloques.push({ tipo: "campos", campos: fila });
        fila = [];
        suma = 0;
      }
      fila.push({ etiqueta: c.etiqueta, valor: valorDe(c), ancho });
      suma += ancho;
    }
    if (fila.length) bloques.push({ tipo: "campos", campos: fila });
    for (const a of areas) bloques.push({ tipo: "texto", etiqueta: `${a.etiqueta}:`, alto: 46, contenido: valorDe(a) });
  }

  // Los puntos de revisión, con lo que se marcó.
  for (const g of tipo?.grupos ?? []) {
    const marcas: Record<string, string> = {};
    for (const p of g.puntos) marcas[p] = datos[`punto:${g.titulo}:${p}`] ?? datos[`punto:${p}`] ?? "";
    bloques.push({ tipo: "espacio", alto: 6 });
    bloques.push({ tipo: "seccion", texto: g.titulo });
    bloques.push({ tipo: "puntos", puntos: g.puntos, marcas, columnas: g.puntos.length > 6 ? 2 : 1 });
  }

  bloques.push({ tipo: "espacio", alto: 6 });
  bloques.push({ tipo: "seccion", texto: "RESULTADO" });
  bloques.push({
    tipo: "casillas",
    campos: [
      {
        etiqueta: "Hallazgos",
        ancho: 0.4,
        opciones: ["Si", "No"],
        marcada: r.resultado === "CON_HALLAZGOS" ? "Si" : "No",
      },
      { etiqueta: "Realizada por", ancho: 0.6, valor: r.realizada_por ?? undefined },
    ],
  });
  bloques.push({ tipo: "texto", etiqueta: "Observaciones:", alto: 56, contenido: r.observaciones ?? "" });

  return {
    codigo: tipo?.codigo ?? r.tipo,
    titulo: tipo?.titulo ?? r.tipo,
    bloques,
    registro:
      `Registro ${r.folio} capturado en Control TI el ${fechaLarga(r.created_at.slice(0, 10))}` +
      `${r.realizada_por ? ` por ${r.realizada_por}` : ""}. ` +
      `${getConfig("empresa")} — documento generado por el sistema, no requiere firma autógrafa.`,
  };
}

export async function pdfDeRevisiones(revisiones: Revision[]): Promise<Uint8Array> {
  return generarFormato(revisiones.map(hojaDeRevision), "Revisiones-IT");
}

/** Siguiente folio del tipo, por año. */
export function siguienteFolioRevision(tipo: TipoRevision): string {
  const anio = new Date().getFullYear();
  const c = (
    db.prepare("SELECT COUNT(*) AS c FROM revisiones WHERE folio LIKE ?").get(`${tipo.prefijo}-${anio}-%`) as { c: number }
  ).c;
  return `${tipo.prefijo}-${anio}-${String(c + 1).padStart(3, "0")}`;
}
