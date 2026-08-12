import Link from "next/link";
import { db } from "../../lib/db";
import { Badge, Card, Empty, PageHeader, tdCls, thCls, tonoEstadoEquipo } from "../../components/ui";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from "../../lib/constants";

export const dynamic = "force-dynamic";

type EquipoResultado = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  nombre_equipo: string | null;
  imei: string | null;
  numero: string | null;
  estado: string;
  asignado_id: number | null;
  asignado_nombre: string | null;
  asignado_numero: string | null;
};

type EmpleadoResultado = {
  id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  activo: number;
  equipos: number;
};

export default async function PaginaBuscar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  let equipos: EquipoResultado[] = [];
  let empleados: EmpleadoResultado[] = [];

  if (q) {
    const like = `%${q}%`;
    equipos = db
      .prepare(
        `SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.numero_serie, e.estado,
          json_extract(e.detalles,'$.imei') AS imei, json_extract(e.detalles,'$.numero') AS numero,
          json_extract(e.detalles,'$.nombre_computadora') AS nombre_equipo,
          em.id AS asignado_id, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero
         FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a
         WHERE e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR COALESCE(e.numero_serie,'') LIKE ?
           OR COALESCE(json_extract(e.detalles,'$.imei'),'') LIKE ?
           OR COALESCE(json_extract(e.detalles,'$.imei2'),'') LIKE ?
           OR COALESCE(json_extract(e.detalles,'$.numero'),'') LIKE ?
           -- El nombre de la máquina en la red: con eso se busca en soporte.
           OR COALESCE(json_extract(e.detalles,'$.nombre_computadora'),'') LIKE ?
         ORDER BY e.codigo ASC LIMIT 50`
      )
      .all(like, like, like, like, like, like, like, like) as EquipoResultado[];

    empleados = db
      .prepare(
        `SELECT e.id, e.numero_empleado, e.nombre, e.puesto, e.departamento, e.activo,
          (SELECT COUNT(*) FROM equipos q WHERE q.asignado_a = e.id) AS equipos
         FROM empleados e
         WHERE e.nombre LIKE ? OR e.numero_empleado LIKE ?
         ORDER BY CAST(e.numero_empleado AS INTEGER) ASC LIMIT 50`
      )
      .all(like, like) as EmpleadoResultado[];
  }

  return (
    <>
      <PageHeader eyebrow="Buscar" title="Búsqueda global" />

      <form method="get" className="mb-5">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="IMEI, número de serie, línea, código, empleado…"
          className="w-full max-w-xl rounded-md border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-kraft focus:ring-2 focus:ring-kraft/20"
        />
      </form>

      {!q ? (
        <Empty>Escribe un IMEI, serie, número de línea, código de equipo o nombre/número de empleado.</Empty>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-base font-bold text-ink">
              Equipos <span className="text-sm font-normal text-soft">({equipos.length})</span>
            </h2>
            {equipos.length === 0 ? (
              <Empty>Ningún equipo coincide con “{q}”.</Empty>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead className="border-b border-line bg-paper/70">
                    <tr>
                      <th className={thCls}>Código</th>
                      <th className={thCls}>Tipo</th>
                      <th className={thCls}>Equipo</th>
                      <th className={thCls}>Serie / IMEI / Línea</th>
                      <th className={thCls}>Estado</th>
                      <th className={thCls}>Quién lo tiene</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map((e) => (
                      <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-paper/40">
                        <td className={`${tdCls} mono text-xs font-semibold`}>
                          <Link href={`/inventario?q=${encodeURIComponent(e.codigo)}`} className="text-kraft-dark hover:underline">
                            {e.codigo}
                          </Link>
                        </td>
                        <td className={`${tdCls} text-xs`}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</td>
                        <td className={tdCls}>
                          {e.marca} {e.modelo}
                        </td>
                        <td className={`${tdCls} mono text-[11px] text-soft`}>
                          {[e.nombre_equipo, e.numero_serie, e.imei, e.numero].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className={tdCls}>
                          <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                        </td>
                        <td className={tdCls}>
                          {e.asignado_id ? (
                            <Link href={`/empleados/${e.asignado_id}`} className="font-medium text-ink hover:text-kraft hover:underline">
                              <span className="mono text-xs text-kraft-dark">{e.asignado_numero}</span> {e.asignado_nombre}
                            </Link>
                          ) : (
                            <span className="text-soft">Sin asignar</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-ink">
              Empleados <span className="text-sm font-normal text-soft">({empleados.length})</span>
            </h2>
            {empleados.length === 0 ? (
              <Empty>Ningún empleado coincide con “{q}”.</Empty>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead className="border-b border-line bg-paper/70">
                    <tr>
                      <th className={thCls}>No.</th>
                      <th className={thCls}>Nombre</th>
                      <th className={thCls}>Puesto</th>
                      <th className={thCls}>Depto</th>
                      <th className={thCls}>Equipos</th>
                      <th className={thCls}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.map((e) => (
                      <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-paper/40">
                        <td className={`${tdCls} mono text-xs`}>{e.numero_empleado}</td>
                        <td className={tdCls}>
                          <Link href={`/empleados/${e.id}`} className="font-medium text-ink hover:text-kraft hover:underline">
                            {e.nombre}
                          </Link>
                        </td>
                        <td className={`${tdCls} text-xs`}>{e.puesto}</td>
                        <td className={`${tdCls} text-xs`}>{e.departamento}</td>
                        <td className={`${tdCls} text-xs`}>{e.equipos}</td>
                        <td className={tdCls}>
                          {e.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="gris">Inactivo</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
