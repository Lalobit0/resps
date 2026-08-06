import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Sirve una página suelta del lote que se está revisando. Vive solo mientras
 * dura la revisión: al confirmar, la carpeta temporal se borra.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clave: string[] }> }) {
  const { clave } = await params;
  const relativa = clave.join("/");
  // Solo se admite <sesion>/<n>.pdf: nada de subir por el árbol de carpetas.
  if (!/^[\w.-]+\/\d+\.pdf$/.test(relativa)) return new Response("Ruta no válida", { status: 400 });

  const ruta = path.join(process.cwd(), "storage", "lote", relativa);
  if (!fs.existsSync(ruta)) return new Response("La página ya no está disponible", { status: 404 });

  const buf = fs.readFileSync(ruta);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${path.basename(ruta)}"` },
  });
}
