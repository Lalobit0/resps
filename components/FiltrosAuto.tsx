"use client";

import { useEffect, useRef } from "react";

/**
 * Formulario de filtros que se aplica solo.
 *
 * Al cambiar un desplegable se envía enseguida; el texto espera a que se deje
 * de escribir para no recargar en cada tecla. El botón "Filtrar" deja de hacer
 * falta —se conserva escondido para quien navegue con teclado y pulse Enter.
 */
export default function FiltrosAuto({
  children,
  className,
  /** Espera tras la última tecla, en milisegundos. */
  retraso = 450,
}: {
  children: React.ReactNode;
  className?: string;
  retraso?: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (temporizador.current ? clearTimeout(temporizador.current) : undefined), []);

  const enviar = () => form.current?.requestSubmit();

  return (
    <form
      ref={form}
      method="get"
      className={className}
      onChange={(ev) => {
        const destino = ev.target as HTMLElement;
        // Los desplegables y las casillas se aplican en cuanto se tocan.
        if (destino.tagName === "SELECT" || (destino as HTMLInputElement).type === "checkbox") {
          if (temporizador.current) clearTimeout(temporizador.current);
          enviar();
          return;
        }
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(enviar, retraso);
      }}
    >
      {children}
    </form>
  );
}
