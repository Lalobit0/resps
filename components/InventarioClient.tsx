"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { Empleado, EquipoConAsignado } from "../lib/types";
import { CAMPOS_DETALLE, CLASIFICACIONES_EQUIPO, ETIQUETA_CLASIFICACION, ETIQUETA_ESTADO, ETIQUETA_TIPO, OPCIONES_MARCA_COMPUTO, PRECIO_POR_PLAN, TIPOS_EQUIPO, type TipoEquipo } from "../lib/constants";
import { dinero, fechaCorta } from "../lib/helpers";
import type { Conflicto } from "../lib/duplicados";
import { eliminarEquipo, guardarEquipo, importarEscaneoComputo, importarInventario, ligarConSuResponsiva, type ResultadoEscaneo as ResultadoEscaneoDatos } from "../app/inventario/actions";
import ResultadoEscaneo from "./ResultadoEscaneo";
import FusionarEquipoBtn from "./FusionarEquipoBtn";
import SelectConOtro from "./SelectConOtro";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls, tonoEstadoEquipo } from "./ui";
import { EncabezadoTabla, ordenarFilas, useTabla, type ColumnaTabla } from "./tabla";

/** Las columnas del inventario, con su ancho inicial y cómo ordenan. */
const COLUMNAS: ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código", ancho: 6 },
  // El área y la persona van al principio: el inventario se revisa por
  // departamento, así que es lo primero que se busca en el renglón.
  { clave: "area", etiqueta: "Área", ancho: 8 },
  { clave: "asignado", etiqueta: "Asignado a", ancho: 10 },
  { clave: "tipo", etiqueta: "Tipo", ancho: 5, valores: ["COMPUTO", "CELULAR", "RADIO", "OTRO"] },
  // Cómo está clasificado el aparato, que no es lo mismo que qué aparato es.
  { clave: "clasificacion", etiqueta: "Clasificación", ancho: 8, valores: ["ADMINISTRATIVO", "PRODUCCION", "SALA", "GERENCIAL", "COMPARTIDO"] },
  { clave: "equipo", etiqueta: "Equipo", ancho: 10 },
  // El nombre de la computadora va pegado a la serie: son los dos datos con
  // los que se reconoce la máquina cuando se tiene enfrente.
  { clave: "nombre", etiqueta: "Nombre del equipo", ancho: 8 },
  { clave: "serie", etiqueta: "Serie", ancho: 7 },
  {
    clave: "estado",
    etiqueta: "Estado",
    ancho: 7,
    valores: ["ASIGNADO", "DISPONIBLE", "SIN RESPONSIVA", "MANTENIMIENTO", "BAJA"],
  },
  { clave: "responsivas", etiqueta: "Responsivas", ancho: 8, valores: ["CON", "SIN"] },
  { clave: "compra", etiqueta: "Compra", ancho: 5, fin: true },
  { clave: "acciones", etiqueta: "Acciones", ancho: 18, ordenable: false },
];

/**
 * Dentro de una sección todos los equipos son del mismo tipo, así que esa
 * columna no dice nada: se quita y su espacio se lo queda la del equipo.
 */
function columnasPara(seccion: string): ColumnaTabla[] {
  if (!seccion) return COLUMNAS;
  const tipo = COLUMNAS.find((c) => c.clave === "tipo");
  return COLUMNAS.filter((c) => c.clave !== "tipo").map((c) =>
    c.clave === "equipo" ? { ...c, ancho: c.ancho + (tipo?.ancho ?? 0) } : c
  );
}

/** Nombre corto del tipo: en la columna no cabe "Teléfono / Celular". */
const TIPO_CORTO: Record<string, string> = { COMPUTO: "Cómputo", CELULAR: "Celular", RADIO: "Radio", OTRO: "Otro" };

const tdc = "px-2 py-1.5 text-sm text-ink align-middle";
const thc = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft whitespace-nowrap";
const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniDanger = "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50";

type Formulario = {
  id?: number;
  asignado_a: number | null;
  tipo: TipoEquipo;
  codigo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  fecha_compra: string;
  costo: string;
  estado: string;
  /** Área del propio aparato: se queda con él aunque cambie de dueño. */
  departamento: string;
  clasificacion: string;
  notas: string;
  detalles: Record<string, string>;
};

