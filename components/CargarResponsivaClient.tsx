"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado, Equipo } from "../lib/types";
import { CLASES_CARTA, ETIQUETA_CLASE, ETIQUETA_TIPO, type ClaseCarta } from "../lib/constants";
import { cargarResponsivaFirmada } from "../app/responsivas/actions";
import { leerResponsiva } from "../lib/ocr";
import { Card, Empty, Label, btnGhost, btnPrimary, inputCls } from "./ui";

export default function CargarResponsivaClient({
  empleados,
  equipos,
}: {
  empleados: Empleado[];
  equipos: Equipo[];
}) {
  const router = useRouter();
  const [clase, setClase] = useState<ClaseCarta>("COMPUTO");
  const [empleadoId, setEmpleadoId] = useState("");
  const [seleccion, setSeleccion] = useState<number[]>([]);
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
  const fileRef = useRef<HTMLInputElement>(null);

  const soloNum = (s: string) => s.replace(/^0+/, "");

  const leerConOcr = async () => {
    const archivo = fileRef.current?.files?.[0];
    if (!archivo) {
      setError("Primero selecciona el archivo escaneado.");
      return;
    }
    setError("");
    setOcrInfo(null);
    setOcrCargando(true);
    setOcrMsg("Preparando…");
    try {
      const res = await leerResponsiva(archivo, setOcrMsg);
      let empMatch: Empleado | undefined;
      if (res.numeroEmpleado) {
        const objetivo = soloNum(res.numeroEmpleado);
        empMatch = empleados.find((e) => soloNum(e.numero_empleado) === objetivo);
        if (empMatch) setEmpleadoId(String(empMatch.id));
      }
      const nuevos: number[] = [];
      for (const s of res.series) {
        const eq = equipos.find((e) => (e.numero_serie ?? "").toUpperCase().trim() === s);
        if (eq && !nuevos.includes(eq.id)) nuevos.push(eq.id);
      }
      if (nuevos.length) setSeleccion((prev) => Array.from(new Set([...prev, ...nuevos])));

      const partes: string[] = [];
      partes.push(
        res.numeroEmpleado
          ? empMatch
            ? `Empleado ${res.numeroEmpleado} → ${empMatch.nombre} ✓`
            : `Leí el empleado ${res.numeroEmpleado}, pero no está en la lista`
          : "No detecté número de empleado"
      );
      partes.push(
        res.series.length
          ? `Series: ${res.series.join(", ")} (${nuevos.length} equipo(s) enlazado(s))`
          : "No detecté número de serie"
      );
      setOcrInfo(`${partes.join(" · ")} — revisa y corrige lo que haga falta.`);
    } catch {
      setOcrInfo(null);
      setError("No pude leer el documento automáticamente. Captura los datos a mano; todo lo demás funciona igual.");
    } finally {
      setOcrCargando(false);
      setOcrMsg("");
    }
  };

  const empleado = empleados.find((e) => String(e.id) === empleadoId);

  const equiposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return equipos;
    return equipos.filter((e) =>
      [e.codigo, ETIQUETA_TIPO[e.tipo] ?? e.tipo, e.marca, e.modelo, e.numero_serie ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [equipos, filtro]);

  const alternar = (id: number) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const enviar = () => {
    setError("");
    if (!empleado) return setError("Selecciona al empleado de la responsiva.");
    const archivo = fileRef.current?.files?.[0];
    if (!archivo) return setError("Sube el archivo escaneado (PDF o foto).");

    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("empleadoId", String(empleado.id));
    fd.append("clase", clase);
    fd.append("folio", folio);
    fd.append("fecha", fecha);
    fd.append("observaciones", observaciones);
    fd.append("equipoIds", JSON.stringify(seleccion));

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
    <div className="grid gap-5 lg:grid-cols-2">
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
              setOcrInfo(null);
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
                El sistema lee el escaneo y sugiere el empleado y el equipo por su número de serie. Tú confirmas. (La
                primera vez descarga el idioma; requiere internet.)
              </p>
              {ocrCargando ? <p className="mt-2 text-xs text-kraft-dark">{ocrMsg}</p> : null}
              {ocrInfo ? (
                <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{ocrInfo}</div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">2. Tipo y empleado</h2>
          <div className="space-y-3">
            <div>
              <Label>Tipo de carta</Label>
              <select className={inputCls} value={clase} onChange={(e) => setClase(e.target.value as ClaseCarta)}>
                {CLASES_CARTA.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CLASE[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Empleado</Label>
              <select className={inputCls} value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
                <option value="">— Selecciona un empleado —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numero_empleado} · {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-bold text-ink">3. Equipos de esta responsiva</h2>
          <p className="mb-3 text-xs text-soft">Palomea los equipos que ampara el documento. Quedarán asignados al empleado. (Wi-Fi o vale: puedes dejarlo vacío.)</p>
          <input
            className={`${inputCls} mb-3`}
            placeholder="Filtrar equipos disponibles…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          {equipos.length === 0 ? (
            <Empty>No hay equipos disponibles. Regístralos o impórtalos en el inventario.</Empty>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {equiposFiltrados.map((e) => (
                <label
                  key={e.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                    seleccion.includes(e.id) ? "border-kraft bg-sky-50" : "border-line bg-white hover:bg-paper/60"
                  }`}
                >
                  <input type="checkbox" className="mt-0.5 accent-kraft" checked={seleccion.includes(e.id)} onChange={() => alternar(e.id)} />
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
          <p className="mt-3 text-xs text-soft">{seleccion.length} equipo(s) seleccionado(s)</p>
        </Card>
      </div>

      <div className="space-y-5">
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
              <textarea
                className={inputCls}
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. Responsiva histórica cargada desde archivo físico."
              />
            </div>
          </div>
        </Card>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar responsiva cargada"}
        </button>
        <p className="text-center text-xs text-soft">
          El documento se guarda en el repositorio y los equipos quedan asignados al empleado. Se marca como “Cargada”.
        </p>
      </div>
    </div>
  );
}
