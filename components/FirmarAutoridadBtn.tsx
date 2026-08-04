"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FirmaGuardada } from "../lib/types";
import { firmarAutoridad } from "../app/responsivas/actions";
import SelectorFirmaAutoridad, { type FirmaElegida } from "./SelectorFirmaAutoridad";
import { Card, btnGhost, btnPrimary } from "./ui";

/**
 * Firma digital tardía: el jefe de sistemas (o RH en los vales) firma en
 * pantalla, usa su firma guardada o se carga la de quien firma por ausencia.
 * El PDF se regenera con las dos firmas, conservando el folio.
 */
export default function FirmarAutoridadBtn({
  id,
  folio,
  clase,
  rol,
  firmas,
}: {
  id: number;
  folio: string;
  clase: string;
  rol: string;
  firmas: FirmaGuardada[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [firma, setFirma] = useState<FirmaElegida | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const cerrar = () => {
    setAbierto(false);
    setFirma(null);
    setError("");
  };

  const enviar = () => {
    setError("");
    if (!firma) return setError("Falta la firma: dibújala, elige una guardada o carga un archivo.");
    if (firma.ausencia && !firma.nombre.trim()) {
      return setError("Escribe el nombre de quien firma por ausencia.");
    }
    iniciar(async () => {
      const res = await firmarAutoridad(id, firma.imagen, {
        nombre: firma.nombre,
        puesto: firma.puesto,
        ausencia: firma.ausencia,
      });
      if (res.ok) {
        cerrar();
        router.refresh();
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  return (
    <>
      <button type="button" className={btnGhost} onClick={() => setAbierto(true)}>
        ✍️ Firmar
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-10 w-full max-w-lg">
            <h2 className="text-base font-bold text-ink">Firmar como {rol}</h2>
            <p className="mb-4 mt-1 text-xs text-soft">
              Responsiva <span className="mono font-semibold">{folio}</span>. Al guardar se regenera el PDF con la firma
              del empleado y la tuya.
            </p>

            <SelectorFirmaAutoridad clase={clase} firmas={firmas} onChange={setFirma} />

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
                {pendiente ? "Firmando…" : "Firmar y regenerar PDF"}
              </button>
              <button className={btnGhost} onClick={cerrar} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