const FORM_VACIO: Formulario = {
  asignado_a: null,
  tipo: "COMPUTO",
  codigo: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  fecha_compra: "",
  costo: "",
  estado: "DISPONIBLE",
  departamento: "",
  clasificacion: "",
  notas: "",
  detalles: {},
};

function parseDetalles(d: string | null): Record<string, string> {
  try {
    return d ? (JSON.parse(d) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const IMPORTABLES: { tipo: TipoEquipo; etiqueta: string }[] = [
  { tipo: "COMPUTO", etiqueta: "Cómputo" },
  { tipo: "CELULAR", etiqueta: "Teléfonos" },
  { tipo: "RADIO", etiqueta: "Radios" },
];

/** Resumen legible de por qué un equipo está marcado como duplicado. */
function textoConflictos(conflictos: Conflicto[]): string {
  return conflictos.map((c) => `Mismo ${c.etiqueta} (${c.valor}) que ${c.otros.join(", ")}`).join("\n");
}

export type ResponsivaDeEquipo = {
  id: number;
  folio: string;
  tipo: string;
  clase: string;
  fecha: string;
  estado: string;
  pdf_path: string | null;
  empleado_numero: string;
  empleado_nombre: string;
};

/** Datos de un equipo pasados al formulario de edición. */
function formDeEquipo(e: EquipoConAsignado): Formulario {
  return {
    id: e.id,
    asignado_a: e.asignado_a,
    tipo: ((TIPOS_EQUIPO as readonly string[]).includes(e.tipo) ? e.tipo : "OTRO") as TipoEquipo,
    codigo: e.codigo,
    marca: e.marca,
    modelo: e.modelo,
    numero_serie: e.numero_serie ?? "",
    fecha_compra: e.fecha_compra ?? "",
    costo: e.costo !== null ? String(e.costo) : "",
    estado: e.estado,
    departamento: e.departamento ?? e.area ?? "",
    clasificacion: e.clasificacion ?? "",
    notas: e.notas ?? "",
    detalles: parseDetalles(e.detalles),
  };
}

export default function InventarioClient({
  equipos,
  seccion = "",
  duplicados = {},
  sinResponsiva = [],
  responsivas = {},
  editarId = null,
  empleados = [],
  porLigar = {},
  departamentos = [],
}: {
  equipos: EquipoConAsignado[];
  /** Tipo de equipo de la sección abierta; vacío = todo el inventario. */
  seccion?: string;
  duplicados?: Record<number, Conflicto[]>;
  sinResponsiva?: number[];
  responsivas?: Record<number, ResponsivaDeEquipo[]>;
  editarId?: number | null;
  empleados?: Empleado[];
  /** Equipos con responsiva vigente pero sin empleado: se pueden ligar de un clic. */
  porLigar?: Record<number, { empleado_numero: string; empleado_nombre: string; folio: string }>;
  /** Los departamentos que existen de verdad, para elegirlos en vez de escribirlos. */
  departamentos?: string[];
}) {
  const faltaResponsiva = new Set(sinResponsiva);
  // Los departamentos que de verdad existen: los de la plantilla y los que ya
  // trae algún equipo. Escribirlos a mano cada vez terminaba en "COMPRAS" y
  // "COMPRAS " conviviendo como si fueran dos áreas distintas.
  const opcionesDepartamento = useMemo(() => {
    const vistos = new Set<string>();
    for (const d of departamentos) if (d?.trim()) vistos.add(d.trim().toUpperCase());
    for (const e of equipos) {
      for (const d of [e.departamento, e.area, e.asignado_departamento, e.asignado_area]) {
        if (d?.trim()) vistos.add(d.trim().toUpperCase());
      }
    }
    return [...vistos].sort((a, b) => a.localeCompare(b)).map((d) => ({ valor: d, etiqueta: d }));
  }, [departamentos, equipos]);
  const columnas = columnasPara(seccion);
  // Cada juego de columnas recuerda sus anchos por separado.
  const { anchos, orden, empezarArrastre, alternarOrden } = useTabla(
    seccion ? "inventario-seccion" : "inventario",
    columnas
  );

  /**
   * Lo que se compara en cada columna al ordenar. "Sin responsiva" cuenta como
   * un estado más: es como se busca en la práctica.
   */
  const valorColumna = (e: EquipoConAsignado, clave: string): string | number | null => {
    switch (clave) {
      case "codigo":
        return e.codigo;
      case "tipo":
        return e.tipo;
      case "equipo":
        return `${e.marca} ${e.modelo}`;
      case "nombre":
        return parseDetalles(e.detalles).nombre_computadora ?? "";
      case "serie":
        return e.numero_serie ?? "";
      case "area":
        return e.asignado_area || e.asignado_departamento || e.area || e.departamento || "";
      case "clasificacion":
        return e.clasificacion || "";
      case "estado":
        return faltaResponsiva.has(e.id) ? "SIN RESPONSIVA" : e.estado;
      case "asignado":
        return e.asignado_nombre ? `${e.asignado_numero} ${e.asignado_nombre}` : "";
      case "responsivas":
        return (responsivas[e.id]?.length ?? 0) > 0 ? "CON" : "SIN";
      case "compra":
        return e.fecha_compra ?? "";
      default:
        return "";
    }
  };

  const ordenados = ordenarFilas(equipos, orden, columnas, valorColumna);

  // Con ?editar=<id> el formulario se abre solo: así se puede editar un equipo
  // desde la ficha del empleado sin tener que buscarlo aquí.
  const [form, setForm] = useState<Formulario | null>(() => {
    const e = editarId ? equipos.find((x) => x.id === editarId) : undefined;
    return e ? formDeEquipo(e) : null;
  });
  const [verEq, setVerEq] = useState<EquipoConAsignado | null>(null);
  const [escaneo, setEscaneo] = useState<ResultadoEscaneoDatos | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const escaneoRef = useRef<HTMLInputElement>(null);
  const tipoImport = useRef<TipoEquipo>("COMPUTO");

  const setC = (campo: keyof Formulario) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  const ponerDetalle = (clave: string, valor: string) =>
    setForm((f) => {
      if (!f) return f;
      const detalles = { ...f.detalles, [clave]: valor };
      // Al elegir el plan se autollena su precio del tarifario.
      if (clave === "plan" && PRECIO_POR_PLAN[valor]) detalles.plan_precio = PRECIO_POR_PLAN[valor];
      return { ...f, detalles };
    });
  const setDetalle = (clave: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    ponerDetalle(clave, ev.target.value);
  const setMarca = (v: string) => setForm((f) => (f ? { ...f, marca: v } : f));

  const enviar = () => {
    if (!form) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      // El área del equipo y su departamento son el mismo dato en la práctica.
      const res = await guardarEquipo({ ...form, area: form.departamento });
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const abrirImport = (tipo: TipoEquipo) => {
    tipoImport.current = tipo;
    fileRef.current?.click();
  };

  const importar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    fd.append("archivo", archivo);
    const tipo = tipoImport.current;
    iniciar(async () => {
      try {
        const res = await importarInventario(tipo, fd);
        if (res.ok) setMensaje(res.mensaje ?? "Inventario importado.");
        else setError(res.error ?? "No se pudo importar.");
      } catch {
        setError("No se pudo subir el archivo: pesa demasiado o se interrumpió el envío.");
      }
    });
  };

  /** Archivos que genera el script que recorre las computadoras (uno por equipo). */
  const importarEscaneo = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const seleccion = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!seleccion.length) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    for (const archivo of seleccion) fd.append("archivo", archivo);
    setEscaneo(null);
    iniciar(async () => {
      try {
        const res = await importarEscaneoComputo(fd);
        if (res.ok && res.escaneo) setEscaneo(res.escaneo);
        else if (res.ok) setMensaje(res.mensaje ?? "Escaneo cargado.");
        else setError(res.error ?? "No se pudo leer el escaneo.");
      } catch {
        setError(
          "No se pudieron subir los archivos: pesan demasiado o se interrumpió el envío. " +
            "Sube menos archivos a la vez."
        );
      }
    });
  };

  const camposDetalle = form ? CAMPOS_DETALLE[form.tipo] : [];

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {mensaje}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {escaneo ? <ResultadoEscaneo escaneo={escaneo} empleados={empleados} onCerrar={() => setEscaneo(null)} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btnPrimary}
          onClick={() => {
            setForm({ ...FORM_VACIO, detalles: {} });
            setError("");
            setMensaje("");
          }}
        >
          + Registrar equipo
        </button>
        <span className="mx-1 text-xs text-soft">Importar Excel:</span>
        {IMPORTABLES.map((imp) => (
          <button key={imp.tipo} className={btnGhost} disabled={pendiente} onClick={() => abrirImport(imp.tipo)}>
            ↥ {imp.etiqueta}
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
        <button
          className={btnGhost}
          disabled={pendiente}
          title="Archivos que genera el script que lee las computadoras: puedes seleccionar varios o subir el ZIP"
          onClick={() => escaneoRef.current?.click()}
        >
          🖥️ Escaneo de PCs
        </button>
        <input
          ref={escaneoRef}
          type="file"
          multiple
          accept=".txt,.csv,.tsv,.json,.zip,.xlsx,.xls"
          className="hidden"
          onChange={importarEscaneo}
        />
        <Link
          href="/inventario/importaciones"
          className={btnGhost}
          title="Lo que se subió por Excel, con lo que le falta a cada equipo"
        >
          📋 Lo que subí
        </Link>
      </div>

      {form ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
        <Card className="my-6 w-full max-w-4xl">
          <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar equipo" : "Nuevo equipo"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Tipo de equipo *</Label>
              <select className={inputCls} value={form.tipo} onChange={setC("tipo")}>
                {TIPOS_EQUIPO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Código interno</Label>
              <input className={`${inputCls} mono`} value={form.codigo} onChange={setC("codigo")} placeholder="Vacío = se genera solo" />
            </div>
            <div>
              <Label>Estado</Label>
              <select className={inputCls} value={form.estado} onChange={setC("estado")} disabled={form.asignado_a !== null}>
                <option value="DISPONIBLE">Disponible</option>
                <option value="MANTENIMIENTO">En mantenimiento</option>
                <option value="BAJA">Baja</option>
                {form.estado === "ASIGNADO" ? <option value="ASIGNADO">Asignado</option> : null}
              </select>
              {form.asignado_a !== null ? (
                <p className="mt-1 text-xs text-soft">Con empleado asignado el estado es “Asignado”.</p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Label>Asignado a</Label>
              <BuscadorEmpleado
                empleados={empleados}
                value={form.asignado_a}
                onChange={(id) => setForm((f) => (f ? { ...f, asignado_a: id } : f))}
              />
              <p className="mt-1 text-xs text-soft">
                Déjalo vacío si el equipo está libre. Al asignarlo aparecerá como pendiente de responsiva.
              </p>
            </div>
            <div>
              <Label>Marca</Label>
              {form.tipo === "COMPUTO" ? (
                <SelectConOtro value={form.marca} onChange={setMarca} opciones={OPCIONES_MARCA_COMPUTO} permitirOtro placeholder="Escribe la marca" />
              ) : (
                <input className={inputCls} value={form.marca} onChange={setC("marca")} placeholder="Dell, HP, TXPRO…" />
              )}
            </div>
            <div>
              <Label>Modelo</Label>
              <input className={inputCls} value={form.modelo} onChange={setC("modelo")} />
            </div>
            <div>
              <Label>Número de serie</Label>
              <input className={`${inputCls} mono`} value={form.numero_serie} onChange={setC("numero_serie")} />
            </div>

            {camposDetalle.map((c) => {
              const val = form.detalles[c.clave] ?? "";
              return (
                <div key={c.clave}>
                  <Label>{c.etiqueta}</Label>
                  {c.opciones ? (
                    <SelectConOtro value={val} onChange={(v) => ponerDetalle(c.clave, v)} opciones={c.opciones} permitirOtro={c.permitirOtro} />
                  ) : (
                    <input className={inputCls} value={val} onChange={setDetalle(c.clave)} />
                  )}
                </div>
              );
            })}

            <div>
              <Label>Fecha de compra</Label>
              <input className={inputCls} type="date" value={form.fecha_compra} onChange={setC("fecha_compra")} />
            </div>
            <div>
              <Label>Costo (MXN)</Label>
              <input className={inputCls} type="number" step="0.01" value={form.costo} onChange={setC("costo")} />
            </div>
            <div>
              <Label>Área / Departamento del equipo</Label>
              <SelectConOtro
                value={form.departamento}
                onChange={(v) => setForm((f) => (f ? { ...f, departamento: v.toUpperCase() } : f))}
                opciones={opcionesDepartamento}
                permitirOtro
                placeholder="Escribe el departamento nuevo"
              />
              <p className="mt-1 text-xs text-soft">Se queda con el aparato aunque cambie de dueño.</p>
            </div>
            <div>
              <Label>Clasificación</Label>
              <select
                className={inputCls}
                value={form.clasificacion}
                onChange={(ev) => setForm((f) => (f ? { ...f, clasificacion: ev.target.value } : f))}
              >
                <option value="">— Sin clasificar —</option>
                {CLASIFICACIONES_EQUIPO.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
                {form.clasificacion && !CLASIFICACIONES_EQUIPO.some((c) => c.valor === form.clasificacion) ? (
                  <option value={form.clasificacion}>{form.clasificacion}</option>
                ) : null}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notas</Label>
              <textarea className={inputCls} rows={2} value={form.notas} onChange={setC("notas")} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar equipo"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
        </div>
      ) : null}

      {equipos.length === 0 ? (
        <Empty>No hay equipos con estos filtros. Registra uno nuevo o importa tu Excel.</Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full table-fixed border-collapse" data-tabla="inventario">
            <EncabezadoTabla
              columnas={columnas}
              anchos={anchos}
              orden={orden}
              onOrdenar={alternarOrden}
              onArrastrar={empezarArrastre}
            />
            <tbody>
              {ordenados.map((e) => {
                const det = parseDetalles(e.detalles);
                return (
                <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className={`${tdc} text-xs font-semibold`}>
                    <div className="flex items-center gap-1">
                      <span className="mono truncate" title={e.codigo}>
                        {e.codigo}
                      </span>
                      {duplicados[e.id] ? (
                        <Link
                          href="/inventario/duplicados"
                          className="shrink-0 text-amber-600 hover:text-amber-800"
                          title={`${textoConflictos(duplicados[e.id])}\n\nPúlsalo para revisarlo y unirlo.`}
                          aria-label="Datos repetidos: ir a la revisión"
                        >
                          ⚠️
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className={`${tdc} truncate text-xs`}
                    title={
                      [
                        e.asignado_area || e.area || "",
                        (e.asignado_departamento || e.departamento) &&
                        (e.asignado_departamento || e.departamento) !== (e.asignado_area || e.area)
                          ? `Departamento: ${e.asignado_departamento || e.departamento}`
                          : "",
                        // El área del equipo se queda aunque su dueño se haya ido.
                        !e.asignado_a && (e.area || e.departamento) ? "Área del equipo: sigue disponible aquí" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    }
                  >
                    {e.asignado_area || e.asignado_departamento ? (
                      e.asignado_area || e.asignado_departamento
                    ) : e.area || e.departamento ? (
                      <span className="italic text-soft">{e.area || e.departamento}</span>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  <td className={`${tdc} truncate text-xs`} title={e.asignado_nombre ? `${e.asignado_numero} ${e.asignado_nombre} · ver su histórico` : ""}>
                    {e.asignado_nombre && e.asignado_a ? (
                      <Link href={`/empleados/${e.asignado_a}`} className="hover:text-kraft hover:underline">
                        <span className="mono text-kraft-dark">{e.asignado_numero}</span> {e.asignado_nombre}
                      </Link>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  {seccion ? null : (
                    <td className={`${tdc} truncate text-xs`} title={ETIQUETA_TIPO[e.tipo] ?? e.tipo}>
                      {TIPO_CORTO[e.tipo] ?? ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                    </td>
                  )}
                  <td className={`${tdc} truncate text-xs`} title={ETIQUETA_CLASIFICACION[e.clasificacion ?? ""] ?? e.clasificacion ?? ""}>
                    {e.clasificacion ? (
                      ETIQUETA_CLASIFICACION[e.clasificacion] ?? e.clasificacion
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  <td className={`${tdc} truncate`} title={`${e.marca} ${e.modelo}${e.specs ? " · " + e.specs : ""}`}>
                    <div className="truncate font-medium">
                      {e.marca} {e.modelo}
                    </div>
                    {e.specs ? <div className="truncate text-xs text-soft">{e.specs}</div> : null}
                  </td>
                  <td className={`${tdc} mono truncate text-xs`} title={det.nombre_computadora ?? ""}>
                    {det.nombre_computadora || <span className="text-soft">—</span>}
                  </td>
                  <td className={`${tdc} mono truncate text-xs`} title={e.numero_serie ?? ""}>{e.numero_serie ?? "—"}</td>
                  <td className={tdc}>
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                    {faltaResponsiva.has(e.id) ? (
                      <div className="mt-1">
                        <Badge tono="petrol">Sin responsiva</Badge>
                      </div>
                    ) : null}
                  </td>
                  <td className={tdc}>
                    {(responsivas[e.id] ?? []).length ? (
                      <div className="flex flex-wrap gap-1">
                        {(responsivas[e.id] ?? []).map((r) =>
                          r.pdf_path ? (
                            <a
                              key={r.id}
                              href={`/api/pdf/${r.id}`}
                              target="_blank"
                              className="mono rounded border border-line bg-white px-1.5 py-0.5 text-[11px] text-kraft-dark hover:bg-paper"
                              title={`${r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · ${fechaCorta(r.fecha)} · abrir PDF`}
                            >
                              {r.folio}
                            </a>
                          ) : (
                            <span key={r.id} className="mono text-[11px] text-soft" title="Sin archivo PDF">
                              {r.folio}
                            </span>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-soft">—</span>
                    )}
                  </td>
                  <td className={`${tdc} whitespace-nowrap text-xs text-soft`}>
                    {fechaCorta(e.fecha_compra)}
                    {e.costo !== null ? <div>{dinero(e.costo)}</div> : null}
                  </td>
                  <td className={tdc}>
                    <div className="flex flex-wrap items-center gap-1">
                      <button className={mini} onClick={() => setVerEq(e)}>
                        Ver
                      </button>
                      <button
                        className={mini}
                        onClick={() =>
                          setForm(formDeEquipo(e))
                        }
                      >
                        Editar
                      </button>
                      {faltaResponsiva.has(e.id) ? (
                        <Link
                          className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                          href={`/responsivas/nueva?equipo=${e.id}`}
                          title="Generar la carta responsiva para que el empleado la firme"
                        >
                          + Responsiva
                        </Link>
                      ) : null}
                      {porLigar[e.id] ? (
                        <button
                          className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                          disabled={pendiente}
                          title={`Su responsiva ${porLigar[e.id].folio} está a nombre de ${porLigar[e.id].empleado_numero} ${porLigar[e.id].empleado_nombre}`}
                          onClick={() => {
                            setError("");
                            setMensaje("");
                            iniciar(async () => {
                              const res = await ligarConSuResponsiva(e.id);
                              if (res.ok) setMensaje(res.mensaje ?? "Equipo ligado.");
                              else setError(res.error ?? "No se pudo ligar.");
                            });
                          }}
                        >
                          🔗 Ligar a {porLigar[e.id].empleado_numero}
                        </button>
                      ) : null}
                      <Link className={mini} href={`/inventario/${e.id}`} title="Por quién ha pasado, sus cartas y sus mantenimientos">
                        Historial
                      </Link>
                      <FusionarEquipoBtn equipoId={e.id} codigo={e.codigo} className={mini} etiqueta="Fusionar" />
                      <button
                        className={miniDanger}
                        disabled={pendiente}
                        onClick={() => {
                          if (confirm(`¿Eliminar el equipo ${e.codigo}?`)) {
                            setError("");
                            iniciar(async () => {
                              const res = await eliminarEquipo(e.id);
                              if (!res.ok) setError(res.error ?? "Error desconocido.");
                            });
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {verEq ? (
        <DetalleEquipo
          equipo={verEq}
          conflictos={duplicados[verEq.id] ?? []}
          cartas={responsivas[verEq.id] ?? []}
          onCerrar={() => setVerEq(null)}
        />
      ) : null}
    </div>
  );
}

/** Etiqueta legible para una clave de detalle (busca en el tipo del equipo y luego en todos). */
function etiquetaDetalle(tipo: string, clave: string): string {
  const propio = (CAMPOS_DETALLE[tipo as TipoEquipo] ?? []).find((c) => c.clave === clave);
  if (propio) return propio.etiqueta;
  for (const t of TIPOS_EQUIPO) {
    const c = CAMPOS_DETALLE[t].find((x) => x.clave === clave);
    if (c) return c.etiqueta;
  }
  return clave;
}

/** Modal con TODOS los campos del equipo (básicos + detalles por tipo). */
function DetalleEquipo({
  equipo: e,
  conflictos,
  cartas,
  onCerrar,
}: {
  equipo: EquipoConAsignado;
  conflictos: Conflicto[];
  cartas: ResponsivaDeEquipo[];
  onCerrar: () => void;
}) {
  const detalles = parseDetalles(e.detalles);
  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div key={etiqueta}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{etiqueta}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{valor ?? "—"}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</p>
            <h2 className="text-lg font-bold text-ink">
              {e.marca} {e.modelo}
            </h2>
          </div>
          <button className={btnGhost} onClick={onCerrar}>
            ✕ Cerrar
          </button>
        </div>
        {conflictos.length ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">⚠️ Datos repetidos en el inventario</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {conflictos.map((c) => (
                <li key={`${c.campo}-${c.valor}`}>
                  Mismo {c.etiqueta} <span className="mono">{c.valor}</span> que {c.otros.join(", ")}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              <Link href="/inventario/duplicados" className={btnGhost}>
                Revisarlo y unirlo →
              </Link>
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dato("Tipo", ETIQUETA_TIPO[e.tipo] ?? e.tipo)}
          {dato("Categoría", e.categoria)}
          {dato("Número de serie", e.numero_serie ? <span className="mono">{e.numero_serie}</span> : null)}
          {dato("Estado", <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>)}
          {dato(
            "Asignado a",
            e.asignado_nombre && e.asignado_a ? (
              <Link href={`/empleados/${e.asignado_a}`} className="hover:text-kraft hover:underline" title="Ver su histórico">
                <span className="mono text-xs text-kraft-dark">{e.asignado_numero}</span> {e.asignado_nombre}
              </Link>
            ) : null
          )}
          {dato("Fecha de compra", e.fecha_compra ? fechaCorta(e.fecha_compra) : null)}
          {dato("Costo", e.costo !== null ? dinero(e.costo) : null)}
          {Object.entries(detalles)
            .filter(([, v]) => v && String(v).trim())
            .map(([clave, valor]) => dato(etiquetaDetalle(e.tipo, clave), String(valor)))}
          {e.specs ? dato("Specs", e.specs) : null}
        </div>
        {e.notas ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Notas</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{e.notas}</p>
          </div>
        ) : null}

        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-soft">Cartas responsivas</p>
          {cartas.length === 0 ? (
            <p className="text-sm text-soft">Este equipo no tiene carta responsiva registrada.</p>
          ) : (
            <div className="space-y-1.5">
              {cartas.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="mono text-xs font-semibold text-kraft-dark">{r.folio}</p>
                    <p className="text-xs text-soft">
                      {r.tipo === "ASIGNACION" ? "Asignación" : "Devolución"} · {fechaCorta(r.fecha)} ·{" "}
                      <span className="mono">{r.empleado_numero}</span> {r.empleado_nombre}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.estado === "VIGENTE" ? <Badge tono="verde">Vigente</Badge> : <Badge tono="gris">Cerrada</Badge>}
                    {r.pdf_path ? (
                      <a href={`/api/pdf/${r.id}`} target="_blank" className={mini}>
                        Abrir PDF
                      </a>
                    ) : (
                      <span className="text-xs text-soft">sin archivo</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
