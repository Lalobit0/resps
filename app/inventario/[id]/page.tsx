import Link from "next/link";
import { db } from "../../../lib/db";
import type { Equipo, MantenimientoConEquipo } from "../../../lib/types";
import { CAMPOS_DETALLE, ETIQUETA_ESTADO, ETIQUETA_TIPO, ESTADOS_MANTENIMIENTO, ETIQUETA_MANTENIMIENTO } from "../../../lib/constants";
import { dinero, fechaCorta } from "../../../lib/helpers";
import { duenosDeEquipo, historialDeEquipo, type Movimiento } from "../../../lib/historial";
import { Badge, Card, Empty, PageHeader, btnGhost, tdCls, thCls, tonoEstadoEquipo } from "../../../components/ui";
import VerPdfBtn from "../../../components/VerPdfBtn";

export const dynamic = "force-dynamic";

/** Un icono por tipo de movimiento: la línea se lee de un vistazo. */
const ICONO: Record<string, string> = {
  ALTA: "📦",
  ASIGNADO: "→",
  RESPONSIVA: "📄",
  LIBERADO: "←",
  DEVOLUCION: "↩",
  BAJA_EMPLEADO: "⛔",
  AREA: "🏢",
  ESTADO: "🔁",
  FUSION: "🔗",
  MANTENIMIENTO: "🔧",
};

const TONO: Record<string, "verde" | "kraft" | "petrol" | "ambar" | "gris" | "rojo"> = {
  ALTA: "gris",
  ASIGNADO: "verde",
  RESPONSIVA: "verde",
  LIBERADO: "kraft",
  DEVOLUCION: "kraft",
  BAJA_EMPLEADO: "rojo",
  AREA: "petrol",
  ESTADO: "petrol",
  FUSION: "gris",
  MANTENIMIENTO: "ambar",
};

