"use client";

import { useRef, useState, useTransition } from "react";
import type { FirmaGuardada } from "../lib/types";
import { ETIQUETA_ROL_FIRMA, ROLES_FIRMA, type RolFirma } from "../lib/constants";
import { archivoAFirmaPng } from "../lib/imagen";
import { eliminarFirma, guardarFirma } from "../app/firmas/actions";
import SignatureCanvas from "./SignatureCanvas";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls } from "./ui";

type Formulario = {
  id?: number;
  nombre: string;
  puesto: string;
  rol: RolFirma;
  imagen: string; // vacío al editar = conserva la imagen actual
};

const FORM_VACIO: Formulario = { nombre: "", puesto: "", rol: "SISTEMAS", imagen: "" };

const TONO_ROL: Record<string, "petrol" | "verde" | "gris"> = {
  SISTEMAS: "petrol",
  RH: "verde",
  OTRO: "gris",
};

export default function FirmasClient({ firmas }: { firmas: FirmaGuardada[] }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [modo, setModo] = useState<"dibujar" | "archivo">("archivo");
  const [recortar, setRecortar] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const abrir = (f?: FirmaGuardada) => {
    setForm(
      f
        ? { id: f.id, nombre: f.nombre, puesto: f.puesto, rol: (f.rol as RolFirma) ?? "OTRO", imagen: "" }
        : { ...FORM_VACIO }
    );
    setModo("archivo");
    setError("");
    setMensaje("");
  };

  const cargarArchivo = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setError("");
    try {
      const dataUrl = await archivoAFirmaPng(file, recortar);
      setForm((f) => (f ? { ...f, imagen: dataUrl } : f));
    } catch {
      setError("No se pudo leer la imagen. Usa un PNG o JPG de la firma.");
    }
  };

  const enviar = () => {
    if (!form) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await guardarFirma(form);
      if (res.ok) {
        setForm(null);
        setMensaje("Firma guardada.");
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  const borrar = (f: FirmaGuardada) => {
    if (!confirm(`¿Eliminar la firma de ${f.nombre}? Las responsivas ya firmadas no se modifican.`)) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await eliminarFirma(f.id);
      if (!res.ok) setError(res.error ?? "Error desconocido.");
    });
  };

  return (
    <div className="space-y-5">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} onClick={() => abrir()}>
          + Registrar firma
        </button>
        <p className="text-xs text-soft">
          Guarda aquí la firma del jefe de sistemas y la de Recursos Humanos para reutilizarlas al generar responsivas.
          Quien no sea el titular firmará <b>por ausencia</b>.
        </p>
      </div>

      {firmas.length === 0 ? (
        <Empty>Todavía no hay firmas guardadas. Registra la del jefe de sistemas y la de Recursos Humanos.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {firmas.map((f) => (
            <Card key={f.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{f.nombre}</p>
                  {f.puesto ? <p className="text-xs text-soft">{f.puesto}</p> : null}
                </div>
                <Badge tono={TONO_ROL[f.rol] ?? "gris"}>{ETIQUETA_ROL_FIRMA[f.rol as RolFirma] ?? f.rol}</Badge>
              </div>
              <div className="rounded-md border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.imagen} alt={`Firma de ${f.nombre}`} className="mx-auto h-20 object-contain" />
              </div>
              <div className="mt-3 flex gap-2">
                <button className={btnGhost} onClick={() => abrir(f)} disabled={pendiente}>
                  Editar
                </button>
                <button className={btnDanger} onClick={() => borrar(f)} disabled={pendiente}>
                  Eliminar
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-6 w-full max-w-xl">
            <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar firma" : "Registrar firma"}</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombre *</Label>
                <input
                  className={inputCls}
                  value={form.nombre}
                  onChange={(e) => setForm((f) => (f ? { ...f, nombre: e.target.value } : f))}
                  placeholder="Ej. Luis Ramírez"
                />
              </div>
              <div>
                <Label>Puesto</Label>
                <input
                  className={inputCls}
                  value={form.puesto}
                  onChange={(e) => setForm((f) => (f ? { ...f, puesto: e.target.value } : f))}
                  placeholder="Ej. Coordinador de sistemas"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Firma como *</Label>
                <select
                  className={inputCls}
                  value={form.rol}
                  onChange={(e) => setForm((f) => (f ? { ...f, rol: e.target.value as RolFirma } : f))}
                >
                  {ROLES_FIRMA.map((r) => (
                    <option key={r} value={r}>
                      {ETIQUETA_ROL_FIRMA[r]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-soft">
                  El titular firma normal; cualquier otro rol se registra con la leyenda “por ausencia”.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Label>Imagen de la firma {form.id ? "(opcional: solo si quieres reemplazarla)" : "*"}</Label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setModo("archivo")}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    modo === "archivo" ? "border-kraft bg-orange-50 text-kraft-dark" : "border-line bg-white"
                  }`}
                >
                  Cargar imagen
                </button>
                <button
                  type="button"
                  onClick={() => setModo("dibujar")}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    modo === "dibujar" ? "border-kraft bg-orange-50 text-kraft-dark" : "border-line bg-white"
                  }`}
                >
                  Dibujar en pantalla
                </button>
              </div>

              {modo === "archivo" ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs text-soft">
                    <input
                      type="checkbox"
                      className="accent-kraft"
                      checked={recortar}
                      onChange={(e) => setRecortar(e.target.checked)}
                    />
                    Quitar el fondo blanco (firmas escaneadas)
                  </label>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={cargarArchivo} />
                  <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
                    ↥ Seleccionar imagen
                  </button>
                </div>
              ) : (
                <SignatureCanvas onChange={(d) => setForm((f) => (f ? { ...f, imagen: d ?? "" } : f))} />
              )}

              {form.imagen ? (
                <div className="mt-2 rounded-md border border-line bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imagen} alt="Vista previa de la firma" className="mx-auto h-24 object-contain" />
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar firma"}
              </button>
              <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
