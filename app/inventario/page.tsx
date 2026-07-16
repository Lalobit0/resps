import { db } from "../../lib/db";
import type { EquipoConAsignado } from "../../lib/types";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, TIPOS_EQUIPO } from "../../lib/constants";
import InventarioClient from "../../components/InventarioClient";
import { PageHeader, btnGhost, inputCls } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaInventario({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const condiciones: string[] = [];
  const valores: (string | number)[] = [];
  if (estado) {
    condiciones.push("e.estado = ?");
    valores.push(estado);
  }
  if (tipo) {
    condiciones.push("e.tipo = ?");
    valores.push(tipo);
  }
  if (q) {
    condiciones.push("(e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR e.numero_serie LIKE ? OR em.nombre LIKE ?)");
    const like = `%${q}%`;
    valores.push(like, like, like, like, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const equipos = db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre
       FROM equipos e
       LEFT JOIN empleados em ON em.id = e.asignado_a
       ${where}
       ORDER BY CASE e.estado WHEN 'BAJA' THEN 1 ELSE 0 END, e.codigo ASC`
    )
    .all(...valores) as EquipoConAsignado[];

  const total = (db.prepare("SELECT COUNT(*) AS c FROM equipos").get() as { c: number }).c;

  return (
    <>
      <PageHeader eyebrow="Activos de TI" title="Inventario de equipo">
        <span className="text-sm text-soft">
          {equipos.length} de {total} equipos
        </span>
      </PageHeader>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar código, marca, serie, asignado…" className={`${inputCls} max-w-xs`} />
        <select name="tipo" defaultValue={tipo} className={`${inputCls} max-w-[190px]`}>
          <option value="">Todos los tipos</option>
          {TIPOS_EQUIPO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estado} className={`${inputCls} max-w-[190px]`}>
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <button type="submit" className={btnGhost}>
          Filtrar
        </button>
      </form>

      <InventarioClient equipos={equipos} />
    </>
  );
}
