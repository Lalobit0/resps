import Link from "next/link";
import { db } from "../../../lib/db";
import type { Empleado, Equipo, MantenimientoConEquipo, Responsiva } from "../../../lib/types";
import { ETIQUETA_TIPO, ETIQUETA_ESTADO, ESTADOS_MANTENIMIENTO, ETIQUETA_MANTENIMIENTO } from "../../../lib/constants";
import { dinero, fechaCorta } from "../../../lib/helpers";
import { Badge, Card, Empty, PageHeader, btnGhost, tdCls, thCls, tonoEstadoEquipo } from "../../../components/ui";
import ResponsivasEmpleado from "../../../components/ResponsivasEmpleado";

export const dynamic = "force-dynamic";

type ResponsivaEmp = Responsiva & { equipos: string | null };

export default async function PaginaEmpleado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empleado = db.prepare("SELECT * FROM empleados WHERE id = ?").get(Number(id)) as Empleado | undefined;

  if (!empleado) {
    return (
      <>
        <PageHeader eyebrow="Empleado" title="No encontrado" />
        <Empty>
          Este empleado no existe.
          <div className="mt-4">
            <Link href="/empleados" className={btnGhost}>
              Volver a empleados
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  const equipos = db
    .prepare("SELECT * FROM equipos WHERE asignado_a = ? ORDER BY tipo ASC, codigo ASC")
    .all(empleado.id) as Equipo[];

  const responsivas = db
    .prepare(
      `SELECT r.*,
        (SELECT GROUP_CONCAT(e2.codigo, ', ') FROM responsiva_items ri JOIN equipos e2 ON e2.id = ri.equipo_id WHERE ri.responsiva_id = r.id) AS equipos
       FROM responsivas r WHERE r.empleado_id = ? AND r.estado != 'ELIMINADA' ORDER BY r.id DESC`
    )
    .all(empleado.id) as ResponsivaEmp[];

  const mantenimientos = db
    .prepare(
      `SELECT m.*, e.codigo AS equipo_codigo, (e.marca || ' ' || e.modelo) AS equipo_desc, e.categoria AS equipo_categoria
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
       WHERE e.asignado_a = ? ORDER BY m.fecha_programada DESC`
    )
    .all(empleado.id) as MantenimientoConEquipo[];

  const cuenta = (t: string) => equipos.filter((e) => e.tipo === t).length;
  const tiles = [
    { etiqueta: "Equipos asignados", valor: equipos.length },
    { etiqueta: "Cómputo", valor: cuenta("COMPUTO") },
    { etiqueta: "Teléfonos", valor: cuenta("CELULAR") },
    { etiqueta: "Radios", valor: cuenta("RADIO") },
  ];

  const dato = (etiqueta: string, valor: string | null) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-ink">{valor || "—"}</p>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Histórico de empleado" title={empleado.nombre}>
        {empleado.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="gris">Inactivo</Badge>}
        <Link href="/empleados" className={btnGhost}>
          ← Volver
        </Link>
      </PageHeader>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {dato("Número", empleado.numero_empleado)}
          {dato("Puesto", empleado.puesto)}
          {dato("Departamento", empleado.departamento)}
          {dato("Área", empleado.area)}
          {dato("Jefe directo", empleado.supervisor)}
          {dato("Clase", empleado.clase)}
          {dato("Fecha de alta", fechaCorta(empleado.fecha_alta))}
          {dato("Contacto", [empleado.correo, empleado.telefono].filter(Boolean).join(" · ") || null)}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.etiqueta}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{t.etiqueta}</p>
            <p className="mt-1 text-3xl font-bold text-ink">{t.valor}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Equipos asignados</h2>
      {equipos.length === 0 ? (
        <Empty>Este empleado no tiene equipos asignados.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>Serie</th>
                <th className={thCls}>Detalle</th>
                <th className={thCls}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{e.codigo}</td>
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</td>
                  <td className={tdCls}>
                    {e.marca} {e.modelo}
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{e.numero_serie ?? "—"}</td>
                  <td className={`${tdCls} text-xs text-soft`}>{e.specs ?? "—"}</td>
                  <td className={tdCls}>
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Responsivas</h2>
      <ResponsivasEmpleado
        responsivas={responsivas.map((r) => ({
          id: r.id,
          folio: r.folio,
          tipo: r.tipo,
          clase: r.clase,
          origen: r.origen,
          equipos: r.equipos,
          fecha: r.fecha,
          estado: r.estado,
          pdf_path: r.pdf_path,
        }))}
      />

      <h2 className="mb-2 mt-6 text-base font-bold text-ink">Mantenimientos de sus equipos</h2>
      {mantenimientos.length === 0 ? (
        <Empty>No hay mantenimientos registrados para los equipos de este empleado.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Descripción</th>
                <th className={thCls}>Programado</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {mantenimientos.map((m) => (
                <tr key={m.id} className="border-b border-line/60 last:border-0">
                  <td className={tdCls}>
                    <span className="mono text-xs font-semibold text-kraft-dark">{m.equipo_codigo}</span>
                    <div className="text-xs text-soft">{m.equipo_desc}</div>
                  </td>
                  <td className={`${tdCls} text-xs`}>{ETIQUETA_MANTENIMIENTO[m.tipo] ?? m.tipo}</td>
                  <td className={`${tdCls} text-xs`}>{m.descripcion}</td>
                  <td className={tdCls}>{fechaCorta(m.fecha_programada)}</td>
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
