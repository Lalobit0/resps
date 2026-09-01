import fs from "fs";
import { NextRequest } from "next/server";
import { db } from "../../../../../lib/db";
import { puede, usuarioActual } from "../../../../../lib/auth";
import { anotar, anotarDenegado } from "../../../../../lib/bitacora";
import { rutaAbsoluta, seVeEnPantalla } from "../../../../../lib/archivos";
import { anotarExpediente } from "../../../../../lib/expedientes";

/**
 * La única puerta a los archivos del expediente.
 *
 * Los archivos viven fuera de `public/`, así que esta ruta es la forma de
 * abrirlos — y por eso aquí se revisa todo: que la persona tenga acceso a
 * expedientes, que si el documento es confidencial tenga además ese permiso, y
 * que si lo va a descargar pueda descargar.
 *
 * Cada apertura queda registrada con nombre y hora. Es lo que permite contestar
 * "¿quién abrió el certificado médico de fulano?", que es justo lo que una
 * auditoría de datos personales pregunta.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioActual();
  if (!u) return new Response("Tu sesión expiró. Vuelve a entrar.", { status: 401 });

  const { id } = await params;
  const archivoId = Number(id);
  if (!Number.isInteger(archivoId) || archivoId <= 0) return new Response("No encontrado", { status: 404 });

  const fila = db
    .prepare(
      `SELECT a.ruta, a.mime, a.nombre_original,
              t.nombre AS tipo_nombre, t.confidencialidad, t.id AS tipo_id,
              d.id AS documento_id, d.expediente_id,
              em.nombre AS empleado, em.numero_empleado
       FROM doc_archivos a
       JOIN doc_versiones v ON v.id = a.version_id
       JOIN documentos d ON d.id = v.documento_id
       JOIN doc_tipos t ON t.id = d.doc_tipo_id
       JOIN empleados em ON em.id = d.empleado_id
       WHERE a.id = ?`
    )
    .get(archivoId) as
    | {
        ruta: string;
        mime: string | null;
        nombre_original: string;
        tipo_nombre: string;
        confidencialidad: string;
        tipo_id: number;
        documento_id: number;
        expediente_id: number;
        empleado: string;
        numero_empleado: string;
      }
    | undefined;
  if (!fila) return new Response("No encontrado", { status: 404 });

  const descarga = req.nextUrl.searchParams.get("descargar") === "1";

  const rechazar = async (motivo: string) => {
    await anotarDenegado(
      descarga ? "EXP_DESCARGA" : "EXP_CONSULTA",
      `Intento de ${descarga ? "descargar" : "abrir"} ${fila.tipo_nombre} de ${fila.empleado}: ${motivo}`,
      "DOCUMENTO",
      fila.documento_id
    );
    return new Response("No tienes permiso para abrir este documento.", { status: 403 });
  };

  if (!puede(u, "exp.ver_documentos")) return rechazar("no puede abrir documentos");
  if (fila.confidencialidad !== "GENERAL" && !puede(u, "exp.ver_confidencial")) {
    return rechazar(`el documento es ${fila.confidencialidad.toLowerCase()}`);
  }
  if (descarga && !puede(u, "exp.descargar")) return rechazar("no puede descargar");

  const completa = rutaAbsoluta(fila.ruta);
  if (!completa) return new Response("El archivo ya no está en el servidor.", { status: 404 });

  await anotar({
    accion: descarga ? "EXP_DESCARGA" : "EXP_CONSULTA",
    descripcion: `${descarga ? "Descargó" : "Abrió"} ${fila.tipo_nombre} de ${fila.empleado} (${fila.numero_empleado})`,
    entidad: "DOCUMENTO",
    entidadId: fila.documento_id,
  });
  // La descarga también se ve en el timeline del expediente: abrir es rutina,
  // pero llevarse una copia es lo que una auditoría querría revisar.
  if (descarga) {
    anotarExpediente(
      fila.expediente_id,
      "DESCARGA",
      `Se descargó ${fila.tipo_nombre}`,
      u.nombre,
      fila.documento_id,
      fila.tipo_id
    );
  }

  const mime = fila.mime ?? "application/octet-stream";
  const enPantalla = !descarga && seVeEnPantalla(mime);
  // El nombre se saca del ASCII para que ningún encabezado se rompa con acentos.
  const seguro = fila.nombre_original.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  return new Response(new Uint8Array(fs.readFileSync(completa)), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${enPantalla ? "inline" : "attachment"}; filename="${seguro}"`,
      // Un expediente no se guarda en la caché de un proxy compartido.
      "Cache-Control": "private, no-store",
    },
  });
}
