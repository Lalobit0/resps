import { db } from "../../../../lib/db";
import { construirPdf, construirXlsx, type Celda } from "../../../../lib/exportar";
import { ETIQUETA_CLASE, ETIQUETA_ESTADO, ETIQUETA_TIPO } from "../../../../lib/constants";
import { dinero, fechaCorta } from "../../../../lib/helpers";

export const dynamic = "force-dynamic";

type Reporte = { titulo: string; columnas: string[]; pesos: number[]; filas: Celda[][] };

function like(v: string) {
  return `%${v}%`;
}

function reporteEmpleados(sp: URLSearchParams): Reporte {
  const q = (sp.get("q") || "").trim();
  const depto = sp.get("depto") || "";
  const clase = sp.get("clase") || "";
  const estado = sp.get("estado") || "";
  const cond: string[] = [];
  const val: (string | number)[] = [];
  if (estado === "activos") cond.push("e.activo = 1");
  if (estado === "inactivos") cond.push("e.activo = 0");
  if (depto) {
    cond.push("e.departamento = ?");
    val.push(depto);
  }
  if (clase) {
    cond.push("COALESCE(e.clase,'') = ?");
    val.push(clase);
  }
  if (q) {
    cond.push(
      "(e.nombre LIKE ? OR e.numero_empleado LIKE ? OR e.puesto LIKE ? OR e.departamento LIKE ? OR COALESCE(e.area,'') LIKE ? OR COALESCE(e.supervisor,'') LIKE ? OR COALESCE(e.clase,'') LIKE ?)"
    );
    for (let i = 0; i < 7; i++) val.push(like(q));
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id) AS eq
       FROM empleados e ${where}
       ORDER BY CAST(e.numero_empleado AS INTEGER) ASC, e.numero_empleado ASC`
    )
    .all(...val) as Record<string, unknown>[];
  return {
    titulo: "Empleados",
    columnas: ["No.", "Nombre", "Clase", "Puesto", "Departamento", "Área", "Jefe directo", "Alta", "Correo", "Teléfono", "Eq.", "Estado"],
    pesos: [5, 16, 8, 12, 11, 9, 12, 7, 14, 8, 3, 6],
    filas: rows.map((e) => [
      e.numero_empleado as string,
      e.nombre as string,
      (e.clase as string) ?? "",
      e.puesto as string,
      e.departamento as string,
      (e.area as string) ?? "",
      (e.supervisor as string) ?? "",
      fechaCorta(e.fecha_alta as string | null),
      (e.correo as string) ?? "",
      (e.telefono as string) ?? "",
      e.eq as number,
      e.activo ? "Activo" : "Inactivo",
    ]),
  };
}

function reporteInventario(sp: URLSearchParams): Reporte {
  const q = (sp.get("q") || "").trim();
  const tipo = sp.get("tipo") || "";
  const estado = sp.get("estado") || "";
  const cond: string[] = [];
  const val: (string | number)[] = [];
  if (estado) {
    cond.push("e.estado = ?");
    val.push(estado);
  }
  if (tipo) {
    cond.push("e.tipo = ?");
    val.push(tipo);
  }
  if (q) {
    cond.push(
      "(e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR e.numero_serie LIKE ? OR COALESCE(em.nombre,'') LIKE ? OR COALESCE(em.numero_empleado,'') LIKE ?)"
    );
    for (let i = 0; i < 6; i++) val.push(like(q));
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero
       FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a ${where}
       ORDER BY e.codigo ASC`
    )
    .all(...val) as Record<string, unknown>[];
  return {
    titulo: "Inventario de equipo",
    columnas: ["Código", "Tipo", "Marca", "Modelo", "Serie", "Estado", "Asignado a", "Compra", "Costo", "Detalle"],
    pesos: [8, 8, 9, 12, 10, 8, 15, 7, 7, 16],
    filas: rows.map((e) => [
      e.codigo as string,
      ETIQUETA_TIPO[e.tipo as string] ?? (e.tipo as string),
      (e.marca as string) ?? "",
      (e.modelo as string) ?? "",
      (e.numero_serie as string) ?? "",
      ETIQUETA_ESTADO[e.estado as string] ?? (e.estado as string),
      e.asignado_nombre ? `${e.asignado_numero} ${e.asignado_nombre}` : "",
      fechaCorta(e.fecha_compra as string | null),
      e.costo !== null ? dinero(e.costo as number) : "",
      (e.specs as string) ?? "",
    ]),
  };
}

function reporteResponsivas(sp: URLSearchParams): Reporte {
  const q = (sp.get("q") || "").trim();
  const tipo = sp.get("tipo") || "";
  const estado = sp.get("estado") || "";
  const cond: string[] = [];
  const val: (string | number)[] = [];
  if (tipo) {
    cond.push("r.tipo = ?");
    val.push(tipo);
  }
  if (estado) {
    cond.push("r.estado = ?");
    val.push(estado);
  }
  if (q) {
    cond.push("(r.folio LIKE ? OR em.nombre LIKE ? OR em.numero_empleado LIKE ?)");
    for (let i = 0; i < 3; i++) val.push(like(q));
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT r.*, em.nombre AS empleado_nombre, em.numero_empleado AS empleado_numero,
        (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r JOIN empleados em ON em.id = r.empleado_id ${where}
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all(...val) as Record<string, unknown>[];
  return {
    titulo: "Cartas responsivas",
    columnas: ["Folio", "Tipo", "Clase", "No.", "Empleado", "Equipos", "Fecha", "Estado", "Origen"],
    pesos: [11, 9, 8, 5, 16, 12, 7, 7, 8],
    filas: rows.map((r) => [
      r.folio as string,
      r.tipo === "ASIGNACION" ? "Asignación" : "Devolución",
      ETIQUETA_CLASE[r.clase as string] ?? (r.clase as string),
      r.empleado_numero as string,
      r.empleado_nombre as string,
      (r.equipos as string) ?? "",
      fechaCorta(r.fecha as string),
      r.estado as string,
      r.origen === "CARGADA" ? "Cargada" : "Sistema",
    ]),
  };
}

const REPORTES: Record<string, (sp: URLSearchParams) => Reporte> = {
  empleados: reporteEmpleados,
  inventario: reporteInventario,
  responsivas: reporteResponsivas,
};

export async function GET(req: Request, { params }: { params: Promise<{ tabla: string }> }) {
  const { tabla } = await params;
  const constructor = REPORTES[tabla];
  if (!constructor) return new Response("Reporte no válido", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const formato = sp.get("formato") === "pdf" ? "pdf" : "xlsx";
  const rep = constructor(sp);
  const hoy = new Date().toISOString().slice(0, 10);
  const base = `${tabla}-${hoy}`;

  if (formato === "pdf") {
    const bytes = await construirPdf(rep.titulo, rep.columnas, rep.filas, rep.pesos);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }
  const bytes = await construirXlsx(rep.titulo, rep.columnas, rep.filas);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
