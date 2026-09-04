import Link from "next/link";
import { db } from "../../../lib/db";
import { agruparDuplicados, type EquipoRevisable } from "../../../lib/duplicados";
import { ETIQUETA_TIPO } from "../../../lib/constants";
import type { Equipo } from "../../../lib/types";
import DuplicadosClient, { type EquipoDup, type GrupoVista } from "../../../components/DuplicadosClient";
import { Empty, PageHeader, btnGhost } from "../../../components/ui";
import { exigirPagina } from "../../../lib/guardia";

export const dynamic = "force-dynamic";

/**
 * Revisión de datos repetidos.
 *
 * El inventario avisa "posible duplicado" en el renglón, pero ahí no se puede
 * hacer nada con eso: hay que buscar el otro registro a mano y compararlos de
 * memoria. Aquí los dos —o los que sean— salen juntos, con lo que cada uno
 * trae, y desde el mismo lugar se unen, se borra el sobrante o se marca que
 * son equipos distintos.
 */
export default async function PaginaDuplicados() {
  await exigirPagina("ti.ver");
  const revisables = db
    .prepare("SELECT id, codigo, tipo, marca, modelo, numero_serie, detalles FROM equipos WHERE estado != 'BAJA'")
    .all() as EquipoRevisable[];
  const grupos = agruparDuplicados(revisables);

  // Los grupos que ya se revisaron y resultaron ser equipos distintos.
  const descartados = new Map<string, string | null>();
  for (const d of db.prepare("SELECT campo, valor, nota FROM duplicados_revisados").all() as {
    campo: string;
    valor: string;
    nota: string | null;
  }[]) {
    descartados.set(`${d.campo}|${d.valor}`, d.nota);
  }

  // Datos de todos los equipos implicados, en una sola consulta.
  const implicados = [...new Set(grupos.flatMap((g) => g.ids))];
  const fichas = new Map<number, EquipoDup>();
  if (implicados.length) {
    const marcas = implicados.map(() => "?").join(",");
    const filas = db
      .prepare(
        `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero,
                (SELECT GROUP_CONCAT(r.folio, ', ') FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                  WHERE ri.equipo_id = e.id AND r.estado != 'ELIMINADA') AS folios,
                (SELECT COUNT(*) FROM mantenimientos m WHERE m.equipo_id = e.id) AS mantenimientos
         FROM equipos e
         LEFT JOIN empleados em ON em.id = e.asignado_a
         WHERE e.id IN (${marcas})`
      )
      .all(...implicados) as (EquipoDup &
      Equipo & { asignado_nombre: string | null; asignado_numero: string | null; folios: string | null; mantenimientos: number })[];

    for (const f of filas) {
      let det: Record<string, string> = {};
      try {
        det = f.detalles ? (JSON.parse(f.detalles) as Record<string, string>) : {};
      } catch {
        // Un JSON roto no debe tumbar la revisión: se muestra lo demás.
      }
      const campos: [string, string | null | undefined][] = [
        ["Marca y modelo", `${f.marca} ${f.modelo}`.trim()],
        ["Tipo", ETIQUETA_TIPO[f.tipo] ?? f.tipo],
        ["Número de serie", f.numero_serie],
        ["Nombre del equipo", det.nombre_computadora],
        ["No. de activo", det.activo],
        ["IMEI", det.imei],
        ["IMEI 2", det.imei2],
        ["Línea", det.numero],
        ["Características", f.specs],
        ["Comprado", f.fecha_compra],
        ["Notas", f.notas],
      ];
      fichas.set(f.id, {
        id: f.id,
        codigo: f.codigo,
        tipo: f.tipo,
        marca: f.marca,
        modelo: f.modelo,
        numero_serie: f.numero_serie,
        estado: f.estado,
        asignado_nombre: f.asignado_nombre,
        asignado_numero: f.asignado_numero,
        created_at: f.created_at,
        responsivas: f.folios ? f.folios.split(", ") : [],
        mantenimientos: f.mantenimientos,
        datos: campos
          .filter(([, v]) => String(v ?? "").trim())
          .map(([etiqueta, v]) => ({ etiqueta, valor: String(v).trim() })),
      });
    }
  }

  const aVista = (g: (typeof grupos)[number]): GrupoVista => ({
    clave: g.clave,
    campo: g.campo,
    etiqueta: g.etiqueta,
    valor: g.valor,
    bloqueante: g.bloqueante,
    nota: descartados.get(g.clave) ?? null,
    equipos: g.ids.map((id) => fichas.get(id)).filter((e): e is EquipoDup => !!e),
  });

  const porRevisar = grupos.filter((g) => !descartados.has(g.clave)).map(aVista);
  const yaRevisados = grupos.filter((g) => descartados.has(g.clave)).map(aVista);
  const equiposTocados = new Set(porRevisar.flatMap((g) => g.equipos.map((e) => e.id))).size;

  return (
    <>
      <PageHeader eyebrow="Activos de TI" title="Posibles duplicados">
        <Link href="/inventario" className={btnGhost}>
          ← Volver al inventario
        </Link>
        <span className="text-sm text-soft">
          {porRevisar.length} caso(s) · {equiposTocados} equipo(s)
        </span>
      </PageHeader>

      <p className="mb-5 max-w-3xl text-sm text-soft">
        Cada tarjeta junta los registros que comparten un dato que debería ser único. Compara lo que trae cada uno y
        decide: <b>unirlos</b> en uno solo —las responsivas y los mantenimientos de los dos se conservan—,{" "}
        <b>eliminar</b> el registro que sobra, o marcar que <b>no son el mismo</b> equipo si el dato se repite de
        casualidad.
      </p>

      {porRevisar.length === 0 && yaRevisados.length === 0 ? (
        <Empty>No hay datos repetidos en el inventario. Todo limpio.</Empty>
      ) : (
        <DuplicadosClient porRevisar={porRevisar} yaRevisados={yaRevisados} />
      )}
    </>
  );
}
