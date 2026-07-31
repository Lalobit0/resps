"use client";

import { useRef, useState } from "react";
import type { FirmaGuardada } from "../lib/types";
import { ETIQUETA_ROL_FIRMA, esPorAusencia, rolAutoridad, type RolFirma } from "../lib/constants";
import { archivoAFirmaPng } from "../lib/imagen";
import SignatureCanvas from "./SignatureCanvas";
import { Label, btnGhost, inputCls } from "./ui";

/** Firma elegida: la imagen y quién la firmó (para la leyenda del documento). */
export type FirmaElegida = {
  imagen: string;
  nombre: string;
  puesto: string;
  ausencia: boolean;
};

type Modo = "guardada" | "dibujar" | "archivo";

export default function SelectorFirmaAutoridad({
  clase,
  firmas,
  onChange,
}: {
  clase: string;
  firmas: FirmaGuardada[];
  onChange: (firma: FirmaElegida | null) => void;
}) {
  const hayGuardadas = firmas.length > 0;
  const [modo, setModo] = useState<Modo>(hayGuardadas ? "guardada" : "dibujar");
  const [firmaId, setFirmaId] = useState<number | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [recortar, setRecortar] = useState(true);
  const [errorArchivo, setErrorArchivo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const titular = rolAutoridad(clase);
  const seleccionada = firmas.find((f) => f.id === firmaId) ?? null;

  const avisar = (f: FirmaElegida | null) => onChange(f);

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setErrorArchivo("");
    // Cada modo aporta su propia firma: se limpia lo anterior.
    if (m !== "guardada") setFirmaId(null);
    if (m !== "archivo") {
      setArchivo(null);
      setNombre("");
      setPuesto("");
    }
    avisar(null);
  };

  const elegirGuardada = (id: number) => {
    setFirmaId(id);
    const f = firmas.find((x) => x.id === id);
    if (!f) return avisar(null);
    avisar({
      imagen: f.imagen,
      nombre: f.nombre,
      puesto: f.puesto,
      ausencia: esPorAusencia(clase, f.rol),
    });
  };

  const dibujada = (dataUrl: string | null) =>
    avisar(dataUrl ? { imagen: dataUrl, nombre: "", puesto: "", ausencia: false } : null);

  const cargarArchivo = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setErrorArchivo("");
    try {
      const dataUrl = await archivoAFirmaPng(file, recortar);
      setArchivo(dataUrl);
      // Una firma cargada de otra persona siempre va como "por ausencia".
      avisar({ imagen: dataUrl, nombre: nombre.trim(), puesto: puesto.trim(), ausencia: true });
    } catch {
      setErrorArchivo("No se pudo leer la imagen. Usa un PNG o JPG de la firma.");
    }
  };

  const actualizarDatos = (nuevoNombre: string, nuevoPuesto: string) => {
    setNombre(nuevoNombre);
    setPuesto(nuevoPuesto);
    if (archivo) avisar({ imagen: archivo, nombre: nuevoNombre.trim(), puesto: nuevoPuesto.trim(), ausencia: true });
  };

  const tab = (m: Modo, texto: string) => (
    <button
      type="button"
      onClick={() => cambiarModo(m)}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        modo === m ? "border-kraft bg-orange-50 text-kraft-dark" : "border-line bg-white hover:bg-paper/60"
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tab("guardada", "Usar firma guardada")}
        {tab("dibujar", "Firmar en pantalla")}
        {tab("archivo", "Cargar firma")}
      </div>

      {modo === "guardada" ? (
        hayGuardadas ? (
          <div className="space-y-2">
            <select className={inputCls} value={firmaId ?? ""} onChange={(e) => elegirGuardada(Number(e.target.value))}>
              <option value="">— Selecciona la firma —</option>
              {firmas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                  {f.puesto ? ` · ${f.puesto}` : ""} ({ETIQUETA_ROL_FIRMA[f.rol as RolFirma] ?? f.rol})
                </option>
              ))}
            </select>
            {seleccionada ? (
              <div className="rounded-md border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seleccionada.imagen} alt={`Firma de ${seleccionada.nombre}`} className="mx-auto h-20 object-contain" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-line bg-paper/60 px-3 py-4 text-center text-xs text-soft">
            Todavía no hay firmas guardadas. Regístralas en <b>Firmas</b> para reutilizarlas, o firma en pantalla.
          </p>
        )
      ) : null}

      {modo === "dibujar" ? <SignatureCanvas onChange={dibujada} /> : null}

      {modo === "archivo" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nombre de quien firma</Label>
              <input
                className={inputCls}
                value={nombre}
                onChange={(e) => actualizarDatos(e.target.value, puesto)}
                placeholder="Ej. Juan Pérez"
              />
            </div>
            <div>
              <Label>Puesto</Label>
              <input
                className={inputCls}
                value={puesto}
                onChange={(e) => actualizarDatos(nombre, e.target.value)}
                placeholder="Ej. Gerente de planta"
              />
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-soft">
            <input type="checkbox" className="accent-kraft" checked={recortar} onChange={(e) => setRecortar(e.target.checked)} />
            Quitar el fondo blanco (firmas escaneadas)
          </label>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={cargarArchivo} />
          <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
            ↥ Seleccionar imagen de la firma
          </button>

          {archivo ? (
            <div className="rounded-md border border-line bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={archivo} alt="Firma cargada" className="mx-auto h-20 object-contain" />
            </div>
          ) : null}
          {errorArchivo ? <p className="text-xs text-red-700">{errorArchivo}</p> : null}
        </div>
      ) : null}

      {/* Aviso de firma por ausencia del titular */}
      {modo === "guardada" && seleccionada && esPorAusencia(clase, seleccionada.rol) ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Firma <b>por ausencia</b> del {titular.toLowerCase()}: el documento lo indicará con el nombre de{" "}
          {seleccionada.nombre}.
        </p>
      ) : null}
      {modo === "archivo" && archivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Se registrará como firma <b>por ausencia</b> del {titular.toLowerCase()}
          {nombre.trim() ? `, firmada por ${nombre.trim()}` : ""}.
        </p>
      ) : null}
    </div>
  );
}
