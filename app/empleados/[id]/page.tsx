import Link from "next/link";
import { db } from "../../../lib/db";
import type { Empleado, Equipo, MantenimientoConEquipo, Responsiva } from "../../../lib/types";
import { ETIQUETA_TIPO, ETIQUETA_ESTADO, ESTADOS_MANTENIMIENTO, ETIQUETA_MANTENIMIENTO } from "../../../lib/constants";
import { dinero, fechaCorta } from "../../../lib/helpers";
import { Badge, Card, Empty, PageHeader, btnGhost, tdCls, thCls } from "../../../components/ui";
import ResponsivasEmpleado from "../../../components/ResponsivasEmpleado";
import EquiposEmpleado from "../../../components/EquiposEmpleado";
import AsignarEquipoBtn from "../../../components/AsignarEquipoBtn";
import type { ResponsivaDeEquipo } from "../../../components/InventarioClient";
import { idsSinResponsiva, responsivasSinFirmaDe } from "../../../lib/pendientes";
import SubirFirmadaBtn from "../../../components/SubirFirmadaBtn";
import EditarEmpleadoBtn from "../../../components/EditarEmpleadoBtn";

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

  // Equipos libres, para poder entregarle uno desde aquí mismo.
  const disponibles = db
    .prepare("SELECT * FROM equipos WHERE estado = 'DISPONIBLE' AND asignado_a IS NULL ORDER BY tipo ASC, codigo ASC")
    .all() as Equipo[];

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

  // Responsivas ya generadas que siguen sin el documento firmado en papel.
  const sinFirma = responsivasSinFirmaDe(empleado.id);

  // Equipos que este empleado tiene sin una carta responsiva que los respalde.
  const sinResp = idsSinResponsiva();
  const faltantes = equipos.filter((e) => sinResp.has(e.id));

  // Cartas responsivas de cada equipo, para consultarlas desde la misma tabla.
  const filasResp = equipos.length
    ? (db
        .prepare(
          `SELECT ri.equipo_id, r.id, r.folio, r.tipo, r.clase, r.fecha, r.estado, r.pdf_path,
                  em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre
           FROM responsiva_items ri
           JOIN responsivas r ON r.id = ri.responsiva_id
           JOIN empleados em ON em.id = r.empleado_id
           WHERE r.estado != 'ELIMINADA' AND ri.equipo_id IN (${equipos.map(() => "?").join(",")})
           ORDER BY r.fecha DESC, r.id DESC`
        )
        .all(...equipos.map((e) => e.id)) as (ResponsivaDeEquipo & { equipo_id: number })[])
    : [];
  const responsivasPorEquipo: Record<number, ResponsivaDeEquipo[]> = {};
  for (const { equipo_id, ...r } of filasResp) (responsivasPorEquipo[equipo_id] ??= []).push(r);

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
        <EditarEmpleadoBtn empleado={empleado} />
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

      {faltantes.length > 0 ? (
        <Card className="mt-6 border-sky-200 bg-sky-50">
          <h2 className="text-base font-bold text-sky-900">
            📄 Le faltan {faltantes.length} responsiva{faltantes.length > 1 ? "s" : ""}
          </h2>
          <p className="mb-3 mt-1 text-sm text-sky-800">
            Estos equipos están entregados pero no tienen carta firmada. Genera cada una y pásala a firmar.
          </p>
          <div className="flex flex-wrap gap-2">
            {faltantes.map((e) => (
              <Link
                key={e.id}
                href={`/responsivas/nueva?equipo=${e.id}`}
                className="inline-flex items-center gap-2 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
              >
                <span className="mono text-xs font-semibold">{e.codigo}</span>
                <span>
                  {e.marca} {e.modelo}
                </span>
                <span className="rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold text-white">+ Responsiva</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {sinFirma.length > 0 ? (
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <h2 className="text-base font-bold text-amber-900">
            ✍️ Tiene {sinFirma.length} responsiva{sinFirma.length > 1 ? "s" : ""} sin firmar
          </h2>
          <p className="mb-3 mt-1 text-sm text-amber-800">
            Ya están generadas: imprímelas, recoge las firmas y sube aquí el documento firmado.
          </p>
          <div className="space-y-2">
            {sinFirma.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
              >
                <span className="mono text-xs font-semibold text-kraft-dark">{r.folio}</span>
                <span className="text-soft">{fechaCorta(r.fecha)}</span>
                {r.equipos ? <span className="mono text-xs text-soft">{r.equipos}</span> : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                    Imprimir
                  </a>
                  <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Equipos asignados</h2>
        <AsignarEquipoBtn empleadoId={empleado.id} disponibles={disponibles} />
      </div>
      {equipos.length === 0 ? (
        <Empty>Este empleado no tiene equipos asignados. Usa “Asignar equipo” para entregarle uno.</Empty>
      ) : (
        <EquiposEmpleado
          empleadoId={empleado.id}
          equipos={equipos}
          responsivas={responsivasPorEquipo}
          sinResponsiva={equipos.filter((e) => sinResp.has(e.id)).map((e) => e.id)}
        />
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
          pdf_firmado: r.pdf_firmado ?? null,
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
