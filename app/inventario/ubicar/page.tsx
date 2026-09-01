import Link from "next/link";
import { db } from "../../../lib/db";
import { ETIQUETA_TIPO } from "../../../lib/constants";
import { nombreSinPistas, sugerirDepartamento } from "../../../lib/ubicar";
import UbicarClient, { type EquipoPorUbicar } from "../../../components/UbicarClient";
import { Empty, PageHeader, btnGhost } from "../../../components/ui";
import { exigirPagina } from "../../../lib/guardia";

export const dynamic = "force-dynamic";

/**
 * Ubicar los equipos por área.
 *
 * Después de importar quedan decenas de aparatos sin área, y editarlos uno por
 * uno no es trabajo de nadie. Aquí salen todos juntos con lo único que dice
 * dónde estaban —el nombre de la computadora— y una propuesta de departamento
 * sacada de ahí, para revisar de corrido y guardar todo de una vez.
 */
export default async function PaginaUbicar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPagina("ti.ver");
  const sp = await searchParams;
  // "faltan" (el de siempre), "conresp", "sinclase" o "todos".
  const ver = typeof sp.ver === "string" ? sp.ver : sp.todos === "1" ? "todos" : "faltan";

  const filas = db
    .prepare(
      `SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.numero_serie, e.estado, e.detalles,
              e.departamento, e.area, e.clasificacion, e.asignado_a,
              em.nombre AS asignado_nombre, em.numero_empleado AS asignado_numero,
              em.departamento AS asignado_departamento,
              (SELECT GROUP_CONCAT(r.folio, ', ') FROM responsiva_items ri JOIN responsivas r ON r.id = ri.responsiva_id
                WHERE ri.equipo_id = e.id AND r.tipo = 'ASIGNACION' AND r.estado != 'ELIMINADA') AS folios
       FROM equipos e LEFT JOIN empleados em ON em.id = e.asignado_a
       WHERE e.estado != 'BAJA'
       ORDER BY e.codigo ASC`
    )
    .all() as {
    id: number;
    codigo: string;
    tipo: string;
    marca: string;
    modelo: string;
    numero_serie: string | null;
    estado: string;
    detalles: string | null;
    departamento: string | null;
    area: string | null;
    clasificacion: string | null;
    asignado_a: number | null;
    asignado_nombre: string | null;
    asignado_numero: string | null;
    asignado_departamento: string | null;
    folios: string | null;
  }[];

  // Los departamentos que ya existen: la propuesta solo sale de datos reales.
  const departamentos = (
    db.prepare("SELECT DISTINCT departamento FROM empleados WHERE departamento IS NOT NULL AND departamento != '' ORDER BY departamento").all() as {
      departamento: string;
    }[]
  ).map((d) => d.departamento);
  // Y también los que ya se pusieron a mano en algún equipo.
  for (const d of db
    .prepare("SELECT DISTINCT departamento FROM equipos WHERE departamento IS NOT NULL AND departamento != ''")
    .all() as { departamento: string }[]) {
    if (!departamentos.includes(d.departamento)) departamentos.push(d.departamento);
  }
  departamentos.sort();

  const equipos: EquipoPorUbicar[] = filas.map((f) => {
    let nombrePc = "";
    try {
      const det = f.detalles ? (JSON.parse(f.detalles) as Record<string, string>) : {};
      nombrePc = det.nombre_computadora ?? "";
    } catch {
      // Un JSON roto no debe dejar fuera al equipo.
    }
    const propuesta = sugerirDepartamento(nombrePc, departamentos);
    return {
      id: f.id,
      codigo: f.codigo,
      tipo: ETIQUETA_TIPO[f.tipo] ?? f.tipo,
      equipo: `${f.marca} ${f.modelo}`.trim(),
      serie: f.numero_serie,
      nombre_pc: nombrePc,
      estado: f.estado,
      asignado: f.asignado_nombre ? `${f.asignado_numero} ${f.asignado_nombre}` : null,
      departamento: f.departamento ?? f.asignado_departamento ?? "",
      area: f.area ?? "",
      clasificacion: f.clasificacion ?? "",
      responsiva: f.folios,
      con_responsiva: !!f.asignado_a && !!f.folios,
      sugerido: propuesta?.departamento ?? "",
      motivo: propuesta?.motivo ?? (nombreSinPistas(nombrePc, f.numero_serie) ? "el nombre no dice el área" : ""),
    };
  });

  // Las vistas rápidas: cada una con su cuenta, para saber qué se va a tocar.
  const VISTAS = [
    { clave: "faltan", etiqueta: "Sin área", filtro: (e: EquipoPorUbicar) => !e.departamento },
    { clave: "sinclase", etiqueta: "Sin clasificar", filtro: (e: EquipoPorUbicar) => !e.clasificacion },
    { clave: "conresp", etiqueta: "Asignados con responsiva", filtro: (e: EquipoPorUbicar) => e.con_responsiva },
    { clave: "todos", etiqueta: "Todos", filtro: () => true },
  ];
  const vista = VISTAS.find((v) => v.clave === ver) ?? VISTAS[0];
  const lista = equipos.filter(vista.filtro);
  const faltan = equipos.filter((e) => !e.departamento);

  return (
    <>
      <PageHeader eyebrow="Activos de TI" title="Ubicar y clasificar equipos">
        <Link href="/inventario" className={btnGhost}>
          ← Volver al inventario
        </Link>
        <span className="text-sm text-soft">
          {faltan.length} sin área · {equipos.length} en total
        </span>
      </PageHeader>

      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 font-semibold uppercase tracking-wide text-soft">Ver</span>
        {VISTAS.map((v) => {
          const n = equipos.filter(v.filtro).length;
          const activa = v.clave === vista.clave;
          return (
            <a
              key={v.clave}
              href={`/inventario/ubicar?ver=${v.clave}`}
              className={`rounded-full border px-2.5 py-0.5 font-medium ${
                activa ? "border-kraft bg-kraft/15 text-ink" : "border-line bg-white text-soft hover:border-kraft/60 hover:text-ink"
              }`}
            >
              {v.etiqueta} <span className="mono">{n}</span>
            </a>
          );
        })}
      </nav>

      <p className="mb-5 max-w-3xl text-sm text-soft">
        El área es del equipo: se queda con él aunque cambie de dueño o se libere. Donde el nombre de la computadora lo
        dice —<span className="mono text-xs">SPK-TRAFICO-W</span>, <span className="mono text-xs">SPK-GTECALIDAD-W</span>—
        va una propuesta con el motivo a un lado; los que se nombraron con el número de serie no dicen nada y hay que
        ponerlos a mano. Nada se guarda hasta que pulses el botón.
      </p>

      {equipos.length === 0 ? (
        <Empty>No hay equipos que ubicar.</Empty>
      ) : (
        <UbicarClient equipos={lista} departamentos={departamentos} vista={vista.etiqueta} />
      )}
    </>
  );
}
