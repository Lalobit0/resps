import { NextRequest } from "next/server";
import { db } from "../../../../lib/db";
import { bytesAsignacion } from "../../../../lib/documento";
import { conceptoVale } from "../../../../lib/vales";
import { hoyISO } from "../../../../lib/helpers";
import type { Empleado } from "../../../../lib/types";
import { puedeApi } from "../../../../lib/apiGuardia";

export const dynamic = "force-dynamic";

/**
 * Vista previa del vale, sin guardar nada.
 *
 * Arma el PDF con la misma función que lo genera de verdad, así que lo que se
 * ve aquí es palabra por palabra lo que va a salir impreso. No toca la base:
 * no se aparta folio ni se guarda archivo, así que se puede mirar y cambiar de
 * opinión las veces que haga falta.
 */
export async function GET(req: NextRequest) {
  const veto = await puedeApi("ti.editar");
  if (veto) return veto;
  const sp = req.nextUrl.searchParams;
  const empleadoId = Number(sp.get("empleado"));
  const conceptoId = Number(sp.get("concepto"));
  const fecha = (sp.get("fecha") || "").trim();
  const clausula = (sp.get("clausula") || "").trim();

  const empleado = empleadoId
    ? (db.prepare("SELECT * FROM empleados WHERE id = ?").get(empleadoId) as Empleado | undefined)
    : undefined;
  const concepto = conceptoId ? conceptoVale(conceptoId) : undefined;

  if (!empleado || !concepto) {
    return new Response("Elige el empleado y el concepto para ver la vista previa.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const bytes = await bytesAsignacion({
      clase: "VALE",
      // El vale no imprime folio; el real se aparta hasta que se guarda.
      folio: "BORRADOR",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyISO(),
      observaciones: null,
      concepto: concepto.concepto,
      monto: concepto.monto,
      montoTexto: concepto.texto,
      clausula: clausula || concepto.clausula,
      firmaEmpleado: null,
      firmaAutoridad: null,
      firmante: null,
      empleado,
      equipo: undefined,
    });

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="vista-previa-vale.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response("No se pudo armar la vista previa.", { status: 500 });
  }
}
