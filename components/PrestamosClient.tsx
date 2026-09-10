"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Empleado } from "../lib/types";
import { ETIQUETA_TIPO } from "../lib/constants";
import { fechaCorta, hoyISO } from "../lib/helpers";
import {
  ETIQUETA_ESTADO_PRESTAMO,
  estaFirmado,
  estaVencido,
  queSePresto,
  sigueFuera,
  situacion,
  type Prestamo,
} from "../lib/prestamos-comun";
import type { EquipoPrestable } from "../lib/prestamos";
import {
  cancelarPrestamo,
  crearPrestamo,
  devolverPrestamo,
  eliminarPrestamo,
  regenerarPasePrestamo,
  subirPaseFirmado,
} from "../app/prestamos/actions";
import Buscador from "./Buscador";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls } from "./ui";

/**
 * Los pases de préstamo.
 *
 * Prestar no es entregar: el equipo sale del anaquel un rato y vuelve. Antes
 * eso no tenía dónde anotarse —o se asignaba a alguien que solo lo iba a
 * tener dos días, o simplemente desaparecía—, y esta pantalla es ese hueco.
 *
 * Arriba, lo que está fuera ahorita, con los vencidos hasta arriba. Abajo, lo
 * que ya volvió.
 */

const FORM_VACIO = {
  empleadoId: null as number | null,
  equipoId: "" as number | "",
  aMano: false,
  descripcion: "",
  cantidad: "1",
  motivo: "",
  fechaPrestamo: hoyISO(),
  fechaCompromiso: "",
  condicionEntrega: "",
  entregadoPor: "",
  notas: "",
};

