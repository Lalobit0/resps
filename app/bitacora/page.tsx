import { db } from "../../lib/db";
import type { Bitacora } from "../../lib/types";
import { PageHeader } from "../../components/ui";
import BitacoraClient from "../../components/BitacoraClient";
import BitacoraFiltros from "../../components/BitacoraFiltros";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

const ETIQUETA_ACCION: Record<string, string> = {
  ELIMINAR_RESPONSIVA: "Eliminación de responsiva",
  REVERTIR_ELIMINACION: "Restauración de responsiva",
  ACCESO: "Entrada al sistema",
  ACCESO_FALLIDO: "Intento de acceso fallido",
  SALIDA: "Salida del sistema",
  CAMBIO_CLAVE: "Cambio de contraseña",
  USUARIO_ALTA: "Alta de usuario",
  USUARIO_EDITA: "Cambio de usuario",
  USUARIO_CLAVE: "Contraseña restablecida",
  ROL_ALTA: "Rol creado",
  ROL_EDITA: "Permisos cambiados",
  ROL_BAJA: "Rol eliminado",
  EXP_APERTURA: "Expediente abierto",
  EXP_CARGA: "Documento cargado",
  EXP_VALIDACION: "Documento validado",
  EXP_RECHAZO: "Documento rechazado",
  EXP_CORRECCION: "Datos corregidos",
  EXP_CONSULTA: "Documento abierto",
  EXP_DESCARGA: "Documento descargado",
  EXP_ARCHIVADO: "Documento archivado",
  EXP_RESTAURADO: "Documento restaurado",
  EXP_NO_APLICA: "Requisito excusado",
  EXP_NO_APLICA_QUITADO: "Requisito vuelve a pedirse",
  EXP_REQUISITO_ALTA: "Requisito agregado",
  EXP_REQUISITO_BAJA: "Requisito quitado",
  EXP_NOTA: "Nota en expediente",
  TIPO_ALTA: "Tipo de documento creado",
  TIPO_EDITA: "Tipo de documento cambiado",
  TIPO_ACTIVA: "Tipo de documento reactivado",
  TIPO_DESACTIVA: "Tipo de documento desactivado",
  CAT_ALTA: "Categoría creada",
  CAT_EDITA: "Categoría editada",
  CAT_BAJA: "Categoría eliminada",
  MATRIZ_ALTA: "Regla creada",
  MATRIZ_EDITA: "Regla cambiada",
  MATRIZ_BAJA: "Regla eliminada",
  MATRIZ_PAQUETE: "Paquete básico aplicado",
};

/**
 * La bitácora.
 *
 * Antes solo servía para poder deshacer eliminaciones de inventario. Ahora
 * también es el rastro de quién tocó qué en los expedientes de personal, así
 * que cada renglón trae responsable y desde dónde, y los intentos rechazados
 * quedan igual que los que sí ocurrieron.
 */
export default async function PaginaBitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("auditoria.ver");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const entidad = typeof sp.entidad === "string" ? sp.entidad : "";
  const soloDenegados = sp.denegados === "1";

  const condiciones: string[] = [];
  const valores: (string | number)[] = [];
  if (q) {
    condiciones.push("(descripcion LIKE ? OR usuario LIKE ? OR accion LIKE ?)");
    valores.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (entidad) {
    condiciones.push("entidad = ?");
    valores.push(entidad);
  }
  if (soloDenegados) condiciones.push("resultado = 'DENEGADO'");

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const entradas = db
    .prepare(`SELECT * FROM bitacora ${where} ORDER BY id DESC LIMIT 500`)
    .all(...valores) as (Bitacora & {
    usuario: string | null;
    ip: string | null;
    entidad: string | null;
    entidad_id: number | null;
    antes: string | null;
    despues: string | null;
    resultado: string;
  })[];

  const entidades = (
    db
      .prepare("SELECT DISTINCT entidad AS e FROM bitacora WHERE entidad IS NOT NULL ORDER BY e")
      .all() as { e: string }[]
  ).map((r) => r.e);

  const denegados = (
    db.prepare("SELECT COUNT(*) AS c FROM bitacora WHERE resultado = 'DENEGADO'").get() as { c: number }
  ).c;

  return (
    <>
      <PageHeader eyebrow="Auditoría" title="Bitácora de movimientos">
        <span className="text-sm text-soft">{entradas.length} de los últimos movimientos</span>
      </PageHeader>

      <p className="mb-4 max-w-3xl text-sm text-soft">
        Quién hizo qué, cuándo y desde dónde. Las eliminaciones de responsivas se pueden <b>revertir</b>: se restaura el
        documento y su equipo vuelve al inventario tal como estaba. Los intentos que el sistema rechazó por falta de
        permiso también quedan aquí{denegados ? ` (${denegados} hasta ahora)` : ""}.
      </p>

      <BitacoraFiltros entidades={entidades} q={q} entidad={entidad} denegados={soloDenegados} />

      <BitacoraClient entradas={entradas} etiquetaAccion={ETIQUETA_ACCION} />
    </>
  );
}
