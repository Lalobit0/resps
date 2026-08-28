"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado, Equipo, FirmaGuardada } from "../lib/types";
import {
  CAMPOS_DETALLE,
  CARTAS,
  CLASES_CARTA,
  CLASE_POR_TIPO,
  ETIQUETA_TIPO,
  OPCIONES_MARCA_COMPUTO,
  PRECIO_POR_PLAN,
  TIPOS_EQUIPO,
  rolAutoridad,
  type ClaseCarta,
  type TipoEquipo,
} from "../lib/constants";
import { dinero, fechaCorta, hoyISO } from "../lib/helpers";
import type { ConceptoVale } from "../lib/vales";
import { crearResponsiva, crearVale } from "../app/responsivas/actions";
import { guardarEquipo } from "../app/inventario/actions";
import BuscadorEmpleado from "./BuscadorEmpleado";
import SelectConOtro from "./SelectConOtro";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls } from "./ui";

type NuevoEquipoForm = {
  /** Con id se está corrigiendo un equipo del inventario; sin id es un alta. */
  id?: number;
  tipo: TipoEquipo;
  codigo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  fecha_compra: string;
  costo: string;
  notas: string;
  detalles: Record<string, string>;
};

const claseDeTipo = (tipo: string): ClaseCarta => CLASE_POR_TIPO[tipo as TipoEquipo] ?? "OTROS";

/** Filtro sugerido al cambiar de tipo de carta: el tipo exacto si solo admite uno. */
const filtroPorClase = (c: ClaseCarta): TipoEquipo | "TODOS" => {
  const tipos = CARTAS[c].tiposEquipo;
  return tipos.length === 1 ? tipos[0] : "TODOS";
};

