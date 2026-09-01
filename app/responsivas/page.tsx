import Link from "next/link";
import { db } from "../../lib/db";
import type { ResponsivaLista } from "../../lib/types";
import { Empty, PageHeader, btnGhost, btnPrimary, inputCls } from "../../components/ui";
import ExportarBotones from "../../components/ExportarBotones";
import FiltrosAuto from "../../components/FiltrosAuto";
import AvisoParesPartidos from "../../components/AvisoParesPartidos";
import ResponsivasClient from "../../components/ResponsivasClient";
import { paresPartidos } from "../../lib/pendientes";
import { ETIQUETA_CLASE } from "../../lib/constants";
import { exigirPagina } from "../../lib/guardia";

export const dynamic = "force-dynamic";

export default async function PaginaResponsivas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("ti.ver");
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const clase = typeof sp.clase === "string" ? sp.clase : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const nueva = typeof sp.nueva === "string" ? sp.nueva : "";
  const orden = typeof sp.orden === "string" ? sp.orden : "recientes";
  // "sin" = pendientes de subir firmadas, "con" = las que ya tienen su escaneo.
  const firma = typeof sp.firma === "string" ? sp.firma : "";
  // Las cartas partidas se revisan desde la campana, no en cada visita.
  const verPartidas = sp.partidas === "1";

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
  // Una carta cuenta como firmada si trae el escaneo o llegó ya firmada.
  const FIRMADA_SQL = "(COALESCE(r.pdf_firmado,'') != '' OR r.origen = 'CARGADA')";
  if (firma === "sin") condiciones.push(`NOT ${FIRMADA_SQL}`);
  if (firma === "con") condiciones.push(FIRMADA_SQL);
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

  // Pares donde el escaneo entró como carta aparte: una con firma, otra con equipo.
  const partidas = sp.partidas === "1" ? paresPartidos() : [];
  // La carta se firma en papel: está pendiente mientras no se suba el escaneo.
  const faltaFirma = (r: ResponsivaLista) => r.origen !== "CARGADA" && !r.pdf_firmado;
  const totalSinFirma = responsivas.filter(faltaFirma).length;
  const total = (db.prepare("SELECT COUNT(*) AS c FROM responsivas WHERE estado != 'ELIMINADA'").get() as { c: number }).c;

  /**
   * Dirección de la lista cambiando solo lo que se indique. Sirve para quitar
   * un filtro suelto sin perder los demás.
   */
  const conFiltros = (cambios: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, tipo, clase, estado, firma, ...cambios })) if (v) p.set(k, v);
    if (verPartidas) p.set("partidas", "1");
    const cadena = p.toString();
    return cadena ? `/responsivas?${cadena}` : "/responsivas";
  };

  // Lo que está filtrando ahora mismo, cada uno con su tachita para quitarlo.
  const puestos: { etiqueta: string; sin: string }[] = [];
  if (q) puestos.push({ etiqueta: `Busca “${q}”`, sin: conFiltros({ q: "" }) });
  if (tipo) puestos.push({ etiqueta: tipo === "ASIGNACION" ? "Asignación" : "Devolución", sin: conFiltros({ tipo: "" }) });
  if (clase) puestos.push({ etiqueta: ETIQUETA_CLASE[clase] ?? clase, sin: conFiltros({ clase: "" }) });
  if (estado) puestos.push({ etiqueta: estado === "VIGENTE" ? "Vigente" : "Cerrada", sin: conFiltros({ estado: "" }) });
  if (firma) puestos.push({ etiqueta: firma === "sin" ? "Sin firmar" : "Firmadas", sin: conFiltros({ firma: "" }) });

  // El desplegable con algo elegido se pinta, para verlo sin abrirlo.
  const marcado = (v: string) => `${inputCls} ${v ? "border-kraft bg-kraft/10 font-semibold text-ink" : ""}`;

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
        <span className="text-sm text-soft">
          {responsivas.length} de {total} cartas
        </span>
      </PageHeader>

      {nueva ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Se generó el documento <span className="mono font-semibold">{nueva}</span> y quedó guardado en el repositorio.
        </div>
      ) : null}

      {firma === "sin" && totalSinFirma > 0 ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ✍️ Hay <b>{totalSinFirma}</b> responsiva(s) <b>sin firmar</b> en esta lista. Imprímelas, recoge las firmas y
          sube el documento con <b>Subir firmada</b> del renglón.
        </div>
      ) : null}

      {verPartidas ? <AvisoParesPartidos pares={partidas} /> : null}

      <FiltrosAuto className="flex flex-wrap items-center gap-2">
        {verPartidas ? <input type="hidden" name="partidas" value="1" /> : null}
        <input
          key={`q-${q}`}
          name="q"
          defaultValue={q}
          placeholder="🔍 Folio, nombre o número…"
          className={`${inputCls} w-full max-w-[280px] ${q ? "border-kraft bg-kraft/10" : ""}`}
        />
        <select key={`tipo-${tipo}`} name="tipo" defaultValue={tipo} className={`${marcado(tipo)} max-w-[170px]`} title="Asignación o devolución">
          <option value="">Tipo: todos</option>
          <option value="ASIGNACION">Asignación</option>
          <option value="DEVOLUCION">Devolución</option>
        </select>
        <select key={`clase-${clase}`} name="clase" defaultValue={clase} className={`${marcado(clase)} max-w-[200px]`} title="Qué se entregó">
          <option value="">Carta: todas</option>
          {Object.entries(ETIQUETA_CLASE).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select key={`estado-${estado}`} name="estado" defaultValue={estado} className={`${marcado(estado)} max-w-[160px]`} title="Vigente o ya cerrada">
          <option value="">Estado: todos</option>
          <option value="VIGENTE">Vigente</option>
          <option value="CERRADA">Cerrada</option>
        </select>
        <select key={`firma-${firma}`} name="firma" defaultValue={firma} className={`${marcado(firma)} max-w-[170px]`} title="Si ya se subió el escaneo firmado">
          <option value="">Firma: todas</option>
          <option value="sin">Sin firmar</option>
          <option value="con">Firmadas</option>
        </select>
        <button type="submit" className="sr-only">
          Filtrar
        </button>
        <div className="ml-auto">
          <ExportarBotones tabla="responsivas" params={{ q, tipo, clase, estado }} />
        </div>
      </FiltrosAuto>

      <div className="mb-5 mt-2 flex flex-wrap items-center gap-2 text-xs text-soft">
        {puestos.length ? (
          <>
            <span>Filtrando por:</span>
            {puestos.map((p) => (
              <Link
                key={p.etiqueta}
                href={p.sin}
                title="Quitar este filtro"
                className="inline-flex items-center gap-1 rounded-full border border-kraft bg-kraft/10 px-2.5 py-0.5 font-semibold text-ink hover:bg-kraft/20"
              >
                {p.etiqueta} <span className="text-soft">✕</span>
              </Link>
            ))}
            <Link href={verPartidas ? "/responsivas?partidas=1" : "/responsivas"} className="underline hover:text-ink">
              Quitar todos
            </Link>
          </>
        ) : (
          <span>
            Los desplegables se aplican solos. También puedes pulsar el título de una columna: <b>Tipo</b>, <b>Carta</b>,{" "}
            <b>Estado</b> y <b>Firma</b> filtran la lista; los demás la ordenan.
          </span>
        )}
      </div>

      {/* La tabla se queda aunque el filtro no deje nada: si desapareciera, el
          título de la columna con el que se filtró ya no se podría volver a
          pulsar para quitarlo. */}
      {total === 0 ? (
        <Empty>Todavía no hay responsivas. Genera la primera con “Nueva responsiva”.</Empty>
      ) : (
        <ResponsivasClient responsivas={responsivas} />
      )}

    </>
  );
}
