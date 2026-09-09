import Link from "next/link";
import { db } from "../../lib/db";
import { dinero } from "../../lib/helpers";
import { Card, PageHeader } from "../../components/ui";
import LineasClient, { type Linea } from "../../components/LineasClient";
import ExportarBotones from "../../components/ExportarBotones";
import FiltrosAuto from "../../components/FiltrosAuto";
import AvisoCelularesFaltantes from "../../components/AvisoCelularesFaltantes";
import { revisarCelulares } from "../../lib/celulares";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

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
  await exigirPagina("ti.ver");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const cond = ["e.tipo = 'CELULAR'"];
  const val: string[] = [];
  if (q) {
    cond.push(
      `(json_extract(e.detalles,'$.numero') LIKE ? OR json_extract(e.detalles,'$.imei') LIKE ?
        OR em.nombre LIKE ? OR em.numero_empleado LIKE ? OR e.codigo LIKE ?
        OR COALESCE(em.departamento,'') LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ?
        OR COALESCE(e.numero_serie,'') LIKE ?)`
    );
    for (let i = 0; i < 9; i++) val.push(`%${q}%`);
  }

  const lineas = db
    .prepare(
      `SELECT e.id, e.codigo, e.estado, e.marca, e.modelo, e.numero_serie,
        json_extract(e.detalles,'$.numero') AS numero,
        json_extract(e.detalles,'$.plan') AS plan,
        json_extract(e.detalles,'$.plan_precio') AS precio,
        json_extract(e.detalles,'$.imei') AS imei,
        json_extract(e.detalles,'$.condicion') AS condicion,
        em.id AS asignado_id, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero,
        em.departamento AS asignado_departamento, em.area AS asignado_area
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

      <FiltrosAuto className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por número, IMEI, empleado, departamento, equipo o código…"
          className="w-full max-w-md rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-kraft"
        />
      </FiltrosAuto>

      <LineasClient lineas={lineas} />
      <p className="mt-3 text-xs text-soft">
        El costo mensual suma la renta capturada en cada línea. <Link href="/inventario?tipo=CELULAR" className="underline">Ver en inventario</Link>.
      </p>
    </>
  );
}
