"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { firmarAutoridad } from "../app/responsivas/actions";
import SignatureCanvas from "./SignatureCanvas";
import { Card, btnGhost, btnPrimary } from "./ui";

/**
 * Firma digital tardía: el jefe de sistemas (o RH en los vales) firma en
 * pantalla y el PDF se regenera con las dos firmas, conservando el folio.
 */
export default function FirmarAutoridadBtn({ id, folio, rol }: { id: number; folio: string; rol: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const cerrar = () => {
    setAbierto(false);
    setFirma(null);
    setError("");
  };

  const enviar = () => {
    setError("");
    if (!firma) return setError("Falta la firma en pantalla.");
    iniciar(async () => {
      const res = await firmarAutoridad(id, firma);
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

            <SignatureCanvas onChange={setFirma} />

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
