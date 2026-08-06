import fs from "fs";
import path from "path";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

/**
 * Archivero completo en un ZIP, ordenado por departamento y dentro por
 * empleado. No mueve nada: arma la copia al vuelo desde lo que ya está
 * guardado, para respaldo o auditoría.
 *
 *   /api/archivero               -> por departamento / empleado
 *   /api/archivero?por=empleado  -> solo por empleado
 */

/** Nombre seguro para carpeta o archivo dentro del ZIP. */
function limpio(v: string, porDefecto: string): string {
  const s = (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || porDefecto;
}

type Fila = {
  folio: string;
  fecha: string;
  tipo: string;
  clase: string;
  estado: string;
  pdf_path: string | null;
  pdf_firmado: string | null;
  numero_empleado: string;
  nombre: string;
  departamento: string;
  area: string | null;
};

export async function GET(req: Request) {
  const porEmpleado = new URL(req.url).searchParams.get("por") === "empleado";

  const filas = db
    .prepare(
      `SELECT r.folio, r.fecha, r.tipo, r.clase, r.estado, r.pdf_path, r.pdf_firmado,
              em.numero_empleado, em.nombre, em.departamento, em.area
       FROM responsivas r
       JOIN empleados em ON em.id = r.empleado_id
       WHERE r.estado != 'ELIMINADA'
       ORDER BY em.departamento, CAST(em.numero_empleado AS INTEGER), r.fecha`
    )
    .all() as Fila[];

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const indice: string[] = ["Carpeta;Folio;Fecha;Tipo;Clase;Estado;Firmada;Archivo"];
  let incluidas = 0;

  for (const f of filas) {
    // Manda el documento firmado; si no hay, el que generó el sistema.
    const relativa = f.pdf_firmado || f.pdf_path;
    const firmada = f.pdf_firmado ? "Sí" : "No";
    const carpetaEmpleado = `${limpio(f.numero_empleado, "sin-numero")} ${limpio(f.nombre, "sin nombre")}`;
    const carpeta = porEmpleado
      ? carpetaEmpleado
      : `${limpio(f.departamento || f.area || "", "SIN DEPARTAMENTO")}/${carpetaEmpleado}`;

    if (!relativa) {
      indice.push(`${carpeta};${f.folio};${f.fecha};${f.tipo};${f.clase};${f.estado};${firmada};(sin archivo)`);
      continue;
    }
    const abs = path.isAbsolute(relativa) ? relativa : path.join(process.cwd(), relativa);
    if (!fs.existsSync(abs)) {
      indice.push(`${carpeta};${f.folio};${f.fecha};${f.tipo};${f.clase};${f.estado};${firmada};(archivo no encontrado)`);
      continue;
    }

    const ext = path.extname(abs) || ".pdf";
    const nombre = `${f.folio}${f.pdf_firmado ? "-firmada" : ""}${ext}`;
    zip.file(`${carpeta}/${nombre}`, fs.readFileSync(abs));
    indice.push(`${carpeta};${f.folio};${f.fecha};${f.tipo};${f.clase};${f.estado};${firmada};${nombre}`);
    incluidas += 1;
  }

  // Índice para poder buscar sin abrir carpeta por carpeta (Excel lo abre solo).
  zip.file("indice.csv", "﻿" + indice.join("\r\n"));

  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const hoy = new Date().toISOString().slice(0, 10);
  const archivo = `archivero-responsivas-${porEmpleado ? "por-empleado" : "por-departamento"}-${hoy}.zip`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "X-Responsivas-Incluidas": String(incluidas),
    },
  });
}
