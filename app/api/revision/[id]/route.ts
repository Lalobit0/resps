import { listarRevisiones, obtenerRevision, pdfDeRevisiones } from "../../../../lib/revisiones";
import { puedeApi } from "../../../../lib/apiGuardia";

export const dynamic = "force-dynamic";

/**
 * El documento de una revisión ya capturada.
 *
 *   /api/revision/12      -> esa sola
 *   /api/revision/todas   -> el expediente completo, una hoja por registro
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const veto = await puedeApi("ti.ver");
  if (veto) return veto;
  const { id } = await params;

  const revisiones = id === "todas" ? listarRevisiones() : [obtenerRevision(Number(id))].filter((r) => !!r);
  if (!revisiones.length) return new Response("Ese registro ya no existe", { status: 404 });

  const bytes = await pdfDeRevisiones(revisiones);
  const nombre = id === "todas" ? "Revisiones-IT.pdf" : `${revisiones[0].folio}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"` },
  });
}