export default async function PaginaEquipo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const equipoId = Number(id);
  const equipo = db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero, em.activo AS asignado_activo
       FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a WHERE e.id = ?`
    )
    .get(equipoId) as
    | (Equipo & { asignado_nombre: string | null; asignado_numero: string | null; asignado_activo: number | null })
    | undefined;

  if (!equipo) {
    return (
      <>
        <PageHeader eyebrow="Equipo" title="No encontrado" />
        <Empty>
          Este equipo no existe o se unió con otro.
          <div className="mt-4">
            <Link href="/inventario" className={btnGhost}>
              Volver al inventario
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  const movimientos = historialDeEquipo(equipoId);
  const duenos = duenosDeEquipo(equipoId);

  const mantenimientos = db
    .prepare(
      `SELECT m.*, e.codigo AS equipo_codigo, (e.marca || ' ' || e.modelo) AS equipo_desc, e.categoria AS equipo_categoria
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
       WHERE m.equipo_id = ? ORDER BY m.fecha_programada DESC`
    )
    .all(equipoId) as MantenimientoConEquipo[];

  const cartas = db
    .prepare(
      `SELECT r.id, r.folio, r.tipo, r.clase, r.fecha, r.estado, r.origen, r.pdf_path, r.pdf_firmado,
              em.numero_empleado, em.nombre
       FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id JOIN empleados em ON em.id = r.empleado_id
       WHERE ri.equipo_id = ? AND r.estado != 'ELIMINADA'
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all(equipoId) as {
    id: number;
    folio: string;
    tipo: string;
    clase: string;
    fecha: string;
    estado: string;
    origen: string;
    pdf_path: string | null;
    pdf_firmado: string | null;
    numero_empleado: string;
    nombre: string;
  }[];

  let detalles: Record<string, string> = {};
  try {
    detalles = equipo.detalles ? (JSON.parse(equipo.detalles) as Record<string, string>) : {};
  } catch {
    // Un JSON roto no debe tumbar la ficha.
  }
  const camposTipo = CAMPOS_DETALLE[equipo.tipo as keyof typeof CAMPOS_DETALLE] ?? [];

  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div key={etiqueta}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{etiqueta}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{valor || "—"}</p>
    </div>
  );

  const renglon = (m: Movimiento, i: number) => (
    <li key={`${m.fecha}-${m.accion}-${i}`} className="flex gap-3 border-b border-line/60 py-2.5 last:border-0">
      <span className="mono w-20 shrink-0 pt-0.5 text-xs text-soft">{fechaCorta(m.fecha)}</span>
      <span className="w-5 shrink-0 pt-0.5 text-center text-sm" aria-hidden>
        {ICONO[m.accion] ?? "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tono={TONO[m.accion] ?? "gris"}>{m.titulo}</Badge>
          {m.empleado ? <span className="text-sm font-medium text-ink">{m.empleado}</span> : null}
          {m.area ? <span className="text-xs text-soft">· {m.area}</span> : null}
          {m.folio ? (
            <Link href={`/api/pdf/${m.responsiva_id}`} target="_blank" className="mono text-xs text-kraft-dark hover:underline">
              {m.folio}
            </Link>
          ) : null}
        </span>
        {m.detalle ? <span className="mt-0.5 block text-xs text-soft">{m.detalle}</span> : null}
      </span>
    </li>
  );

  return (
    <>
      <PageHeader eyebrow="Histórico del equipo" title={`${equipo.marca} ${equipo.modelo}`}>
        <span className="mono text-sm font-bold text-kraft-dark">{equipo.codigo}</span>
        <Badge tono={tonoEstadoEquipo(equipo.estado)}>{ETIQUETA_ESTADO[equipo.estado] ?? equipo.estado}</Badge>
        <Link href={`/inventario?q=${encodeURIComponent(equipo.codigo)}&editar=${equipo.id}`} className={btnGhost}>
          ✎ Editar
        </Link>
        <Link href="/inventario" className={btnGhost}>
          ← Volver al inventario
        </Link>
      </PageHeader>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {dato("Tipo", ETIQUETA_TIPO[equipo.tipo] ?? equipo.tipo)}
          {dato("Categoría", equipo.categoria)}
          {dato("Número de serie", equipo.numero_serie ? <span className="mono">{equipo.numero_serie}</span> : null)}
          {dato(
            "Área del equipo",
            equipo.area || equipo.departamento ? (
              <>
                {equipo.area || equipo.departamento}
                {!equipo.asignado_a ? <span className="ml-1 text-xs text-soft">(disponible aquí)</span> : null}
              </>
            ) : null
          )}
          {dato(
            "Lo tiene",
            equipo.asignado_nombre && equipo.asignado_a ? (
              <Link href={`/empleados/${equipo.asignado_a}`} className="hover:text-kraft hover:underline">
                <span className="mono text-xs text-kraft-dark">{equipo.asignado_numero}</span> {equipo.asignado_nombre}
                {equipo.asignado_activo === 0 ? <span className="ml-1 text-xs text-amber-700">(dado de baja)</span> : null}
              </Link>
            ) : (
              <span className="text-soft">Nadie: está disponible</span>
            )
          )}
          {dato("Fecha de compra", fechaCorta(equipo.fecha_compra))}
          {dato("Costo", equipo.costo !== null ? dinero(equipo.costo) : null)}
          {dato("Alta en el sistema", fechaCorta(equipo.created_at?.slice(0, 10) ?? ""))}
          {camposTipo.map((c) => dato(c.etiqueta, detalles[c.clave] ?? ""))}
          {equipo.specs ? dato("Características", equipo.specs) : null}
          {equipo.notas ? dato("Notas", equipo.notas) : null}
        </div>
      </Card>

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Por quién ha pasado</h2>
      {duenos.length === 0 ? (
        <Empty>Todavía no se le ha entregado a nadie.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Empleado</th>
                <th className={thCls}>Área</th>
                <th className={thCls}>Desde</th>
                <th className={thCls}>Hasta</th>
              </tr>
            </thead>
            <tbody>
              {duenos.map((d, i) => (
                <tr key={`${d.empleado_id}-${d.desde}`} className="border-b border-line/60 last:border-0">
                  <td className={tdCls}>
                    <Link href={`/empleados/${d.empleado_id}`} className="font-medium text-ink hover:text-kraft hover:underline">
                      {d.empleado}
                    </Link>
                    {i === 0 && equipo.asignado_a === d.empleado_id ? (
                      <span className="ml-2">
                        <Badge tono="verde">Lo tiene ahora</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className={`${tdCls} text-xs`}>{d.area ?? "—"}</td>
                  <td className={tdCls}>{fechaCorta(d.desde)}</td>
                  <td className={tdCls}>{d.hasta ? fechaCorta(d.hasta) : <span className="text-soft">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Todo lo que le ha pasado</h2>
      {movimientos.length === 0 ? (
        <Empty>Sin movimientos registrados.</Empty>
      ) : (
        <Card>
          <ul>{movimientos.map(renglon)}</ul>
        </Card>
      )}

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Sus cartas responsivas</h2>
      {cartas.length === 0 ? (
        <Empty>Este equipo no tiene cartas responsivas.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Folio</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Empleado</th>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Ver</th>
              </tr>
            </thead>
            <tbody>
              {cartas.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{c.folio}</td>
                  <td className={tdCls}>
                    {c.tipo === "ASIGNACION" ? <Badge tono="petrol">Asignación</Badge> : <Badge tono="kraft">Devolución</Badge>}
                  </td>
                  <td className={`${tdCls} text-xs`}>
                    <span className="mono text-kraft-dark">{c.numero_empleado}</span> {c.nombre}
                  </td>
                  <td className={tdCls}>{fechaCorta(c.fecha)}</td>
                  <td className={tdCls}>
                    {c.origen === "CARGADA" || c.pdf_firmado ? (
                      <Badge tono="verde">Firmada</Badge>
                    ) : (
                      <Badge tono="rojo">Sin firmar</Badge>
                    )}
                  </td>
                  <td className={tdCls}>
                    {c.pdf_path || c.pdf_firmado ? (
                      <VerPdfBtn id={c.id} folio={c.folio} className={btnGhost} subtitulo={`${equipo.codigo} · ${fechaCorta(c.fecha)}`} />
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Sus mantenimientos</h2>
        <Link href={`/mantenimientos?equipo=${equipo.id}`} className={btnGhost}>
          + Registrar mantenimiento
        </Link>
      </div>
      {mantenimientos.length === 0 ? (
        <Empty>Este equipo no tiene mantenimientos registrados.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Descripción</th>
                <th className={thCls}>Programado</th>
                <th className={thCls}>Realizado</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {mantenimientos.map((m) => (
                <tr key={m.id} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_MANTENIMIENTO[m.tipo] ?? m.tipo}</td>
                  <td className={`${tdCls} text-xs`}>{m.descripcion}</td>
                  <td className={tdCls}>{fechaCorta(m.fecha_programada)}</td>
                  <td className={tdCls}>{m.fecha_realizada ? fechaCorta(m.fecha_realizada) : <span className="text-soft">—</span>}</td>
                  <td className={`${tdCls} text-xs`}>{ESTADOS_MANTENIMIENTO[m.estado] ?? m.estado}</td>
                  <td className={`${tdCls} text-xs`}>{dinero(m.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