export default function PrestamosClient({
  lista,
  empleados,
  equipos,
}: {
  lista: Prestamo[];
  empleados: Empleado[];
  equipos: EquipoPrestable[];
}) {
  const [form, setForm] = useState<typeof FORM_VACIO | null>(null);
  const [devolviendo, setDevolviendo] = useState<number | null>(null);
  const [regreso, setRegreso] = useState({ fecha: hoyISO(), condicion: "", recibidoPor: "" });
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, despues?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      setAviso({ ok: r.ok, texto: r.ok ? (r.mensaje ?? "Listo.") : (r.error ?? "No se pudo.") });
      if (r.ok) despues?.();
    });

  const coincide = (p: Prestamo) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${p.folio} ${p.nombre} ${p.numero_empleado} ${p.descripcion} ${p.codigo ?? ""} ${p.departamento ?? ""} ${p.motivo ?? ""}`
      .toLowerCase()
      .includes(q);
  };

  const fuera = useMemo(() => lista.filter((p) => sigueFuera(p) && coincide(p)), [lista, busqueda]);
  const cerrados = useMemo(() => lista.filter((p) => !sigueFuera(p) && coincide(p)), [lista, busqueda]);
  const vencidos = useMemo(() => lista.filter((p) => estaVencido(p)), [lista]);

  const opcionesEquipo = useMemo(
    () =>
      equipos.map((e) => ({
        id: e.id,
        titulo: `${e.codigo} · ${[e.marca, e.modelo].filter(Boolean).join(" ") || "sin marca"}`,
        detalle: e.area ? `${ETIQUETA_TIPO[e.tipo] ?? e.tipo} · ${e.area}` : (ETIQUETA_TIPO[e.tipo] ?? e.tipo),
        derecha: e.numero_serie ?? "",
        buscar: [e.codigo, e.marca, e.modelo, e.numero_serie, e.area, e.tipo].filter(Boolean).join(" "),
      })),
    [equipos]
  );

  /** Columnas compartidas: cambia el bloque de acciones según la lista. */
  const columnasDe = (conAcciones: boolean): Columna<Prestamo>[] => [
    {
      clave: "folio",
      titulo: "Pase",
      ancho: "10%",
      valor: (p) => p.folio,
      claseCelda: `${tdCls} mono text-xs font-semibold`,
      celda: (p) => (
        <>
          {p.folio}
          {!estaFirmado(p) && sigueFuera(p) ? (
            <div className="mt-1">
              <Badge tono="rojo">Sin firmar</Badge>
            </div>
          ) : null}
        </>
      ),
    },
    {
      clave: "quien",
      titulo: "Quién lo trae",
      ancho: "20%",
      valor: (p) => p.nombre,
      claseCelda: tdCls,
      celda: (p) => (
        <>
          <Link href={`/empleados/${p.empleado_id}`} className="font-medium text-ink hover:text-kraft hover:underline">
            {p.nombre}
          </Link>
          <div className="text-xs text-soft">
            {p.numero_empleado}
            {p.departamento ? ` · ${p.departamento}` : ""}
          </div>
          {p.empleado_activo === 0 ? <Badge tono="rojo">Ya no trabaja aquí</Badge> : null}
        </>
      ),
    },
    {
      clave: "area",
      titulo: "Área",
      ancho: "10%",
      valor: (p) => p.area || p.departamento || "",
      claseCelda: `${tdCls} truncate text-xs`,
      celda: (p) => p.area || p.departamento || "—",
    },
    {
      clave: "que",
      titulo: "Qué se llevó",
      ancho: "22%",
      valor: (p) => queSePresto(p),
      claseCelda: tdCls,
      celda: (p) => (
        <>
          <span className="font-medium">{queSePresto(p)}</span>
          {p.codigo ? null : (
            <div className="text-[11px] text-soft" title="No está dado de alta en el inventario">
              capturado a mano
            </div>
          )}
          {p.motivo ? <div className="text-xs text-soft">{p.motivo}</div> : null}
        </>
      ),
    },
    {
      clave: "salida",
      titulo: "Salió",
      ancho: "8%",
      valor: (p) => p.fecha_prestamo,
      claseCelda: `${tdCls} whitespace-nowrap text-xs`,
      celda: (p) => fechaCorta(p.fecha_prestamo),
    },
    {
      clave: "regreso",
      titulo: conAcciones ? "Lo trae el" : "Volvió el",
      ancho: "9%",
      valor: (p) => (conAcciones ? (p.fecha_compromiso ?? "") : (p.fecha_devolucion ?? "")),
      claseCelda: `${tdCls} whitespace-nowrap text-xs`,
      celda: (p) =>
        conAcciones ? (p.fecha_compromiso ? fechaCorta(p.fecha_compromiso) : <span className="text-soft">sin plazo</span>) : fechaCorta(p.fecha_devolucion),
    },
    {
      clave: "situacion",
      titulo: "Situación",
      ancho: "11%",
      valor: (p) => situacion(p).texto,
      claseCelda: tdCls,
      celda: (p) => {
        const s = situacion(p);
        return <Badge tono={s.tono as never}>{s.texto}</Badge>;
      },
    },
    {
      clave: "acciones",
      titulo: "Acciones",
      ancho: "22%",
      claseCelda: tdCls,
      celda: (p) =>
        devolviendo === p.id ? (
          <div className="w-60 space-y-2">
            <input
              className={inputCls}
              type="date"
              value={regreso.fecha}
              onChange={(e) => setRegreso((r) => ({ ...r, fecha: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Cómo regresó (opcional)"
              value={regreso.condicion}
              onChange={(e) => setRegreso((r) => ({ ...r, condicion: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Quién lo recibió (opcional)"
              value={regreso.recibidoPor}
              onChange={(e) => setRegreso((r) => ({ ...r, recibidoPor: e.target.value }))}
            />
            <div className="flex gap-1.5">
              <button
                className={btnPrimary}
                disabled={pendiente}
                onClick={() =>
                  ejecutar(
                    () => devolverPrestamo({ id: p.id, ...regreso }),
                    () => setDevolviendo(null)
                  )
                }
              >
                Confirmar
              </button>
              <button className={btnGhost} onClick={() => setDevolviendo(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {p.pdf_path || p.pdf_firmado ? (
              <a href={`/api/pase/${p.id}`} target="_blank" rel="noreferrer" className={btnGhost}>
                Ver
              </a>
            ) : null}
            {sigueFuera(p) ? (
              <>
                <button
                  className={btnPrimary}
                  onClick={() => {
                    setDevolviendo(p.id);
                    setRegreso({ fecha: hoyISO(), condicion: "", recibidoPor: "" });
                  }}
                >
                  Ya lo trajo
                </button>
                {estaFirmado(p) ? null : (
                  <>
                    <a href={`/api/pase/${p.id}?original=1`} target="_blank" rel="noreferrer" className={btnGhost}>
                      Imprimir
                    </a>
                    <SubirPaseBtn id={p.id} folio={p.folio} onListo={setAviso} />
                  </>
                )}
                <button
                  className={btnGhost}
                  disabled={pendiente}
                  title="El equipo vuelve al inventario sin registrar devolución"
                  onClick={() => {
                    if (!confirm(`Se va a cancelar el pase ${p.folio}.\n\n¿Continuar?`)) return;
                    ejecutar(() => cancelarPrestamo(p.id));
                  }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button className={btnGhost} disabled={pendiente} onClick={() => ejecutar(() => regenerarPasePrestamo(p.id))}>
                  Regenerar
                </button>
                <button
                  className={btnDanger}
                  disabled={pendiente}
                  onClick={() => {
                    if (!confirm(`Se va a borrar el pase ${p.folio} del sistema.\n\n¿Continuar?`)) return;
                    ejecutar(() => eliminarPrestamo(p.id));
                  }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ),
    },
  ];

  const colFuera = useMemo(() => columnasDe(true), [devolviendo, regreso, pendiente]);
  const colCerrados = useMemo(() => columnasDe(false), [devolviendo, regreso, pendiente]);
  const tablaFuera = useTabla({ id: "prestamos-fuera", columnas: colFuera, filas: fuera });
  const tablaCerrados = useTabla({ id: "prestamos-cerrados", columnas: colCerrados, filas: cerrados });

  const guardar = () => {
    if (!form) return;
    ejecutar(
      () =>
        crearPrestamo({
          empleadoId: form.empleadoId ?? 0,
          equipoId: form.aMano ? null : form.equipoId === "" ? null : Number(form.equipoId),
          descripcion: form.descripcion,
          cantidad: Number(form.cantidad) || 1,
          motivo: form.motivo,
          fechaPrestamo: form.fechaPrestamo,
          fechaCompromiso: form.fechaCompromiso,
          condicionEntrega: form.condicionEntrega,
          entregadoPor: form.entregadoPor,
          notas: form.notas,
        }),
      () => setForm(null)
    );
  };

  return (
    <>
      {aviso ? (
        <p
          role="status"
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            aviso.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {vencidos.length > 0 ? (
        <Card className="mb-5 border-red-300 bg-red-50">
          <h2 className="font-bold text-red-900">
            {vencidos.length === 1
              ? "1 préstamo ya se pasó de la fecha"
              : `${vencidos.length} préstamos ya se pasaron de la fecha`}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-red-900">
            {vencidos
              .slice(0, 6)
              .map((p) => `${p.folio} · ${queSePresto(p)} · ${p.nombre}`)
              .join(" — ")}
            {vencidos.length > 6 ? ` y ${vencidos.length - 6} más.` : "."}
          </p>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Pase, persona, equipo, área o motivo…"
          className={`${inputCls} max-w-sm`}
        />
        {busqueda ? (
          <button className={btnGhost} onClick={() => setBusqueda("")}>
            ✕ Quitar la búsqueda
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/inventario" className={btnGhost}>
            Ir al inventario
          </Link>
          <button
            className={btnPrimary}
            onClick={() => {
              setForm({ ...FORM_VACIO, fechaPrestamo: hoyISO() });
              setAviso(null);
            }}
          >
            + Nuevo pase de préstamo
          </button>
        </div>
      </div>

      {form ? (
        <Card className="mb-5">
          <h2 className="mb-4 text-base font-bold text-ink">Nuevo pase de préstamo</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>¿A quién se le presta? *</Label>
              <BuscadorEmpleado
                empleados={empleados}
                value={form.empleadoId}
                onChange={(id) => setForm((f) => (f ? { ...f, empleadoId: id } : f))}
              />
              <p className="mt-1 text-xs text-soft">Su área se toma de la plantilla y sale impresa en el pase.</p>
            </div>

            <div>
              <Label>Motivo o para qué lo necesita</Label>
              <input
                className={inputCls}
                placeholder="Capacitación en planta, junta con cliente, evento…"
                value={form.motivo}
                onChange={(e) => setForm((f) => (f ? { ...f, motivo: e.target.value } : f))}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-paper/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Qué se presta</p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={form.aMano}
                  onChange={(e) => setForm((f) => (f ? { ...f, aMano: e.target.checked, equipoId: "" } : f))}
                />
                No está en el inventario, lo escribo a mano
              </label>
            </div>

            {form.aMano ? (
              <div className="grid gap-3 md:grid-cols-[1fr_7rem]">
                <div>
                  <Label>Qué es *</Label>
                  <input
                    className={inputCls}
                    placeholder="Cable HDMI de 5 m, extensión eléctrica, proyector de la otra planta…"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => (f ? { ...f, descripcion: e.target.value } : f))}
                  />
                </div>
                <div>
                  <Label>Cantidad</Label>
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    value={form.cantidad}
                    onChange={(e) => setForm((f) => (f ? { ...f, cantidad: e.target.value } : f))}
                  />
                </div>
              </div>
            ) : (
              <>
                <Label>Equipo disponible *</Label>
                <Buscador
                  opciones={opcionesEquipo}
                  value={form.equipoId}
                  onChange={(id) => setForm((f) => (f ? { ...f, equipoId: id } : f))}
                  placeholder="Código, marca, modelo, serie o área…"
                  sinResultados={(q) =>
                    `Ningún equipo disponible casa con "${q}". Solo se pueden prestar los que están libres; si ya lo trae alguien, primero regístrale la devolución.`
                  }
                />
                <p className="mt-1 text-xs text-soft">
                  {equipos.length} equipo(s) disponibles. Un equipo asignado no aparece: hay que liberarlo primero.
                </p>
              </>
            )}

            <div className="mt-3">
              <Label>Cómo se entrega</Label>
              <input
                className={inputCls}
                placeholder="Con su cargador y funda, sin detalles a la vista…"
                value={form.condicionEntrega}
                onChange={(e) => setForm((f) => (f ? { ...f, condicionEntrega: e.target.value } : f))}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <Label>Se lo lleva el</Label>
              <input
                className={inputCls}
                type="date"
                value={form.fechaPrestamo}
                onChange={(e) => setForm((f) => (f ? { ...f, fechaPrestamo: e.target.value } : f))}
              />
            </div>
            <div>
              <Label>Lo trae el</Label>
              <input
                className={inputCls}
                type="date"
                value={form.fechaCompromiso}
                onChange={(e) => setForm((f) => (f ? { ...f, fechaCompromiso: e.target.value } : f))}
              />
              <p className="mt-1 text-xs text-soft">Sin fecha no se puede vencer, así que nadie lo va a reclamar.</p>
            </div>
            <div>
              <Label>Quién lo entrega</Label>
              <input
                className={inputCls}
                placeholder="Nombre de quien sale del área de TI"
                value={form.entregadoPor}
                onChange={(e) => setForm((f) => (f ? { ...f, entregadoPor: e.target.value } : f))}
              />
            </div>
          </div>

          <div className="mt-4">
            <Label>Observaciones</Label>
            <input
              className={inputCls}
              placeholder="Lo que convenga dejar por escrito"
              value={form.notas}
              onChange={(e) => setForm((f) => (f ? { ...f, notas: e.target.value } : f))}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
              {pendiente ? "Generando el pase…" : "Generar el pase para firmar"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      {/* --- Lo que está fuera ahorita --- */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">
          Prestado ahorita
          <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold normal-case text-soft">
            {tablaFuera.filas.length}
          </span>
        </h2>
        <AvisoTabla estado={tablaFuera} />
      </div>
      <Card className="p-0">
        <Tabla
          estado={tablaFuera}
          claveFila={(p) => p.id}
          minAncho={1200}
          claseFila={(p) => (estaVencido(p) ? "bg-red-50 hover:bg-red-100/60" : "")}
          vacio={
            <Empty>
              {lista.length === 0
                ? "Todavía no hay préstamos. Genera el primero con “Nuevo pase de préstamo”."
                : "No hay nada prestado ahorita que coincida con eso."}
            </Empty>
          }
        />
      </Card>

      {/* --- Lo que ya volvió --- */}
      {cerrados.length > 0 ? (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">
              Ya devuelto
              <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold normal-case text-soft">
                {tablaCerrados.filas.length}
              </span>
            </h2>
            <AvisoTabla estado={tablaCerrados} />
          </div>
          <Card className="p-0">
            <Tabla estado={tablaCerrados} claveFila={(p) => p.id} minAncho={1200} />
          </Card>
        </section>
      ) : null}
    </>
  );
}

/** Sube el escaneo del pase ya firmado en papel. */
function SubirPaseBtn({
  id,
  folio,
  onListo,
}: {
  id: number;
  folio: string;
  onListo: (a: { ok: boolean; texto: string }) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  return (
    <label className={`${btnGhost} cursor-pointer`} title={`Subir el pase ${folio} ya firmado`}>
      {pendiente ? "Subiendo…" : "Subir firmado"}
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        disabled={pendiente}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.append("archivo", f);
          iniciar(async () => {
            const r = await subirPaseFirmado(id, fd);
            onListo({ ok: r.ok, texto: r.ok ? (r.mensaje ?? "Listo.") : (r.error ?? "No se pudo subir.") });
          });
        }}
      />
    </label>
  );
}
