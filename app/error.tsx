"use client";

import { useEffect, useState } from "react";
import { esVersionVieja, recargarUnaVez } from "../lib/errores-comun";
import { Card, btnGhost, btnPrimary } from "../components/ui";

/**
 * Cuando truena una pantalla, pero el marco sigue en pie.
 *
 * A diferencia de `global-error`, aquí el menú sigue ahí: la persona puede
 * irse a otro lado sin recargar nada. Lo mismo de siempre con las versiones
 * viejas: si el error es que faltan archivos, se recarga sola.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recargando, setRecargando] = useState(false);

  useEffect(() => {
    if (esVersionVieja(error)) setRecargando(recargarUnaVez());
  }, [error]);

  if (recargando) {
    return (
      <Card className="mx-auto mt-10 max-w-xl">
        <h1 className="text-lg font-bold text-ink">Actualizando el sistema…</h1>
        <p className="mt-2 text-sm text-soft">
          Se publicó una versión nueva mientras tenías esto abierto. La pantalla se está recargando sola; no hace falta
          que hagas nada.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-10 max-w-xl">
      <h1 className="text-lg font-bold text-ink">Esta pantalla se atoró</h1>
      <p className="mt-2 text-sm text-soft">
        No se pudo cargar lo que venías a ver. Vuelve a intentarlo; si sigue igual, avísale a Sistemas con la clave de
        abajo y qué estabas haciendo.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={() => reset()}>
          Volver a intentar
        </button>
        <a href="/" className={btnGhost}>
          Ir al inicio
        </a>
      </div>
      {error.digest ? <p className="mono mt-4 text-xs text-soft">Clave del error: {error.digest}</p> : null}
    </Card>
  );
}
