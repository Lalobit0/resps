import Link from "next/link";
import { db } from "../../lib/db";
import type { ResponsivaLista } from "../../lib/types";
import { fechaCorta } from "../../lib/helpers";
import { Badge, Card, Empty, PageHeader, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "../../components/ui";
import ExportarBotones from "../../components/ExportarBotones";
import EliminarResponsivaBtn from "../../components/EliminarResponsivaBtn";
import SubirFirmadaBtn from "../../components/SubirFirmadaBtn";
import { CambiarClaseLista, EditarClaseBtn } from "../../components/ClaseResponsiva";
import { ETIQUETA_CLASE } from "../../lib/constants";

export const dynamic = "force-dynamic";

export default async function PaginaResponsivas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const clase = typeof sp.clase === "string" ? sp.clase : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const nueva = typeof sp.nueva === "string" ? sp.nueva : "";
  const orden = typeof sp.orden === "string" ? sp.orden : "recientes";

  const ORDENES: Record<string, string> = {
    recientes: "r.fecha DESC, r.id DESC",
    antiguas: "r.fecha ASC, r.id ASC",
    emp_asc: "CAST(em.numero_empleado AS INTEGER) ASC, r.fecha DESC",
    emp_desc: "CAST(em.numero_empleado AS INTEGER) DESC, r.fecha DESC",
  };
  const orderBy = ORDENES[orden] ?? ORDENES.recientes;

  const condiciones: string[] = ["r.estado != 'ELIMINADA'"];
  const valores: string[] = [];
  if (tipo) {
    condiciones.push("r.tipo = ?");
    valores.push(tipo);
  }
  if (clase) {
    condiciones.push("r.clase = ?");
    valores.push(clase);
  }
  if (estado) {
    condiciones.push("r.estado = ?");
    valores.push(estado);
  }
  if (q) {
    condiciones.push("(r.folio LIKE ? OR em.nombre LIKE ? OR em.numero_empleado LIKE ?)");
    valores.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = `WHERE ${condiciones.join(" AND ")}`;

  const responsivas = db
    .prepare(
      `SELECT r.*, em.nombre AS empleado_nombre, em.numero_empleado AS empleado_numero,
        (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos,
        (SELECT COUNT(*) FROM responsivas rd
          WHERE rd.empleado_id = r.empleado_id AND rd.clase = r.clase
            AND rd.tipo = 'ASIGNACION' AND rd.estado != 'ELIMINADA' AND rd.id != r.id
            AND (
              -- misma persona, mismo tipo y mismo día: la de siempre
              rd.fecha = r.fecha
              -- o dos cartas vigentes del mismo tipo donde alguna no trae equipo
              -- (el caso del escaneo cargado aparte de la carta que ya existía)
              OR (rd.estado = 'VIGENTE' AND r.estado = 'VIGENTE'
                  AND (NOT EXISTS (SELECT 1 FROM responsiva_items ri2 WHERE ri2.responsiva_id = rd.id)
                       OR NOT EXISTS (SELECT 1 FROM responsiva_items ri3 WHERE ri3.responsiva_id = r.id)
                       OR EXISTS (SELECT 1 FROM responsiva_items a JOIN responsiva_items b ON a.equipo_id = b.equipo_id
                                   WHERE a.responsiva_id = rd.id AND b.responsiva_id = r.id)))
            )) AS es_duplicado
       FROM responsivas r
       JOIN empleados em ON em.id = r.empleado_id
       ${where}
       ORDER BY ${orderBy}`
    )
    .all(...valores) as ResponsivaLista[];

  const totalDuplicados = responsivas.filter((r) => (r.es_duplicado ?? 0) > 0).length;
  // Solo las de asignación cambian de tipo: la devolución hereda el de su carta.
  const asignaciones = responsivas.filter((r) => r.tipo === "ASIGNACION");
  // La carta se firma en papel: está pendiente mientras no se suba el escaneo.
  const faltaFirma = (r: ResponsivaLista) => r.origen !== "CARGADA" && !r.pdf_firmado;
  const totalSinFirma = responsivas.filter(faltaFirma).length;

  return (
    <>
      <PageHeader eyebrow="Repositorio" title="Cartas responsivas">
        <a href="/api/archivero" className={btnGhost} title="Descarga todas las responsivas en un ZIP, por departamento y empleado">
          🗄️ Archivero (ZIP)
        </a>
        <Link href="/responsivas/generar" className={btnGhost}>
          ✎✎ Generar en lote
        </Link>
        <Link href="/responsivas/lote" className={btnGhost}>
          ↥↥ Carga masiva
        </Link>
        <Link href="/responsivas/cargar" className={btnGhost}>
          ↥ Cargar firmada
        </Link>
        <Link href="/responsivas/nueva" className={btnPrimary}>
          + Nueva responsiva
        </Link>
      </PageHeader>

      {nueva ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Se generó el documento <span className="mono font-semibold">{nueva}</span> y quedó guardado en el repositorio.
        </div>
      ) : null}

      {totalSinFirma > 0 ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ✍️ Hay <b>{totalSinFirma}</b> responsiva(s) <b>sin firmar</b>. Imprímelas, recoge las firmas y sube el
          documento con <b>Subir firmada</b> del renglón.
        </div>
      ) : null}

      {totalDuplicados > 0 ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Se detectaron <b>{totalDuplicados}</b> responsiva(s) que parecen duplicadas (mismo empleado, tipo y fecha).
          Revísalas y elimina la que sobre; la eliminación va a la papelera y se puede revertir.
        </div>
      ) : null}

      {asignaciones.length > 0 ? (
        <CambiarClaseLista
          ids={asignaciones.map((r) => r.id)}
          resumen={`${asignaciones[0].folio} … ${asignaciones[asignaciones.length - 1].folio}`}
        />
      ) : null}

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por folio o empleado…" className={`${inputCls} max-w-xs`} />
        <select name="tipo" defaultValue={tipo} className={`${inputCls} max-w-[170px]`}>
          <option value="">Todos los tipos</option>
          <option value="ASIGNACION">Asignación</option>
          <option value="DEVOLUCION">Devolución</option>
        </select>
        <select name="clase" defaultValue={clase} className={`${inputCls} max-w-[190px]`}>
          <option value="">Todas las cartas</option>
          {Object.entries(ETIQUETA_CLASE).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estado} className={`${inputCls} max-w-[160px]`}>
          <option value="">Todos los estados</option>
          <option value="VIGENTE">Vigente</option>
          <option value="CERRADA">Cerrada</option>
        </select>
        <select name="orden" defaultValue={orden} className={`${inputCls} max-w-[230px]`}>
          <option value="recientes">Más recientes primero</option>
          <option value="antiguas">Más antiguas primero</option>
          <option value="emp_asc">No. de empleado (menor a mayor)</option>
          <option value="emp_desc">No. de empleado (mayor a menor)</option>
        </select>
        <button type="submit" className={btnGhost}>
          Filtrar
        </button>
        <div className="ml-auto">
          <ExportarBotones tabla="responsivas" params={{ q, tipo, clase, estado }} />
        </div>
      </form>

      {responsivas.length === 0 ? (
        <Empty>Todavía no hay responsivas. Genera la primera con “Nueva responsiva”.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[840px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Folio</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>No.</th>
                <th className={thCls}>Empleado</th>
                <th className={thCls}>Equipos</th>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {responsivas.map((r) => (
                <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{r.folio}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.tipo === "ASIGNACION" ? <Badge tono="petrol">Asignación</Badge> : <Badge tono="kraft">Devolución</Badge>}
                      {r.origen === "CARGADA" ? <Badge tono="ambar">Cargada</Badge> : null}
                      {(r.es_duplicado ?? 0) > 0 ? <Badge tono="rojo">Posible duplicado</Badge> : null}
                      {faltaFirma(r) ? <Badge tono="rojo">Sin firmar</Badge> : null}
                    </div>
                    <div className="mt-1 text-[11px] text-soft">{ETIQUETA_CLASE[r.clase] ?? r.clase}</div>
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{r.empleado_numero}</td>
                  <td className={`${tdCls} font-medium`}>
                    <Link href={`/empleados/${r.empleado_id}`} className="text-ink hover:text-kraft hover:underline" title="Ver histórico">
                      {r.empleado_nombre}
                    </Link>
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{r.equipos ?? "—"}</td>
                  <td className={tdCls}>{fechaCorta(r.fecha)}</td>
                  <td className={tdCls}>
                    {r.tipo === "DEVOLUCION" ? (
                      <span className="text-soft">—</span>
                    ) : r.estado === "VIGENTE" ? (
                      <Badge tono="verde">Vigente</Badge>
                    ) : (
                      <Badge tono="gris">Cerrada</Badge>
                    )}
                  </td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1.5">
                      {r.pdf_path || r.pdf_firmado ? (
                        <a href={`/api/pdf/${r.id}`} target="_blank" className={btnGhost}>
                          Ver PDF
                        </a>
                      ) : null}
                      {faltaFirma(r) ? (
                        <>
                          <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                            Imprimir
                          </a>
                          <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
                        </>
                      ) : null}
                      <EditarClaseBtn id={r.id} folio={r.folio} clase={r.clase} tipo={r.tipo} />
                      {r.tipo === "ASIGNACION" && r.estado === "VIGENTE" && r.clase !== "WIFI" && r.clase !== "VALE" ? (
                        <Link href={`/responsivas/${r.id}/devolucion`} className={btnGhost}>
                          Registrar devolución
                        </Link>
                      ) : null}
                      <EliminarResponsivaBtn id={r.id} folio={r.folio} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
