"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerarResponsiva } from "../app/responsivas/actions";
import { btnGhost } from "./ui";

/**
 * Rehace el PDF de la carta con lo que hoy dice el sistema: sirve tras cambiar
 * la plantilla, corregir los datos del equipo o cambiar el tipo de carta.
 */
export default function RegenerarResponsivaBtn({
  id,
  folio,
  origen,
  firmada = false,
  className,
}: {
  id: number;
  folio: string;
  origen: string | null;
  /** Ya se subió el papel firmado: rehacer el original no lo cambia. */
  firmada?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  // Una carta cargada es el escaneo mismo: no hay nada que rehacer.
  if (origen === "CARGADA") return null;

  const regenerar = () => {
    if (
      !confirm(
        `Se va a rehacer el documento de ${folio} con los datos que hay ahora (plantilla, empleado y equipo).\n\n` +
          `Conserva su folio y su fecha.\n\n` +
          (firmada
            ? `OJO: esta carta ya tiene su escaneo firmado. Ese papel NO se toca y sigue siendo el documento válido, ` +
              `así que el original rehecho puede acabar diciendo algo distinto de lo que se firmó.\n\n`
            : `Tendrás que volver a imprimirla para recoger la firma.\n\n`) +
          `¿Continuar?`
      )
    )
      return;
    setError("");
    iniciar(async () => {
      const res = await regenerarResponsiva(id);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo rehacer.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        disabled={pendiente}
        onClick={regenerar}
        title="Rehace el PDF con la plantilla y los datos de hoy, conservando folio y fecha"
      >
        {pendiente ? "Rehaciendo…" : "↻ Regenerar"}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </>
  );
}
