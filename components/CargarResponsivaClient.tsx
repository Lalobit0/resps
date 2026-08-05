"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado, Equipo } from "../lib/types";
import { CAMPOS_DETALLE, CLASES_CARTA, ETIQUETA_CLASE, ETIQUETA_TIPO, OPCIONES_MARCA_COMPUTO, PRECIO_POR_PLAN, TIPOS_EQUIPO, type ClaseCarta, type TipoEquipo } from "../lib/constants";
import { cargarResponsivaFirmada } from "../app/responsivas/actions";
import { leerResponsiva, type LecturaSeleccionable } from "../lib/ocr";
import BuscadorEmpleado from "./BuscadorEmpleado";
import VisorTextoSeleccionable from "./VisorTextoSeleccionable";
import SelectConOtro from "./SelectConOtro";
import { Card, Empty, Label, btnGhost, btnPrimary, inputCls } from "./ui";

type NuevoEq = { tipo: TipoEquipo; marca: string; modelo: string; numero_serie: string; detalles: Record<string, string> };

function claseATipo(clase: string | null): TipoEquipo {
  if (clase === "CELULAR") return "CELULAR";
  if (clase === "OTROS") return "OTRO";
  return "COMPUTO";
}

/** Clase de carta que le toca a un equipo por su tipo. */
function tipoAClase(tipo: string | undefined): ClaseCarta {
  if (tipo === "CELULAR") return "CELULAR";
  if (tipo === "COMPUTO") return "COMPUTO";
  return "OTROS";
}

