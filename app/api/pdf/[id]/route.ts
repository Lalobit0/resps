import fs from "fs";
import path from "path";
import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = db.prepare("SELECT folio, pdf_path FROM responsivas WHERE id = ?").get(Number(id)) as
    | { folio: string; pdf_path: string | null }
    | undefined;

  if (!r?.pdf_path) return new Response("PDF no encontrado", { status: 404 });

  const ruta = path.isAbsolute(r.pdf_path) ? r.pdf_path : path.join(process.cwd(), r.pdf_path);
  if (!fs.existsSync(ruta)) return new Response("El archivo PDF no existe en el disco", { status: 404 });

  const buf = fs.readFileSync(ruta);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.folio}.pdf"`,
    },
  });
}
