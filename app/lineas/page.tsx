import Link from "next/link";
import { db } from "../../lib/db";
import { dinero } from "../../lib/helpers";
import { Badge, Card, Empty, PageHeader, tdCls, thCls, tonoEstadoEquipo } from "../../components/ui";
import ExportarBotones from "../../components/ExportarBotones";
import AvisoCelularesFaltantes from "../../components/AvisoCelularesFaltantes";
import { revisarCelulares } from "../../lib/celulares";
import { ETIQUETA_ESTADO } from "../../lib/constants";

export const dynamic = "force-dynamic";

type Linea = {
  id: number;
  codigo: string;
  estado: string;
  numero: string | null;
  plan: string | null;
  precio: string | null;
  imei: string | null;
  condicion: string | null;
  marca: string;
  modelo: string;
  asignado_nombre: string | null;
  asignado_numero: string | null;
};

function precioANumero(p: string | null): number {
  if (!p) return 0;
  const n = Number(p.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default async function PaginaLineas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const cond = ["e.tipo = 'CELULAR'"];
  const val: string[] = [];
  if (q) {
    cond.push(
      "(json_extract(e.detalles,'$.numero') LIKE ? OR json_extract(e.detalles,'$.imei') LIKE ? OR em.nombre LIKE ? OR em.numero_empleado LIKE ? OR e.codigo LIKE ?)"
    );
    for (let i = 0; i < 5; i++) val.push(`%${q}%`);
  }

  const lineas = db
    .prepare(
      `SELECT e.id, e.codigo, e.estado, e.marca, e.modelo,
        json_extract(e.detalles,'$.numero') AS numero,
        json_extract(e.detalles,'$.plan') AS plan,
        json_extract(e.detalles,'$.plan_precio') AS precio,
        json_extract(e.detalles,'$.imei') AS imei,
        json_extract(e.detalles,'$.condicion') AS condicion,
        em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero
       FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a
       WHERE ${cond.join(" AND ")}
       ORDER BY em.numero_empleado IS NULL, CAST(em.numero_empleado AS INTEGER) ASC, e.codigo ASC`
    )
    .all(...val) as Linea[];

  const totalMensual = lineas.reduce((s, l) => s + precioANumero(l.precio), 0);
  // El listado de telefonía manda: si falta alguno, se avisa y se puede dar de alta.
  const revision = revisarCelulares();
  const asignadas = lineas.filter((l) => l.asignado_nombre).length;

  return (
    <>
      <PageHeader eyebrow="Telefonía" title="Líneas telefónicas">
        <ExportarBotones tabla="inventario" params={{ tipo: "CELULAR" }} />
      </PageHeader>

      <AvisoCelularesFaltantes faltan={revision.faltan} total={revision.total} />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Líneas</p>
          <p className="mt-1 text-3xl font-bold text-ink">{lineas.length}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Asignadas</p>
          <p className="mt-1 text-3xl font-bold text-ink">{asignadas}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Sin asignar</p>
          <p className="mt-1 text-3xl font-bold text-ink">{lineas.length - asignadas}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Costo mensual estimado</p>
          <p className="mt-1 text-3xl font-bold text-ink">{dinero(totalMensual)}</p>
        </Card>
      </div>

      <form method="get" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por número, IMEI, empleado o código…"
          className="w-full max-w-md rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-kraft"
        />
      </form>

      {lineas.length === 0 ? (
        <Empty>No hay líneas registradas. Impórtalas o regístralas como equipo de tipo Teléfono / Celular.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Número</th>
                <th className={thCls}>Plan</th>
                <th className={thCls}>Renta</th>
                <th className={thCls}>Equipo</th>
                <th className={thCls}>IMEI</th>
                <th className={thCls}>Asignada a</th>
                <th className={thCls}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b border-line/60 last:border-0 hover:bg-paper/40">
                  <td className={`${tdCls} mono text-xs font-semibold`}>{l.codigo}</td>
                  <td className={`${tdCls} mono text-xs`}>{l.numero ?? "—"}</td>
                  <td className={`${tdCls} text-xs`}>{l.plan ?? "—"}</td>
                  <td className={`${tdCls} text-xs`}>{l.precio ?? "—"}</td>
                  <td className={`${tdCls} text-xs`}>
                    {l.marca} {l.modelo}
                  </td>
                  <td className={`${tdCls} mono text-xs`}>{l.imei ?? "—"}</td>
                  <td className={`${tdCls} text-xs`}>
                    {l.asignado_nombre ? (
                      <>
                        <span className="mono text-kraft-dark">{l.asignado_numero}</span> {l.asignado_nombre}
                      </>
                    ) : (
                      <span className="text-soft">Sin asignar</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <Badge tono={tonoEstadoEquipo(l.estado)}>{ETIQUETA_ESTADO[l.estado] ?? l.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-soft">
        El costo mensual suma la renta capturada en cada línea. <Link href="/inventario?tipo=CELULAR" className="underline">Ver en inventario</Link>.
      </p>
    </>
  );
}
