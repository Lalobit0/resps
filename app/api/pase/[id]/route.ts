import fs from "fs";
import path from "path";
import { db } from "../../../../lib/db";
import { puedeApi } from "../../../../lib/apiGuardia";

export const dynamic = "force-dynamic";

const TIPOS_CONTENIDO: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/** El pase de préstamo: el escaneo firmado si lo hay, si no el que se imprime. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const veto = await puedeApi("ti.ver");
  if (veto) return veto;
  const { id } = await params;
  const p = db.prepare("SELECT folio, pdf_path, pdf_firmado FROM prestamos WHERE id = ?").get(Number(id)) as
    | { folio: string; pdf_path: string | null; pdf_firmado: string | null }
    | undefined;

  // Con ?original=1 se pide el que genera el sistema, que es el que se
  // imprime para llevar a firmar.
  const original = new URL(req.url).searchParams.get("original") === "1";
  const elegido = !original && p?.pdf_firmado ? p.pdf_firmado : p?.pdf_path;
  if (!elegido) return new Response("Archivo no encontrado", { status: 404 });

  const ruta = path.isAbsolute(elegido) ? elegido : path.join(process.cwd(), elegido);
  if (!fs.existsSync(ruta)) return new Response("El archivo no existe en el disco", { status: 404 });

  const ext = path.extname(ruta).toLowerCase();
  const buf = fs.readFileSync(ruta);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TIPOS_CONTENIDO[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${p?.folio ?? "pase"}${ext}"`,
    },
  });
}
