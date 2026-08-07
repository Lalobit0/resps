import { empleadosParaBitacora, hojasBitacoraRemota } from "../../../lib/bitacora-remota";

export const dynamic = "force-dynamic";

/**
 * Hojas del FSI-04 con los datos del usuario y su equipo ya puestos, listas
 * para llenar al hacer cada revisión.
 *
 *   /api/bitacora-remota                       -> todos los que tienen cómputo
 *   /api/bitacora-remota?depto=SISTEMAS        -> solo ese departamento
 *   /api/bitacora-remota?empleado=12           -> solo ese empleado
 *   /api/bitacora-remota?copias=2              -> dos hojas de cada uno
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const depto = url.searchParams.get("depto") ?? "";
  const empleado = Number(url.searchParams.get("empleado") ?? "");
  const copias = Math.min(Math.max(Number(url.searchParams.get("copias") ?? "1") || 1, 1), 12);

  const filas = empleadosParaBitacora({
    departamento: depto || undefined,
    empleadoId: Number.isInteger(empleado) && empleado > 0 ? empleado : undefined,
  });
  if (!filas.length) {
    return new Response("No hay empleados activos con equipo de cómputo entregado para ese filtro", { status: 404 });
  }

  const bytes = await hojasBitacoraRemota(filas, copias);
  const nombre = `FSI-04-bitacora-remota${depto ? `-${depto.replace(/[^\w-]+/g, "_")}` : ""}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // Se abre en el visor para mandarlo directo a la impresora.
      "Content-Disposition": `inline; filename="${nombre}"`,
    },
  });
}
