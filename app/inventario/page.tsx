import { db } from "../../lib/db";
import type { Empleado, EquipoConAsignado } from "../../lib/types";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, TIPOS_EQUIPO } from "../../lib/constants";
import { detectarDuplicados, CAMPOS_BLOQUEANTES, type EquipoRevisable } from "../../lib/duplicados";
import { idsSinResponsiva, equiposPorLigar } from "../../lib/pendientes";
import InventarioClient, { type ResponsivaDeEquipo } from "../../components/InventarioClient";
import AvisoDuplicados from "../../components/AvisoDuplicados";
import AvisoCelularesFaltantes from "../../components/AvisoCelularesFaltantes";
import AvisoPorLigar from "../../components/AvisoPorLigar";
import { revisarCelulares } from "../../lib/celulares";
import ExportarBotones from "../../components/ExportarBotones";
import { PageHeader, btnGhost, btnPrimary, inputCls } from "../../components/ui";

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
  const orden = typeof sp.orden === "string" ? sp.orden : "codigo";
  const soloDup = sp.dup === "1";
  // Los avisos ya no viven en la pantalla: se llega a ellos desde la campana,
  // y cada uno abre aquí su barra con el botón de la acción.
  const soloLigar = sp.ligar === "1";
  const verFaltanCel = sp.faltancel === "1";
  const soloSinResp = sp.sinresp === "1";
  // ?editar=<id> abre directo el formulario de ese equipo (se usa desde la ficha del empleado).
  const editarId = typeof sp.editar === "string" && Number(sp.editar) > 0 ? Number(sp.editar) : null;

  const ORDENES: Record<string, string> = {
    codigo: "CASE e.estado WHEN 'BAJA' THEN 1 ELSE 0 END, e.codigo ASC",
    recientes: "e.id DESC",
    antiguos: "e.id ASC",
    emp_asc: "em.numero_empleado IS NULL, CAST(em.numero_empleado AS INTEGER) ASC, e.codigo ASC",
    emp_desc: "em.numero_empleado IS NULL, CAST(em.numero_empleado AS INTEGER) DESC, e.codigo ASC",
  };
  const orderBy = ORDENES[orden] ?? ORDENES.codigo;

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
    // También se busca por IMEI y número de línea: son los datos con los que
    // normalmente se identifica un teléfono.
    condiciones.push(
      `(e.codigo LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR e.numero_serie LIKE ?
        OR em.nombre LIKE ? OR em.numero_empleado LIKE ?
        OR COALESCE(json_extract(e.detalles,'$.imei'),'') LIKE ?
        OR COALESCE(json_extract(e.detalles,'$.imei2'),'') LIKE ?
        OR REPLACE(COALESCE(json_extract(e.detalles,'$.numero'),''),' ','') LIKE ?
        OR COALESCE(e.specs,'') LIKE ?)`
    );
    const like = `%${q}%`;
    const likeNum = `%${q.replace(/\s/g, "")}%`;
    valores.push(like, like, like, like, like, like, like, like, likeNum, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const encontrados = db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero
       FROM equipos e
       LEFT JOIN empleados em ON em.id = e.asignado_a
       ${where}
       ORDER BY ${orderBy}`
    )
    .all(...valores) as EquipoConAsignado[];

  const total = (db.prepare("SELECT COUNT(*) AS c FROM equipos").get() as { c: number }).c;

  // Para poder elegir a quién se le entrega el equipo desde el formulario.
  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];

  // Los duplicados se buscan contra TODO el inventario, no solo contra lo filtrado.
  const duplicados = detectarDuplicados(
    db.prepare("SELECT id, codigo, numero_serie, detalles FROM equipos").all() as EquipoRevisable[]
  );
  const totalDuplicados = Object.keys(duplicados).length;
  // Desglose por campo: no es lo mismo una serie repetida (error que impide
  // guardar) que un nombre de computadora repetido (solo aviso).
  const porCampoDup = new Map<string, { etiqueta: string; n: number; bloqueante: boolean }>();
  for (const conflictos of Object.values(duplicados)) {
    for (const c of conflictos) {
      const actual = porCampoDup.get(c.campo) ?? { etiqueta: c.etiqueta, n: 0, bloqueante: CAMPOS_BLOQUEANTES.includes(c.campo) };
      actual.n += 1;
      porCampoDup.set(c.campo, actual);
    }
  }
  const desglose = [...porCampoDup.values()].sort((a, b) => b.n - a.n);

  // Teléfonos del listado de telefonía que no están dados de alta.
  const revisionCel = revisarCelulares();

  // Equipos con responsiva firmada a los que les falta el empleado en el inventario.
  const porLigar = equiposPorLigar();
  const porLigarPorEquipo: Record<number, { empleado_numero: string; empleado_nombre: string; folio: string }> = {};
  for (const p of porLigar)
    porLigarPorEquipo[p.equipo_id] = { empleado_numero: p.empleado_numero, empleado_nombre: p.empleado_nombre, folio: p.folio };

  // Equipos entregados que todavía no tienen su carta responsiva firmada.
  const sinResponsiva = idsSinResponsiva();
  const totalSinResp = sinResponsiva.size;

  let equipos = encontrados;
  if (soloDup) equipos = equipos.filter((e) => duplicados[e.id]);
  if (soloSinResp) equipos = equipos.filter((e) => sinResponsiva.has(e.id));
  if (soloLigar) equipos = equipos.filter((e) => porLigarPorEquipo[e.id]);

  // Cartas responsivas de cada equipo, para consultarlas desde el inventario.
  const filas = db
    .prepare(
      `SELECT ri.equipo_id, r.id, r.folio, r.tipo, r.clase, r.fecha, r.estado, r.pdf_path,
              em.numero_empleado AS empleado_numero, em.nombre AS empleado_nombre
       FROM responsiva_items ri
       JOIN responsivas r ON r.id = ri.responsiva_id
       JOIN empleados em ON em.id = r.empleado_id
       WHERE r.estado != 'ELIMINADA'
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all() as (ResponsivaDeEquipo & { equipo_id: number })[];
  const responsivas: Record<number, ResponsivaDeEquipo[]> = {};
  for (const { equipo_id, ...r } of filas) (responsivas[equipo_id] ??= []).push(r);

  return (
    <>
      <PageHeader eyebrow="Activos de TI" title="Inventario de equipo">
        <span className="text-sm text-soft">
          {equipos.length} de {total} equipos
        </span>
      </PageHeader>

      {verFaltanCel ? <AvisoCelularesFaltantes faltan={revisionCel.faltan} total={revisionCel.total} /> : null}

      {soloSinResp && totalSinResp > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <span>
            📄 Hay <b>{totalSinResp}</b> equipo(s) entregados <b>sin carta responsiva</b>. Genéralas todas juntas, imprime
            el paquete y recoge las firmas de una vuelta.
          </span>
          <span className="flex flex-wrap gap-2">
            <a href="/responsivas/generar" className={btnPrimary}>
              ✎ Generar en lote
            </a>
            <a href={soloSinResp ? "/inventario" : "/inventario?sinresp=1"} className={btnGhost}>
              {soloSinResp ? "Ver todo el inventario" : "Ver los que faltan"}
            </a>
          </span>
        </div>
      ) : null}

      {soloLigar ? <AvisoPorLigar pendientes={porLigar} /> : null}

      {soloDup ? <AvisoDuplicados total={totalDuplicados} desglose={desglose} soloDup={soloDup} /> : null}

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        {soloDup ? <input type="hidden" name="dup" value="1" /> : null}
        {soloSinResp ? <input type="hidden" name="sinresp" value="1" /> : null}
        {soloLigar ? <input type="hidden" name="ligar" value="1" /> : null}
        <input name="q" defaultValue={q} placeholder="Buscar código, marca, serie, IMEI, línea, asignado…" className={`${inputCls} max-w-xs`} />
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
        <select name="orden" defaultValue={orden} className={`${inputCls} max-w-[230px]`}>
          <option value="codigo">Por código</option>
          <option value="recientes">Más recientes primero</option>
          <option value="antiguos">Más antiguos primero</option>
          <option value="emp_asc">No. de empleado (menor a mayor)</option>
          <option value="emp_desc">No. de empleado (mayor a menor)</option>
        </select>
        <button type="submit" className={btnGhost}>
          Filtrar
        </button>
        <div className="ml-auto">
          <ExportarBotones tabla="inventario" params={{ q, tipo, estado }} />
        </div>
      </form>

      <InventarioClient
        equipos={equipos}
        duplicados={duplicados}
        sinResponsiva={[...sinResponsiva]}
        responsivas={responsivas}
        editarId={editarId}
        empleados={empleados}
        porLigar={porLigarPorEquipo}
      />
    </>
  );
}
