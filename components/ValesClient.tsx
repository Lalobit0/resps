"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archivarConceptoVale, crearVale, guardarConceptoVale } from "../app/responsivas/actions";
import type { Empleado } from "../lib/types";
import { CLAUSULAS_VALE, type ConceptoVale } from "../lib/vales-comun";
import { dinero, fechaCorta } from "../lib/helpers";
import BuscadorConcepto from "./BuscadorConcepto";
import BuscadorEmpleado from "./BuscadorEmpleado";
import VerPdfBtn from "./VerPdfBtn";
import SubirFirmadaBtn from "./SubirFirmadaBtn";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

export type ValeEnLista = {
  id: number;
  folio: string;
  fecha: string;
  concepto: string | null;
  monto: number | null;
  pdf_path: string | null;
  pdf_firmado: string | null;
  origen: string;
  empleado_id: number;
  numero_empleado: string;
  nombre: string;
  departamento: string;
  /** Folio de la entrega de la que salió, si vino de una. */
  origen_folio: string | null;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Vales de descuento: hacerlos, verlos y mantener el tarifario.
 *
 * El empleado sale de su número, y el concepto de un catálogo con precio: son
 * los dos datos que el formato de RH pide llenar. El día que lo recibió, la
 * semana y el año van en blanco en el papel, para que los escriba a mano.
 */
export default function ValesClient({
  vales,
  empleados,
  conceptos,
  busqueda,
  nuevo,
  empleadoPre,
  suma,
}: {
  vales: ValeEnLista[];
  empleados: Empleado[];
  conceptos: ConceptoVale[];
  busqueda: string;
  nuevo: string;
  empleadoPre: number | null;
  suma: number;
}) {
  const router = useRouter();
  const activos = conceptos.filter((c) => c.activo);
  const [abierto, setAbierto] = useState(empleadoPre !== null);
  const [empleadoId, setEmpleadoId] = useState<number | null>(empleadoPre);
  const empleado = empleados.find((e) => e.id === empleadoId) ?? null;
  const [conceptoId, setConceptoId] = useState<number | "">("");
  // Qué cláusula lleva el papel. La propone el concepto —una playera no se
  // recibe de vuelta, un radio sí— y se puede cambiar para este vale.
  const [clausula, setClausula] = useState<string>(CLAUSULAS_VALE[0].clave);
  const [fecha, setFecha] = useState(hoyISO());
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [verCatalogo, setVerCatalogo] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const elegido = activos.find((c) => c.id === conceptoId);

  const elegirConcepto = (id: number | "") => {
    setConceptoId(id);
    const c = activos.find((x) => x.id === id);
    if (c) setClausula(CLAUSULAS_VALE.find((k) => k.clave === c.clausula)?.clave ?? CLAUSULAS_VALE[0].clave);
  };
  // La vista previa arma el PDF de verdad, sin guardar nada: lo que se ve aquí
  // es lo que va a salir impreso.
  const listo = !!empleado && !!conceptoId;
  const urlPrevia = listo
    ? `/api/vale/preview?empleado=${empleado.id}&concepto=${conceptoId}&fecha=${fecha}&clausula=${clausula}#toolbar=0&navpanes=0&view=FitH`
    : "";

  const generar = () => {
    setError("");
    if (!empleado) return setError("Elige al empleado.");
    if (!conceptoId) return setError("Elige el concepto del descuento.");
    iniciar(async () => {
      const res = await crearVale({ empleadoId: empleado.id, conceptoId: Number(conceptoId), fecha, clausula });
      if (res.ok && res.id) {
        window.open(`/api/pdf/${res.id}`, "_blank");
        setAbierto(false);
        setConceptoId("");
        setMensaje(res.mensaje ?? "Vale generado.");
        router.refresh();
      } else setError(res.error ?? "No se pudo generar el vale.");
    });
  };

  return (
    <div className="space-y-4">
      {nuevo ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Se generó el vale <span className="mono font-semibold">{nuevo}</span>.
        </div>
      ) : null}
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✅ {mensaje}</div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Generar vale</h2>
            <p className="mt-0.5 text-sm text-soft">
              El nombre sale del número de empleado y el precio del concepto que elijas. El día, la semana y el año los
              llena el empleado a mano cuando firma.
            </p>
          </div>
          <button className={abierto ? btnGhost : btnPrimary} onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Cancelar" : "+ Generar vale"}
          </button>
        </div>

        {abierto ? (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Empleado</Label>
              <BuscadorEmpleado empleados={empleados} value={empleadoId} onChange={setEmpleadoId} />
              {empleado ? (
                <p className="mt-1 text-xs text-soft">
                  <span className="mono text-kraft-dark">{empleado.numero_empleado}</span> · {empleado.puesto} ·{" "}
                  {empleado.departamento}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Fecha del vale</Label>
              <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Concepto del descuento</Label>
              <BuscadorConcepto conceptos={activos} value={conceptoId} onChange={elegirConcepto} />
            </div>
            <div>
              <Label>Valor de reposición</Label>
              <p className="rounded-md border border-line bg-paper/60 px-3 py-2 text-sm text-ink">
                {elegido ? elegido.texto || dinero(elegido.monto) : <span className="text-soft">Sale del concepto</span>}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>Cláusula del vale</Label>
              <select className={inputCls} value={clausula} onChange={(e) => setClausula(e.target.value)}>
                {CLAUSULAS_VALE.map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.etiqueta} — {c.resumen}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-soft">
                La propone el concepto. Se cambia aquí solo para este vale; para dejarlo fijo, edítalo en el tarifario.
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Vista previa</Label>
              {listo ? (
                <>
                  <iframe
                    key={urlPrevia}
                    src={urlPrevia}
                    title="Vista previa del vale"
                    className="h-[560px] w-full rounded-md border border-line bg-white"
                  />
                  <p className="mt-1 text-xs text-soft">
                    Así va a salir impreso. Todavía no se guarda nada: el folio y el registro se crean al pulsar
                    “Generar vale”.{" "}
                    <a href={urlPrevia.split("#")[0]} target="_blank" className="underline hover:text-ink">
                      Abrir en otra pestaña
                    </a>
                  </p>
                </>
              ) : (
                <p className="rounded-md border border-dashed border-line bg-paper/60 px-4 py-10 text-center text-sm text-soft">
                  Elige al empleado y el concepto para ver cómo queda el vale.
                </p>
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              {error ? (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              ) : null}
              <button className={btnPrimary} onClick={generar} disabled={pendiente || !listo}>
                {pendiente ? "Generando…" : "Generar vale e imprimir"}
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={busqueda}
          placeholder="🔍 Folio, concepto o empleado…"
          className={`${inputCls} max-w-xs`}
        />
        <button className={btnGhost} type="submit">
          Buscar
        </button>
        <span className="ml-auto text-xs text-soft">
          Descontado en total: <b className="text-ink">{dinero(suma)}</b>
        </span>
        <button type="button" className={btnGhost} onClick={() => setVerCatalogo((v) => !v)}>
          {verCatalogo ? "Ocultar el tarifario" : `Tarifario (${activos.length})`}
        </button>
      </form>

      {verCatalogo ? <Catalogo conceptos={conceptos} /> : null}

      {vales.length === 0 ? (
        <Empty>Todavía no hay vales. Genera el primero con “Generar vale”.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="border-b border-line bg-paper/70">
              <tr>
                <th className={thCls}>Folio</th>
                <th className={thCls}>No.</th>
                <th className={thCls}>Empleado</th>
                <th className={thCls}>Concepto</th>
                <th className={thCls}>Valor</th>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Firma</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vales.map((v) => {
                const firmado = v.origen === "CARGADA" || !!v.pdf_firmado;
                return (
                  <tr key={v.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                    <td className={`${tdCls} mono text-xs font-semibold`}>
                      {v.folio}
                      {v.origen_folio ? (
                        <div className="mt-0.5 text-[11px] font-normal text-soft">de {v.origen_folio}</div>
                      ) : null}
                    </td>
                    <td className={`${tdCls} mono text-xs`}>{v.numero_empleado}</td>
                    <td className={`${tdCls} font-medium`}>
                      <Link href={`/empleados/${v.empleado_id}`} className="text-ink hover:text-kraft hover:underline">
                        {v.nombre}
                      </Link>
                      <div className="text-[11px] text-soft">{v.departamento}</div>
                    </td>
                    <td className={`${tdCls} text-xs`}>{v.concepto ?? "—"}</td>
                    <td className={`${tdCls} text-sm font-semibold`}>{dinero(v.monto)}</td>
                    <td className={tdCls}>{fechaCorta(v.fecha)}</td>
                    <td className={tdCls}>
                      {firmado ? <Badge tono="verde">Firmado</Badge> : <Badge tono="rojo">Sin firmar</Badge>}
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1.5">
                        {v.pdf_path || v.pdf_firmado ? (
                          <VerPdfBtn
                            id={v.id}
                            folio={v.folio}
                            className={btnGhost}
                            subtitulo={`${v.numero_empleado} ${v.nombre} · ${fechaCorta(v.fecha)}`}
                          />
                        ) : null}
                        {!firmado ? (
                          <>
                            <a href={`/api/pdf/${v.id}?original=1`} target="_blank" className={btnGhost}>
                              Imprimir
                            </a>
                            <SubirFirmadaBtn responsivaId={v.id} folio={v.folio} className={btnGhost} />
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/** El tarifario de RH: lo que se puede descontar y a qué precio. */
function Catalogo({ conceptos }: { conceptos: ConceptoVale[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{
    id?: number;
    concepto: string;
    monto: string;
    texto: string;
    clausula: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const guardar = () => {
    if (!form) return;
    setError("");
    iniciar(async () => {
      const res = await guardarConceptoVale(form);
      if (res.ok) {
        setForm(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo guardar.");
    });
  };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Tarifario de vales</h2>
          <p className="text-xs text-soft">
            El precio con letra es el que sale impreso en el vale, tal como lo escribe Recursos Humanos.
          </p>
        </div>
        <button
          className={btnGhost}
          onClick={() => setForm({ concepto: "", monto: "", texto: "", clausula: CLAUSULAS_VALE[0].clave })}
        >
          + Agregar concepto
        </button>
      </div>

      {form ? (
        <div className="grid gap-3 border-b border-line bg-paper/40 px-4 py-3 sm:grid-cols-3">
          <div>
            <Label>Concepto</Label>
            <input
              className={inputCls}
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value.toUpperCase() })}
              placeholder="REP. RADIO PORTATIL TXPRO"
            />
          </div>
          <div>
            <Label>Precio</Label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              min="0"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
            />
          </div>
          <div>
            <Label>Cómo se escribe en el vale</Label>
            <input
              className={inputCls}
              value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
              placeholder="Se arma solo si lo dejas vacío"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Cláusula que le toca</Label>
            <select
              className={inputCls}
              value={form.clausula}
              onChange={(e) => setForm({ ...form, clausula: e.target.value })}
            >
              {CLAUSULAS_VALE.map((k) => (
                <option key={k.clave} value={k.clave}>
                  {k.etiqueta} — {k.resumen}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-soft">
              Es la que se propone al generar el vale de este concepto; ahí se puede cambiar sin tocar el tarifario.
            </p>
          </div>
          <div className="sm:col-span-3">
            {error ? (
              <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}
            <div className="flex gap-2">
              <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar"}
              </button>
              <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <table className="w-full border-collapse">
        <thead className="border-b border-line bg-paper/70">
          <tr>
            <th className={thCls}>Concepto</th>
            <th className={thCls}>Precio</th>
            <th className={thCls}>Como se escribe</th>
            <th className={thCls}>Cláusula</th>
            <th className={thCls}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {conceptos.map((c) => (
            <tr key={c.id} className={`border-b border-line/60 last:border-0 ${c.activo ? "" : "opacity-50"}`}>
              <td className={`${tdCls} text-sm font-medium`}>
                {c.concepto}
                {c.activo ? null : <span className="ml-2 text-xs text-soft">(archivado)</span>}
              </td>
              <td className={`${tdCls} text-sm`}>{dinero(c.monto)}</td>
              <td className={`${tdCls} text-xs text-soft`}>{c.texto ?? "—"}</td>
              <td className={`${tdCls} text-xs`}>
                {c.clausula === "CONSUMIBLE" ? (
                  <Badge tono="ambar">Uniforme o consumible</Badge>
                ) : (
                  <span className="text-soft">Equipo que se devuelve</span>
                )}
              </td>
              <td className={tdCls}>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={btnGhost}
                    onClick={() =>
                      setForm({
                        id: c.id,
                        concepto: c.concepto,
                        monto: String(c.monto),
                        texto: c.texto ?? "",
                        clausula:
                          CLAUSULAS_VALE.find((k) => k.clave === c.clausula)?.clave ?? CLAUSULAS_VALE[0].clave,
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    className={btnGhost}
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => {
                        await archivarConceptoVale(c.id, !c.activo);
                        router.refresh();
                      })
                    }
                  >
                    {c.activo ? "Archivar" : "Reactivar"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
