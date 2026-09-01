import { notFound } from "next/navigation";
import { exigirPagina } from "../../../lib/guardia";
import { puede } from "../../../lib/auth";
import { db } from "../../../lib/db";
import {
  asegurarExpediente,
  calcularCumplimiento,
  historialDeExpediente,
  requisitosDe,
  sincronizarRequisitos,
  tiposDocumento,
} from "../../../lib/expedientes";
import type { Empleado } from "../../../lib/types";
import ExpedienteClient from "../../../components/ExpedienteClient";

export const dynamic = "force-dynamic";

export default async function PaginaExpediente({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPagina("exp.ver");
  const { id } = await params;
  const empleadoId = Number(id);
  if (!Number.isInteger(empleadoId) || empleadoId <= 0) notFound();

  const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(empleadoId) as Empleado | undefined;
  if (!empleado) notFound();

  // El expediente se abre solo la primera vez que alguien entra, y sus
  // requisitos se ponen al día contra la matriz en cada visita: así un cambio
  // de puesto o una regla nueva se reflejan sin que nadie tenga que acordarse
  // de recalcular.
  const expedienteId = asegurarExpediente(empleadoId);
  sincronizarRequisitos(empleadoId);

  const requisitos = requisitosDe(empleadoId);
  const cumplimiento = calcularCumplimiento(requisitos);
  const historial = historialDeExpediente(expedienteId);

  const notas = db
    .prepare("SELECT * FROM exp_notas WHERE expediente_id = ? ORDER BY fecha DESC, id DESC")
    .all(expedienteId) as {
    id: number;
    texto: string;
    visibilidad: string;
    autor: string | null;
    fecha: string;
    documento_id: number | null;
  }[];

  const archivados = db
    .prepare(
      `SELECT d.id, d.archivado_motivo, d.archivado_por, d.archivado_en, t.nombre AS tipo_nombre
       FROM documentos d JOIN doc_tipos t ON t.id = d.doc_tipo_id
       WHERE d.expediente_id = ? AND d.situacion != 'ACTIVO' ORDER BY d.archivado_en DESC`
    )
    .all(expedienteId) as {
    id: number;
    archivado_motivo: string | null;
    archivado_por: string | null;
    archivado_en: string | null;
    tipo_nombre: string;
  }[];

  // Los que todavía no están en su lista, para poder agregarlos a mano.
  const yaPuestos = new Set(requisitos.map((r) => r.doc_tipo_id));
  const disponibles = tiposDocumento(true).filter((t) => !yaPuestos.has(t.id));

  const permisos = {
    cargar: puede(u, "exp.cargar"),
    validar: puede(u, "exp.validar"),
    rechazar: puede(u, "exp.rechazar"),
    verDocumentos: puede(u, "exp.ver_documentos"),
    verConfidencial: puede(u, "exp.ver_confidencial"),
    descargar: puede(u, "exp.descargar"),
    editarMetadatos: puede(u, "exp.editar_metadatos"),
    eliminar: puede(u, "exp.eliminar"),
    noAplica: puede(u, "exp.no_aplica"),
    requisitos: puede(u, "exp.requisitos"),
    comentar: puede(u, "exp.comentar"),
    editarEmpleado: puede(u, "empleados.editar"),
  };

  return (
    <ExpedienteClient
      empleado={empleado}
      requisitos={requisitos}
      cumplimiento={cumplimiento}
      historial={historial}
      notas={notas}
      archivados={archivados}
      disponibles={disponibles}
      permisos={permisos}
      yo={u.nombre}
    />
  );
}
