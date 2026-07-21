import fs from "fs";
import path from "path";
import { BACKUP_DIR } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const NOMBRE_OK = /^app-\d{8}-\d{6}\.db$/;

export async function GET(_req: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params;
  if (!NOMBRE_OK.test(nombre)) return new Response("Nombre no válido", { status: 400 });
  const ruta = path.join(BACKUP_DIR, nombre);
  if (!fs.existsSync(ruta)) return new Response("Respaldo no encontrado", { status: 404 });
  const buf = fs.readFileSync(ruta);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
