import fs from "fs";
import path from "path";
import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const TIPOS_CONTENIDO: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = db.prepare("SELECT folio, pdf_path, pdf_firmado FROM responsivas WHERE id = ?").get(Number(id)) as
    | { folio: string; pdf_path: string | null; pdf_firmado: string | null }
    | undefined;

  // Manda el documento firmado cuando existe; con ?original=1 se pide el que
  // genera el sistema, que es el que se imprime para llevar a firmar.
  const original = new URL(req.url).searchParams.get("original") === "1";
  const elegido = !original && r?.pdf_firmado ? r.pdf_firmado : r?.pdf_path;
  if (!elegido) return new Response("Archivo no encontrado", { status: 404 });

  const ruta = path.isAbsolute(elegido) ? elegido : path.join(process.cwd(), elegido);
  if (!fs.existsSync(ruta)) return new Response("El archivo no existe en el disco", { status: 404 });

  const ext = path.extname(ruta).toLowerCase();
  const contentType = TIPOS_CONTENIDO[ext] ?? "application/octet-stream";
  const buf = fs.readFileSync(ruta);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${r?.folio ?? "responsiva"}${ext}"`,
    },
  });
}
