import { recolectarAvisos } from "../../../lib/avisos";

export const dynamic = "force-dynamic";

/** Los pendientes del sistema, para la campana. */
export async function GET() {
  try {
    const avisos = recolectarAvisos();
    return Response.json(
      { avisos, total: avisos.reduce((s, a) => s + a.total, 0) },
      // Siempre fresco: si acabas de resolver algo, la campana lo refleja.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error(e);
    return Response.json({ avisos: [], total: 0 }, { status: 200 });
  }
}
