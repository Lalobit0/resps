import Link from "next/link";
import { db } from "../../lib/db";
import type { Empleado, EquipoConAsignado } from "../../lib/types";
import { CLASIFICACIONES_EQUIPO, ETIQUETA_ESTADO } from "../../lib/constants";
import { detectarDuplicados, CAMPOS_BLOQUEANTES, type EquipoRevisable } from "../../lib/duplicados";
import { idsSinResponsiva, equiposPorLigar } from "../../lib/pendientes";
import InventarioClient, { type ResponsivaDeEquipo } from "../../components/InventarioClient";
import AvisoDuplicados from "../../components/AvisoDuplicados";
import AvisoCelularesFaltantes from "../../components/AvisoCelularesFaltantes";
import AvisoPorLigar from "../../components/AvisoPorLigar";
import { revisarCelulares } from "../../lib/celulares";
import ExportarBotones from "../../components/ExportarBotones";
import FiltrosAuto from "../../components/FiltrosAuto";
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
  // Departamento del empleado que tiene el equipo. "SIN" = equipo sin dueño.
  const depto = typeof sp.depto === "string" ? sp.depto : "";
  // Cómo está clasificado el aparato: administrativo, producción, sala…
  const clase = typeof sp.clase === "string" ? sp.clase : "";
  // "con" / "sin": si el equipo tiene o no carta responsiva.
  const resp = typeof sp.resp === "string" ? sp.resp : "";
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

  // El tipo no entra en el SQL: la sección se aplica al final, después de
  // contar cuántos equipos quedan en cada una con los demás filtros puestos.
  const condiciones: string[] = [];
  const valores: (string | number)[] = [];
  if (estado) {
    condiciones.push("e.estado = ?");
    valores.push(estado);
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
        OR COALESCE(json_extract(e.detalles,'$.nombre_computadora'),'') LIKE ?
        OR COALESCE(e.specs,'') LIKE ?)`
    );
    const like = `%${q}%`;
    const likeNum = `%${q.replace(/\s/g, "")}%`;
    valores.push(like, like, like, like, like, like, like, like, likeNum, like, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const encontrados = db
    .prepare(
      `SELECT e.*, em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero,
              em.departamento AS asignado_departamento, em.area AS asignado_area
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
  if (resp === "sin") equipos = equipos.filter((e) => sinResponsiva.has(e.id));
  if (resp === "con") equipos = equipos.filter((e) => !sinResponsiva.has(e.id));
  if (clase) equipos = equipos.filter((e) => (e.clasificacion ?? "") === (clase === "SIN" ? "" : clase));

  // Cuántos hay en cada sección con lo que está filtrado ahora mismo: así el
  // número del botón dice qué se va a encontrar al entrar, no el total del año.
  // El departamento se cuenta ya dentro de la sección de tipo, y el tipo se
  // cuenta ya dentro del departamento: cada fila responde "si pulso aquí,
  // ¿cuántos me quedan?".
  // El área es del equipo, no de la persona: si su dueño se fue, el aparato
  // sigue perteneciendo a su departamento y ahí se vuelve a entregar.
  const deptoDe = (e: EquipoConAsignado) =>
    e.asignado_departamento?.trim() || e.departamento?.trim() || e.area?.trim() || "SIN";
  const porTipo: Record<string, number> = {};
  for (const e of depto ? equipos.filter((x) => deptoDe(x) === depto) : equipos)
    porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
  const enSeccion = depto ? equipos.filter((e) => deptoDe(e) === depto).length : equipos.length;

  if (tipo) equipos = equipos.filter((e) => e.tipo === tipo);

  const porDepto = new Map<string, number>();
  for (const e of equipos) {
    const d = deptoDe(e);
    if (d) porDepto.set(d, (porDepto.get(d) ?? 0) + 1);
  }
  const enTipo = equipos.length;
  const DEPTOS = [...porDepto.entries()]
    .sort((a, b) => (a[0] === "SIN" ? 1 : b[0] === "SIN" ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])))
    .map(([valor, n]) => ({ valor, etiqueta: valor === "SIN" ? "Sin asignar" : valor, n }));

  if (depto) equipos = equipos.filter((e) => deptoDe(e) === depto);

  /** Dirección de la lista cambiando de sección sin perder los demás filtros. */
  const hrefSeccion = (t: string, d: string = depto) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, estado, resp, clase, tipo: t, depto: d })) if (v) p.set(k, v);
    if (soloDup) p.set("dup", "1");
    if (soloSinResp) p.set("sinresp", "1");
    if (soloLigar) p.set("ligar", "1");
    if (verFaltanCel) p.set("faltancel", "1");
    const cadena = p.toString();
    return cadena ? `/inventario?${cadena}` : "/inventario";
  };

  const SECCIONES: { valor: string; etiqueta: string; icono: string }[] = [
    { valor: "", etiqueta: "Todo el inventario", icono: "📦" },
    { valor: "COMPUTO", etiqueta: "Equipo de cómputo", icono: "💻" },
    { valor: "CELULAR", etiqueta: "Celulares", icono: "📱" },
    { valor: "RADIO", etiqueta: "Radios", icono: "📻" },
    { valor: "OTRO", etiqueta: "Otros", icono: "🔌" },
  ];

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
        <Link href="/inventario/ubicar" className={btnGhost} title="Poner el área y la clasificación de varios equipos de una vez">
          🏢 Ubicar por área
        </Link>
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

      {/* Cada tipo de equipo en su sección: el inventario deja de ser una sola
          lista con computadoras, teléfonos y radios revueltos. */}
      <nav className="mb-4 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {SECCIONES.map((s) => {
          const cuantos = s.valor ? (porTipo[s.valor] ?? 0) : enSeccion;
          const activa = tipo === s.valor;
          return (
            <a
              key={s.valor || "todo"}
              href={hrefSeccion(s.valor)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                activa
                  ? "border-kraft bg-kraft/15 text-ink"
                  : "border-line bg-white text-soft hover:border-kraft/60 hover:text-ink"
              }`}
            >
              <span aria-hidden>{s.icono}</span>
              {s.etiqueta}
              <span className={`mono text-xs ${activa ? "text-kraft-dark" : "text-soft"}`}>{cuantos}</span>
            </a>
          );
        })}
      </nav>

      {/* Segunda fila: el departamento de quien tiene el equipo. Se revisa
          departamento por departamento, así que va junto a las secciones. */}
      {DEPTOS.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 font-semibold uppercase tracking-wide text-soft">Departamento</span>
          <a
            href={hrefSeccion(tipo, "")}
            className={`rounded-full border px-2.5 py-0.5 font-medium ${
              depto ? "border-line bg-white text-soft hover:border-kraft/60 hover:text-ink" : "border-kraft bg-kraft/15 text-ink"
            }`}
          >
            Todos <span className="mono">{enTipo}</span>
          </a>
          {DEPTOS.map((d) => (
            <a
              key={d.valor}
              href={hrefSeccion(tipo, d.valor)}
              className={`rounded-full border px-2.5 py-0.5 font-medium ${
                depto === d.valor
                  ? "border-kraft bg-kraft/15 text-ink"
                  : "border-line bg-white text-soft hover:border-kraft/60 hover:text-ink"
              }`}
            >
              {d.etiqueta} <span className="mono">{d.n}</span>
            </a>
          ))}
        </div>
      ) : null}

      <FiltrosAuto className="mb-5 flex flex-wrap items-end gap-2">
        {depto ? <input type="hidden" name="depto" value={depto} /> : null}
        {soloDup ? <input type="hidden" name="dup" value="1" /> : null}
        {soloSinResp ? <input type="hidden" name="sinresp" value="1" /> : null}
        {soloLigar ? <input type="hidden" name="ligar" value="1" /> : null}
        <input name="q" defaultValue={q} placeholder="Buscar código, marca, serie, IMEI, línea, nombre de equipo, asignado…" className={`${inputCls} max-w-xs`} />
        {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
        <select name="estado" defaultValue={estado} className={`${inputCls} max-w-[190px]`}>
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select name="resp" defaultValue={resp} className={`${inputCls} max-w-[200px]`}>
          <option value="">Con y sin responsiva</option>
          <option value="con">Con responsiva</option>
          <option value="sin">Sin responsiva</option>
        </select>
        <select name="clase" defaultValue={clase} className={`${inputCls} max-w-[200px]`} title="Cómo está clasificado el equipo">
          <option value="">Toda clasificación</option>
          {CLASIFICACIONES_EQUIPO.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
          <option value="SIN">Sin clasificar</option>
        </select>
        {/* El orden se cambia pulsando el título de la columna. */}
        <button type="submit" className="sr-only">
          Filtrar
        </button>
        <div className="ml-auto">
          <ExportarBotones tabla="inventario" params={{ q, tipo, estado }} />
        </div>
      </FiltrosAuto>

      <InventarioClient
        equipos={equipos}
        seccion={tipo}
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
