import { db } from "../../lib/db";
import type { Bitacora } from "../../lib/types";
import { Badge, Card, Empty, PageHeader, tdCls, thCls } from "../../components/ui";
import RevertirBtn from "../../components/RevertirBtn";
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

function responsivaDe(b: Bitacora): number | null {
  if (b.accion !== "ELIMINAR_RESPONSIVA" || !b.snapshot) return null;
  try {
    const s = JSON.parse(b.snapshot) as { responsivaId?: number };
    return s.responsivaId ?? null;
  } catch {
    return null;
  }
}

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

      {entradas.length === 0 ? (
        <Empty>No hay movimientos que coincidan con eso.</Empty>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-paper/70">
                <tr>
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Quién</th>
                  <th className={thCls}>Acción</th>
                  <th className={thCls}>Detalle</th>
                  <th className={thCls}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((b) => (
                  <tr key={b.id} className="border-b border-line/60 last:border-0 align-top">
                    <td className={`${tdCls} whitespace-nowrap text-xs text-soft`}>{b.fecha}</td>
                    <td className={`${tdCls} text-xs`}>
                      <span className="text-ink">{b.usuario ?? "—"}</span>
                      {b.ip ? <div className="text-soft">{b.ip}</div> : null}
                    </td>
                    <td className={`${tdCls} text-xs`}>
                      {ETIQUETA_ACCION[b.accion] ?? b.accion}
                      {b.entidad ? <div className="text-soft">{b.entidad.toLowerCase()}</div> : null}
                    </td>
                    <td className={tdCls}>
                      {b.descripcion}
                      {b.antes || b.despues ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-soft">Ver qué cambió</summary>
                          <div className="mt-1 grid gap-2 md:grid-cols-2">
                            {b.antes ? (
                              <pre className="overflow-x-auto rounded bg-paper p-2 text-[11px] text-soft">
                                antes: {b.antes}
                              </pre>
                            ) : null}
                            {b.despues ? (
                              <pre className="overflow-x-auto rounded bg-paper p-2 text-[11px] text-soft">
                                después: {b.despues}
                              </pre>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {b.resultado === "DENEGADO" ? <Badge tono="rojo">Rechazado</Badge> : null}
                        {responsivaDe(b) && !b.revertida ? (
                          <a
                            href={`/api/pdf/${responsivaDe(b)}`}
                            target="_blank"
                            className="rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper"
                          >
                            Ver PDF
                          </a>
                        ) : null}
                        {b.revertible && !b.revertida ? (
                          <RevertirBtn id={b.id} />
                        ) : b.revertida ? (
                          <Badge tono="gris">Revertida</Badge>
                        ) : b.resultado === "DENEGADO" ? null : (
                          <span className="text-soft">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