export default function CargarResponsivaClient({
  empleados,
  equipos,
  empleadoInicial = null,
  equipoInicial = null,
}: {
  empleados: Empleado[];
  equipos: Equipo[];
  empleadoInicial?: number | null;
  equipoInicial?: number | null;
}) {
  const router = useRouter();
  // Si se llega desde la ficha del empleado, el empleado y el equipo ya vienen elegidos.
  const equipoPrevio = equipoInicial ? equipos.find((e) => e.id === equipoInicial) : undefined;
  const [clase, setClase] = useState<ClaseCarta>(equipoPrevio ? tipoAClase(equipoPrevio.tipo) : "COMPUTO");
  const [empleadoId, setEmpleadoId] = useState<number | null>(empleadoInicial);
  const [modoEquipo, setModoEquipo] = useState<"nuevo" | "existente">(equipoPrevio ? "existente" : "nuevo");
  const [nuevoEq, setNuevoEq] = useState<NuevoEq>({ tipo: "COMPUTO", marca: "", modelo: "", numero_serie: "", detalles: {} });
  const [seleccion, setSeleccion] = useState<number[]>(equipoPrevio ? [equipoPrevio.id] : []);
  const [filtro, setFiltro] = useState("");
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [ocrCargando, setOcrCargando] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");
  const [ocrInfo, setOcrInfo] = useState<string | null>(null);
  const [ocrTexto, setOcrTexto] = useState("");
  const [archivoPreview, setArchivoPreview] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [lecturaSel, setLecturaSel] = useState<LecturaSeleccionable | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sinEquipo = clase === "WIFI" || clase === "VALE";
  const esPdfPreview = /\.pdf$/i.test(nombreArchivo);
  const soloNum = (s: string) => s.replace(/^0+/, "");

  // Vista previa del archivo subido (se libera al cambiarlo).
  useEffect(() => {
    if (!archivoPreview) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(archivoPreview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [archivoPreview]);

  const equiposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return equipos;
    return equipos.filter((e) =>
      [e.codigo, ETIQUETA_TIPO[e.tipo] ?? e.tipo, e.marca, e.modelo, e.numero_serie ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [equipos, filtro]);

  const setDet = (clave: string, valor: string) =>
    setNuevoEq((p) => {
      const detalles = { ...p.detalles, [clave]: valor };
      // Al elegir el plan se autollena su precio del tarifario.
      if (clave === "plan" && PRECIO_POR_PLAN[valor]) detalles.plan_precio = PRECIO_POR_PLAN[valor];
      return { ...p, detalles };
    });

  const cambiarClase = (c: ClaseCarta) => {
    setClase(c);
    setNuevoEq((p) => ({ ...p, tipo: claseATipo(c) }));
  };

  const leerConOcr = async () => {
    const archivo = fileRef.current?.files?.[0];
    if (!archivo) {
      setError("Primero selecciona el archivo escaneado.");
      return;
    }
    setError("");
    setOcrInfo(null);
    setOcrTexto("");
    setOcrCargando(true);
    setOcrMsg("Preparando…");
    try {
      const res = await leerResponsiva(archivo, setOcrMsg);
      setOcrTexto(res.texto);
      setLecturaSel(res.seleccion);

      if (res.clase && (CLASES_CARTA as readonly string[]).includes(res.clase)) {
        setClase(res.clase as ClaseCarta);
      }
      const tipo = claseATipo(res.clase);

      let empMatch: Empleado | undefined;
      if (res.numeroEmpleado) {
        const objetivo = soloNum(res.numeroEmpleado);
        // El borde de la tabla a veces se lee como un "1" pegado al número
        // (|2422 → 12422): si no hay match exacto, prueba sin el primer dígito.
        const candidatos = [objetivo];
        if (objetivo.length >= 5) candidatos.push(soloNum(objetivo.slice(1)));
        empMatch = empleados.find((e) => candidatos.includes(soloNum(e.numero_empleado)));
        if (empMatch) setEmpleadoId(empMatch.id);
      }

      const eq = res.equipo;
      setModoEquipo("nuevo");
      setNuevoEq((p) => ({
        tipo,
        marca: eq.marca ?? p.marca,
        modelo: eq.modelo ?? p.modelo,
        numero_serie: eq.serie ?? p.numero_serie,
        detalles: { ...p.detalles, ...eq },
      }));

      const partes: string[] = [];
      partes.push(res.clase ? `Tipo: ${ETIQUETA_CLASE[res.clase] ?? res.clase}` : "No detecté el tipo");
      partes.push(
        res.numeroEmpleado
          ? empMatch
            ? `Empleado ${res.numeroEmpleado} → ${empMatch.nombre} ✓`
            : `Leí el empleado ${res.numeroEmpleado} (revísalo)`
          : "No detecté empleado"
      );
      const campos = Object.keys(eq).length;
      partes.push(campos ? `${campos} dato(s) del equipo` : "No detecté datos del equipo");
      setOcrInfo(`${partes.join(" · ")} — compara con el documento y corrige lo que haga falta.`);
    } catch {
      setOcrInfo(null);
      setError("No pude leer el documento automáticamente. Captura los datos a mano; todo lo demás funciona igual.");
    } finally {
      setOcrCargando(false);
      setOcrMsg("");
    }
  };

  const enviar = () => {
    setError("");
    if (!empleadoId) return setError("Selecciona al empleado de la responsiva.");
    const archivo = fileRef.current?.files?.[0];
    if (!archivo) return setError("Sube el archivo escaneado (PDF o foto).");

    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("empleadoId", String(empleadoId));
    fd.append("clase", clase);
    fd.append("folio", folio);
    fd.append("fecha", fecha);
    fd.append("observaciones", observaciones);
    if (sinEquipo) {
      fd.append("modo", "existente");
      fd.append("equipoIds", "[]");
    } else if (modoEquipo === "nuevo") {
      fd.append("modo", "nuevo");
      fd.append("nuevoEquipo", JSON.stringify(nuevoEq));
    } else {
      fd.append("modo", "existente");
      fd.append("equipoIds", JSON.stringify(seleccion));
    }

    iniciar(async () => {
      const res = await cargarResponsivaFirmada(fd);
      if (res.ok && res.id) {
        window.open(`/api/pdf/${res.id}`, "_blank");
        router.push(`/responsivas?nueva=${res.folio}`);
        router.refresh();
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">1. Archivo firmado</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            setNombreArchivo(e.target.files?.[0]?.name ?? "");
            setArchivoPreview(e.target.files?.[0] ?? null);
            setOcrInfo(null);
            setOcrTexto("");
            setLecturaSel(null);
          }}
        />
        <button className={`${inputCls} text-left`} onClick={() => fileRef.current?.click()} type="button">
          {nombreArchivo || "Selecciona el PDF o foto de la responsiva firmada…"}
        </button>
        <p className="mt-2 text-xs text-soft">Acepta PDF, JPG o PNG. Es el documento ya firmado en papel, escaneado o fotografiado.</p>

        {nombreArchivo ? (
          <div className="mt-3 border-t border-line pt-3">
            <button className={btnGhost} type="button" onClick={leerConOcr} disabled={ocrCargando || pendiente}>
              {ocrCargando ? "Leyendo…" : "🔍 Leer datos del documento (OCR)"}
            </button>
            <p className="mt-2 text-xs text-soft">
              Lee el escaneo y llena el tipo, el empleado y los datos del equipo. Si es un PDF escaneado (imagen),
              además podrás <b>seleccionar y copiar el texto sobre la imagen</b> de la izquierda para pegarlo en los
              campos. Corrige lo que falle. (La primera vez descarga el idioma; requiere internet.)
            </p>
            {ocrCargando ? <p className="mt-2 text-xs text-kraft-dark">{ocrMsg}</p> : null}
            {ocrInfo ? (
              <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{ocrInfo}</div>
            ) : null}
            {ocrTexto ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-soft">Ver texto leído por el OCR</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper/60 p-2 text-[11px] text-ink">
                  {ocrTexto}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Izquierda: el documento subido, fijo mientras corriges */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Documento subido</h2>
              {previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-kraft-dark underline">
                  Abrir en pestaña ↗
                </a>
              ) : null}
            </div>
            {lecturaSel ? (
              <VisorTextoSeleccionable data={lecturaSel} />
            ) : previewUrl ? (
              esPdfPreview ? (
                <iframe
                  title="Responsiva subida"
                  src={previewUrl}
                  className="h-[78vh] w-full rounded-md border border-line bg-white"
                />
              ) : (
                <div className="max-h-[78vh] overflow-auto rounded-md border border-line bg-paper/40 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Responsiva subida" className="mx-auto max-w-full" />
                </div>
              )
            ) : (
              <Empty>Sube el archivo y aquí lo verás para comparar con los datos leídos por el OCR.</Empty>
            )}
          </Card>
        </div>

        {/* Derecha: campos editables */}
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">2. Tipo y empleado</h2>
            <div className="space-y-3">
              <div>
                <Label>Tipo de carta</Label>
                <select className={inputCls} value={clase} onChange={(e) => cambiarClase(e.target.value as ClaseCarta)}>
                  {CLASES_CARTA.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CLASE[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Empleado</Label>
                <BuscadorEmpleado empleados={empleados} value={empleadoId} onChange={setEmpleadoId} />
              </div>
            </div>
          </Card>

          {sinEquipo ? (
            <Card>
              <h2 className="mb-1 text-base font-bold text-ink">3. Sin equipo</h2>
              <p className="text-sm text-soft">Esta carta (Wi-Fi / vale) no lleva equipo físico asignado.</p>
            </Card>
          ) : (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">3. Equipo</h2>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setModoEquipo("nuevo")}
                    className={`rounded-md border px-2 py-1 ${modoEquipo === "nuevo" ? "border-kraft bg-orange-50 font-semibold text-kraft-dark" : "border-line bg-white"}`}
                  >
                    Crear nuevo
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoEquipo("existente")}
                    className={`rounded-md border px-2 py-1 ${modoEquipo === "existente" ? "border-kraft bg-orange-50 font-semibold text-kraft-dark" : "border-line bg-white"}`}
                  >
                    Ya en inventario
                  </button>
                </div>
              </div>

              {modoEquipo === "nuevo" ? (
                <div className="space-y-3">
                  <p className="text-xs text-soft">Se crea en el inventario y queda asignado al empleado. Los datos vienen del OCR; corrígelos si hace falta.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Tipo de equipo</Label>
                      <select className={inputCls} value={nuevoEq.tipo} onChange={(e) => setNuevoEq((p) => ({ ...p, tipo: e.target.value as TipoEquipo }))}>
                        {TIPOS_EQUIPO.map((t) => (
                          <option key={t} value={t}>
                            {ETIQUETA_TIPO[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Serie</Label>
                      <input className={`${inputCls} mono`} value={nuevoEq.numero_serie} onChange={(e) => setNuevoEq((p) => ({ ...p, numero_serie: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Marca</Label>
                      {nuevoEq.tipo === "COMPUTO" ? (
                        <SelectConOtro
                          value={nuevoEq.marca}
                          onChange={(v) => setNuevoEq((p) => ({ ...p, marca: v }))}
                          opciones={OPCIONES_MARCA_COMPUTO}
                          permitirOtro
                          placeholder="Escribe la marca"
                        />
                      ) : (
                        <input className={inputCls} value={nuevoEq.marca} onChange={(e) => setNuevoEq((p) => ({ ...p, marca: e.target.value }))} />
                      )}
                    </div>
                    <div>
                      <Label>Modelo</Label>
                      <input className={inputCls} value={nuevoEq.modelo} onChange={(e) => setNuevoEq((p) => ({ ...p, modelo: e.target.value }))} />
                    </div>
                    {CAMPOS_DETALLE[nuevoEq.tipo].map((c) => {
                      const val = nuevoEq.detalles[c.clave] ?? "";
                      return (
                        <div key={c.clave}>
                          <Label>{c.etiqueta}</Label>
                          {c.opciones ? (
                            <SelectConOtro value={val} onChange={(v) => setDet(c.clave, v)} opciones={c.opciones} permitirOtro={c.permitirOtro} />
                          ) : (
                            <input className={inputCls} value={val} onChange={(e) => setDet(c.clave, e.target.value)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    className={`${inputCls} mb-3`}
                    placeholder="Filtrar equipos disponibles…"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                  />
                  {equipos.length === 0 ? (
                    <Empty>No hay equipos disponibles en el inventario. Usa “Crear nuevo”.</Empty>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {equiposFiltrados.map((e) => (
                        <label
                          key={e.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                            seleccion.includes(e.id) ? "border-kraft bg-orange-50/60" : "border-line bg-white hover:bg-paper/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-kraft"
                            checked={seleccion.includes(e.id)}
                            onChange={() => setSeleccion((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]))}
                          />
                          <span>
                            <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                            <span className="font-medium">
                              {e.marca} {e.modelo}
                            </span>
                            <span className="block text-xs text-soft">
                              {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                              {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">4. Datos del documento (opcional)</h2>
            <div className="space-y-4">
              <div>
                <Label>Folio (si el documento ya tiene uno)</Label>
                <input className={inputCls} value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Vacío = se genera solo (RESP-2026-…)" />
              </div>
              <div>
                <Label>Fecha del documento</Label>
                <input className={inputCls} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <Label>Observaciones</Label>
                <textarea className={inputCls} rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej. Responsiva histórica cargada desde archivo físico." />
              </div>
            </div>
          </Card>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : null}

          <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente || ocrCargando}>
            {pendiente ? "Guardando…" : "Guardar responsiva cargada"}
          </button>
          <p className="text-center text-xs text-soft">
            Se guarda el documento firmado y el equipo queda asignado al empleado. Se marca como “Cargada”.
          </p>
        </div>
      </div>
    </div>
  );
}