export default function NuevaResponsivaClient({
  empleados,
  equipos,
  firmas,
  conceptos = [],
  precargado = null,
}: {
  empleados: Empleado[];
  equipos: Equipo[];
  firmas: FirmaGuardada[];
  /** Tarifario de RH, para el vale que acompaña al radio. */
  conceptos?: ConceptoVale[];
  precargado?: { equipoId: number; empleadoId: number | null } | null;
}) {
  // Cuando se entra desde "+ Responsiva" del inventario, el equipo y el
  // empleado ya vienen dados: solo falta capturar las firmas.
  const equipoPre = precargado ? equipos.find((e) => e.id === precargado.equipoId) : undefined;
  const router = useRouter();
  const [clase, setClase] = useState<ClaseCarta>(equipoPre ? claseDeTipo(equipoPre.tipo) : "COMPUTO");
  const [empleadoId, setEmpleadoId] = useState<number | null>(precargado?.empleadoId ?? null);
  const [equipoId, setEquipoId] = useState<number | null>(precargado?.equipoId ?? null);
  const [tipoFiltro, setTipoFiltro] = useState<TipoEquipo | "TODOS">(equipoPre ? (equipoPre.tipo as TipoEquipo) : "COMPUTO");
  const [filtro, setFiltro] = useState("");
  const [formEquipo, setFormEquipo] = useState<NuevoEquipoForm | null>(null);
  const [errorEquipo, setErrorEquipo] = useState("");
  const [guardandoEquipo, iniciarEquipo] = useTransition();
  const [fecha, setFecha] = useState(hoyISO());
  /** Se puede adelantar hasta un año; más allá es un error de captura. */
  const topeAdelante = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [observaciones, setObservaciones] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  // Los radios se entregan con dos papeles: su carta y el vale de descuento
  // por el valor de reposición. Se ofrecen juntos para no hacerlo en dos vueltas.
  const [conVale, setConVale] = useState(false);
  const [valeConceptoId, setValeConceptoId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const config = CARTAS[clase];
  const requiereEquipo = config.tiposEquipo.length > 0;
  const esVale = !!config.esVale;
  const rol = rolAutoridad(clase);
  const empleado = empleados.find((e) => e.id === empleadoId);

  // La lista no se limita al tipo de carta: se filtra por tipo de equipo y, al
  // elegir uno, la carta se ajusta sola al que corresponde.
  const equiposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return equipos
      .filter((e) => (tipoFiltro === "TODOS" ? true : e.tipo === tipoFiltro))
      .filter((e) =>
        !q ? true : [e.codigo, e.categoria, e.marca, e.modelo, e.numero_serie ?? ""].join(" ").toLowerCase().includes(q)
      );
  }, [equipos, filtro, tipoFiltro]);

  const cambiarClase = (c: ClaseCarta) => {
    setClase(c);
    setTipoFiltro(filtroPorClase(c));
    setFiltro("");
    setFormEquipo(null);
    setError("");
    // Si el equipo ya elegido no corresponde a la nueva carta, se deselecciona.
    const permitidos = CARTAS[c].tiposEquipo as readonly string[];
    const actual = equipos.find((e) => e.id === equipoId);
    if (!actual || !permitidos.includes(actual.tipo)) setEquipoId(null);
  };

  const elegirEquipo = (e: Equipo) => {
    setEquipoId(e.id);
    setClase(claseDeTipo(e.tipo));
    setError("");
    // El vale se propone solo en los radios, que es donde se usa. El concepto
    // se adivina del tarifario por la marca: TXPRO, KENWOOD…
    setConVale(e.tipo === "RADIO");
    const texto = `${e.marca} ${e.modelo}`.toUpperCase();
    const sugerido = conceptos.find((c) =>
      c.concepto
        .split(/\s+/)
        .filter((p: string) => p.length >= 5 && !p.startsWith("REP"))
        .some((p: string) => texto.includes(p))
    );
    setValeConceptoId(sugerido?.id ?? "");
  };

  /** Abre el mismo formulario con los datos del equipo, para corregirlo antes de entregarlo. */
  const editarEquipo = (e: Equipo) => {
    let detalles: Record<string, string> = {};
    try {
      detalles = e.detalles ? (JSON.parse(e.detalles) as Record<string, string>) : {};
    } catch {
      detalles = {};
    }
    setErrorEquipo("");
    setFormEquipo({
      id: e.id,
      tipo: ((TIPOS_EQUIPO as readonly string[]).includes(e.tipo) ? e.tipo : "OTRO") as TipoEquipo,
      codigo: e.codigo,
      marca: e.marca,
      modelo: e.modelo,
      numero_serie: e.numero_serie ?? "",
      fecha_compra: e.fecha_compra ?? "",
      costo: e.costo !== null ? String(e.costo) : "",
      notas: e.notas ?? "",
      detalles,
    });
  };

  const abrirNuevoEquipo = () => {
    setFormEquipo({
      tipo: tipoFiltro !== "TODOS" ? tipoFiltro : config.tiposEquipo[0] ?? "COMPUTO",
      codigo: "",
      marca: "",
      modelo: "",
      numero_serie: "",
      fecha_compra: "",
      costo: "",
      notas: "",
      detalles: {},
    });
    setErrorEquipo("");
  };

  const setCE = (campo: keyof NuevoEquipoForm) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFormEquipo((f) => (f ? { ...f, [campo]: ev.target.value } : f));

  // Al cambiar el tipo se limpian los detalles: cada tipo tiene sus propios campos.
  const cambiarTipoNuevo = (tipo: TipoEquipo) =>
    setFormEquipo((f) => (f ? { ...f, tipo, detalles: {} } : f));

  const ponerDetalleNuevo = (clave: string, valor: string) =>
    setFormEquipo((f) => {
      if (!f) return f;
      const detalles = { ...f.detalles, [clave]: valor };
      if (clave === "plan" && PRECIO_POR_PLAN[valor]) detalles.plan_precio = PRECIO_POR_PLAN[valor];
      return { ...f, detalles };
    });

  const guardarNuevoEquipo = () => {
    if (!formEquipo) return;
    setErrorEquipo("");
    iniciarEquipo(async () => {
      const res = await guardarEquipo({
        id: formEquipo.id,
        tipo: formEquipo.tipo,
        codigo: formEquipo.codigo,
        marca: formEquipo.marca,
        modelo: formEquipo.modelo,
        numero_serie: formEquipo.numero_serie,
        fecha_compra: formEquipo.fecha_compra,
        costo: formEquipo.costo,
        estado: "DISPONIBLE",
        notas: formEquipo.notas,
        detalles: formEquipo.detalles,
      });
      if (res.ok && res.id) {
        setEquipoId(res.id);
        setClase(claseDeTipo(formEquipo.tipo));
        setTipoFiltro(formEquipo.tipo);
        setFiltro("");
        setFormEquipo(null);
        setError("");
        router.refresh();
      } else {
        setErrorEquipo(res.error ?? "No se pudo guardar el equipo.");
      }
    });
  };

  /** El equipo elegido, para el vale que acompaña a la entrega. */
  const equipoElegido = equipos.find((e) => e.id === equipoId);
  const mostrarVale = !esVale && equipoElegido?.tipo === "RADIO" && conceptos.length > 0;
  const valeElegido = conceptos.find((c) => c.id === valeConceptoId);

  const enviar = () => {
    setError("");
    if (!empleado) return setError("Selecciona al empleado que recibe.");
    if (mostrarVale && conVale && !valeConceptoId)
      return setError("Elige el concepto del vale de descuento, o desmarca la casilla.");
    if (requiereEquipo && !equipoId) return setError("Selecciona el equipo a asignar.");
    if (esVale && !concepto.trim()) return setError("Indica el concepto del descuento.");
    if (esVale && !(Number(monto) > 0)) return setError("Indica el valor de reposición.");
    iniciar(async () => {
      const res = await crearResponsiva({
        clase,
        empleadoId: empleado.id,
        equipoId: requiereEquipo ? equipoId : null,
        observaciones,
        fecha,
        // La carta se imprime y se firma en papel: sin firmas digitales.
        firma: "",
        concepto: esVale ? concepto : undefined,
        monto: esVale ? monto : undefined,
      });
      if (res.ok && res.id) {
        window.open(`/api/pdf/${res.id}`, "_blank");
        // El vale se hace después de la carta: si falla, la entrega ya quedó
        // registrada y el vale se puede generar luego desde el equipo.
        if (mostrarVale && conVale) {
          const vale = await crearVale({
            empleadoId: empleado.id,
            conceptoId: Number(valeConceptoId),
            fecha,
            responsivaOrigenId: res.id,
          });
          if (vale.ok && vale.id) window.open(`/api/pdf/${vale.id}`, "_blank");
          else {
            setError(`La carta ${res.folio} se generó, pero el vale no: ${vale.error ?? ""} Puedes hacerlo desde el histórico del equipo.`);
            return;
          }
        }
        router.push(`/responsivas?nueva=${res.folio}`);
        router.refresh();
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">1. Tipo de carta</h2>
          <div className="grid grid-cols-2 gap-2">
            {CLASES_CARTA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => cambiarClase(c)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  clase === c
                    ? "border-kraft bg-orange-50/60 font-semibold text-kraft-dark"
                    : "border-line bg-white hover:bg-paper/60"
                }`}
              >
                {CARTAS[c].etiqueta}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">2. Empleado que recibe</h2>
          <BuscadorEmpleado empleados={empleados} value={empleadoId} onChange={setEmpleadoId} />
          {empleado ? (
            <p className="mt-2 text-sm text-soft">
              {empleado.puesto} · {empleado.area || empleado.departamento}
              {empleado.supervisor ? ` · Jefe: ${empleado.supervisor}` : ""}
            </p>
          ) : null}

          <div className="mt-4 border-t border-line pt-3">
            <Label>Fecha de la carta</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputCls} max-w-[190px]`}
                type="date"
                max={topeAdelante}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
              {fecha !== hoyISO() ? (
                <button type="button" className={btnGhost} onClick={() => setFecha(hoyISO())}>
                  Usar la de hoy
                </button>
              ) : null}
              {/* Sugerencia: si el equipo se entregó al ingresar, la fecha de alta suele ser la correcta. */}
              {empleado?.fecha_alta && empleado.fecha_alta !== fecha ? (
                <button
                  type="button"
                  className={btnGhost}
                  title="Fecha de alta del empleado"
                  onClick={() => setFecha(empleado.fecha_alta as string)}
                >
                  Usar su fecha de alta ({fechaCorta(empleado.fecha_alta)})
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-soft">
              {fecha > hoyISO()
                ? "Con fecha adelantada: la carta queda preparada para ese día."
                : "Por defecto es la de hoy. Cámbiala si la entrega fue antes, o adelántala para dejarla lista."}
            </p>
          </div>
        </Card>

        {requiereEquipo ? (
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">3. Equipo a entregar</h2>
              <button type="button" className={btnGhost} onClick={abrirNuevoEquipo}>
                + Registrar equipo nuevo
              </button>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTipoFiltro("TODOS")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  tipoFiltro === "TODOS" ? "border-kraft bg-orange-50/60 text-kraft-dark" : "border-line bg-white hover:bg-paper/60"
                }`}
              >
                Todos los tipos
              </button>
              {TIPOS_EQUIPO.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoFiltro(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    tipoFiltro === t ? "border-kraft bg-orange-50/60 text-kraft-dark" : "border-line bg-white hover:bg-paper/60"
                  }`}
                >
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>
            <p className="mb-2 text-xs text-soft">El tipo de carta se ajusta solo al equipo que elijas.</p>

            <input
              className={`${inputCls} mb-3`}
              placeholder="Buscar por código, marca, modelo o serie…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            {equiposFiltrados.length === 0 ? (
              <Empty>
                No hay equipos disponibles con este filtro.{" "}
                <button type="button" className="font-semibold text-kraft-dark underline" onClick={abrirNuevoEquipo}>
                  Registra uno nuevo
                </button>{" "}
                en el inventario.
              </Empty>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {equiposFiltrados.map((e) => (
                  <div
                    key={e.id}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      equipoId === e.id ? "border-kraft bg-orange-50/60" : "border-line bg-white hover:bg-paper/60"
                    }`}
                  >
                    <label className="flex flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="radio"
                        name="equipo"
                        className="mt-0.5 accent-kraft"
                        checked={equipoId === e.id}
                        onChange={() => elegirEquipo(e)}
                      />
                      <span>
                        <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                        <span className="font-medium">
                          {e.marca} {e.modelo}
                        </span>
                        <span className="block text-xs text-soft">
                          {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                          {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                          {e.specs ? ` · ${e.specs}` : ""}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      title="Corregir los datos de este equipo antes de entregarlo"
                      onClick={() => editarEquipo(e)}
                      className="shrink-0 rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : esVale ? (
          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">3. Descuento</h2>
            <div className="space-y-4">
              <div>
                <Label>Concepto del descuento</Label>
                <input
                  className={inputCls}
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Ej. RADIO PORTÁTIL TXPRO"
                />
              </div>
              <div>
                <Label>Valor de reposición (MXN)</Label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="450"
                />
                {Number(monto) > 0 ? (
                  <p className="mt-1 text-xs text-soft">Se escribirá con importe en letra automáticamente.</p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <h2 className="mb-1 text-base font-bold text-ink">3. Sin equipo</h2>
            <p className="text-sm text-soft">
              Esta carta es para el <Badge tono="petrol">acceso a la red Wi-Fi</Badge>; no se asigna ningún equipo físico.
            </p>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        {mostrarVale ? (
          <Card>
            <h2 className="mb-1 text-base font-bold text-ink">Vale de descuento del radio</h2>
            <p className="mb-3 text-sm text-soft">
              El radio se entrega con dos papeles: esta carta y el vale por su valor de reposición, que firma Recursos
              Humanos. Sale con la misma fecha y queda ligado a la carta.
            </p>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-kraft"
                checked={conVale}
                onChange={(e) => setConVale(e.target.checked)}
              />
              <span className="text-sm text-ink">Generar también el vale de descuento</span>
            </label>
            {conVale ? (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
                <div>
                  <Label>Concepto del descuento</Label>
                  <select
                    className={inputCls}
                    value={valeConceptoId}
                    onChange={(e) => setValeConceptoId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">— Elige el concepto —</option>
                    {conceptos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.concepto} — {dinero(c.monto)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Valor de reposición</Label>
                  <p className="rounded-md border border-line bg-paper/60 px-3 py-2 text-sm text-ink">
                    {valeElegido ? (
                      valeElegido.texto || dinero(valeElegido.monto)
                    ) : (
                      <span className="text-soft">Sale del concepto que elijas</span>
                    )}
                  </p>
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">4. Observaciones (opcional)</h2>
          <div>
            <Label>Observaciones</Label>
            <textarea
              className={inputCls}
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Incluye cargador y funda."
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">5. Firma</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
            <li>Se genera la responsiva y se abre el PDF para imprimirla.</li>
            <li>El empleado y el {rol.toLowerCase()} la firman en papel.</li>
            <li>
              Se escanea o se toma foto y se sube con el botón <b>Subir firmada</b>, que aparece en la ficha del
              empleado y en el listado de responsivas.
            </li>
          </ol>
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Mientras no se suba el documento firmado, la responsiva queda marcada como <b>sin firmar</b>, para que no se
            pierda de vista.
          </p>
        </Card>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente}>
          {pendiente ? "Generando PDF…" : "Generar responsiva para firmar"}
        </button>
        <p className="text-center text-xs text-soft">
          El PDF se abre para imprimirlo y se guarda en el repositorio con el formato oficial de Sultana Packaging.
        </p>
      </div>

      {formEquipo ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-6 w-full max-w-2xl">
            <h2 className="mb-4 text-base font-bold text-ink">
              {formEquipo.id ? `Corregir ${formEquipo.codigo}` : "Registrar equipo nuevo"}
            </h2>
            {formEquipo.id ? (
              <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Estás corrigiendo un equipo que ya está en el inventario. Al guardar se actualizan sus datos y queda
                elegido para esta responsiva.
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tipo de equipo *</Label>
                <select className={inputCls} value={formEquipo.tipo} onChange={(e) => cambiarTipoNuevo(e.target.value as TipoEquipo)}>
                  {TIPOS_EQUIPO.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Código interno</Label>
                <input className={`${inputCls} mono`} value={formEquipo.codigo} onChange={setCE("codigo")} placeholder="Vacío = se genera solo" />
              </div>
              <div>
                <Label>Marca</Label>
                {formEquipo.tipo === "COMPUTO" ? (
                  <SelectConOtro
                    value={formEquipo.marca}
                    onChange={(v) => setFormEquipo((f) => (f ? { ...f, marca: v } : f))}
                    opciones={OPCIONES_MARCA_COMPUTO}
                    permitirOtro
                    placeholder="Escribe la marca"
                  />
                ) : (
                  <input className={inputCls} value={formEquipo.marca} onChange={setCE("marca")} placeholder="Dell, HP, TXPRO…" />
                )}
              </div>
              <div>
                <Label>Modelo</Label>
                <input className={inputCls} value={formEquipo.modelo} onChange={setCE("modelo")} />
              </div>
              <div>
                <Label>Número de serie</Label>
                <input className={`${inputCls} mono`} value={formEquipo.numero_serie} onChange={setCE("numero_serie")} />
              </div>

              {CAMPOS_DETALLE[formEquipo.tipo].map((c) => {
                const val = formEquipo.detalles[c.clave] ?? "";
                return (
                  <div key={c.clave}>
                    <Label>{c.etiqueta}</Label>
                    {c.opciones ? (
                      <SelectConOtro value={val} onChange={(v) => ponerDetalleNuevo(c.clave, v)} opciones={c.opciones} permitirOtro={c.permitirOtro} />
                    ) : (
                      <input className={inputCls} value={val} onChange={(e) => ponerDetalleNuevo(c.clave, e.target.value)} />
                    )}
                  </div>
                );
              })}

              <div>
                <Label>Fecha de compra</Label>
                <input className={inputCls} type="date" value={formEquipo.fecha_compra} onChange={setCE("fecha_compra")} />
              </div>
              <div>
                <Label>Costo (MXN)</Label>
                <input className={inputCls} type="number" step="0.01" value={formEquipo.costo} onChange={setCE("costo")} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notas</Label>
                <textarea className={inputCls} rows={2} value={formEquipo.notas} onChange={setCE("notas")} />
              </div>
            </div>

            {errorEquipo ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorEquipo}</div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={guardarNuevoEquipo} disabled={guardandoEquipo}>
                {guardandoEquipo ? "Guardando…" : formEquipo.id ? "Guardar cambios y seleccionar" : "Guardar y seleccionar"}
              </button>
              <button className={btnGhost} onClick={() => setFormEquipo(null)} disabled={guardandoEquipo}>
                Cancelar
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
