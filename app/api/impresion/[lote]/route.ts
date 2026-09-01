import path from "path";
import { responsivasDeLote } from "../../../../lib/pendientes";
import { unirPdfs } from "../../../../lib/lote";
import { puedeApi } from "../../../../lib/apiGuardia";

export const dynamic = "force-dynamic";

/**
 * El paquete de un lote en un solo PDF, listo para mandar a la impresora.
 *
 * Se arma al vuelo con las cartas que hoy siguen vivas, así que reimprimir
 * después de borrar alguna da el paquete correcto sin hojas de más.
 *
 *   /api/impresion/L-20260806-1432                -> todas las del lote
 *   /api/impresion/L-20260806-1432?pendientes=1   -> solo las que faltan firmar
 */
export async function GET(req: Request, { params }: { params: Promise<{ lote: string }> }) {
  const veto = await puedeApi("ti.ver");
  if (veto) return veto;
  const { lote } = await params;
  if (!/^[\w-]{3,40}$/.test(lote)) return new Response("Lote no válido", { status: 400 });

  const soloPendientes = new URL(req.url).searchParams.get("pendientes") === "1";
  const cartas = responsivasDeLote(lote).filter((r) => (soloPendientes ? !r.firmada : true));
  if (!cartas.length) return new Response("Ese lote ya no tiene cartas que imprimir", { status: 404 });

  const conPdf = cartas.filter((r) => r.pdf_path);
  const { bytes, incluidos, omitidos } = await unirPdfs(
    conPdf.map((r) => ({ ruta: path.join(process.cwd(), r.pdf_path as string), etiqueta: r.folio }))
  );
  if (!incluidos.length) return new Response("No se encontró el PDF de ninguna carta del lote", { status: 404 });
  if (omitidos.length) console.error(`Lote ${lote}: no se pudieron unir ${omitidos.map((o) => o.etiqueta).join(", ")}`);

  const nombre = soloPendientes ? `${lote}-pendientes.pdf` : `${lote}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // Se abre en el visor para poder imprimirlo de una vez.
      "Content-Disposition": `inline; filename="${nombre}"`,
    },
  });
}
