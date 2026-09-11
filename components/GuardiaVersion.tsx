"use client";

import { useEffect } from "react";
import { esVersionVieja, recargarUnaVez } from "../lib/errores-comun";

/**
 * Vigila que la pestaña no se quede con una versión vieja del sistema.
 *
 * Las pantallas de error atrapan lo que truena al pintar, pero el caso más
 * común pasa antes: alguien tiene el sistema abierto, se publica una versión
 * nueva, y al dar clic en el menú el navegador pide un archivo que ya no
 * existe. Ese fallo llega como una promesa rechazada, no como un error de
 * render, y sin esto se queda en una pantalla en blanco o en nada.
 *
 * Se recarga una sola vez —de eso se encarga `recargarUnaVez`— para no entrar
 * en un ciclo si el problema fuera otro.
 */
export default function GuardiaVersion() {
  useEffect(() => {
    const alFallar = (ev: PromiseRejectionEvent) => {
      const razon = ev.reason as { name?: string; message?: string } | undefined;
      if (esVersionVieja(razon)) recargarUnaVez();
    };
    const alReventar = (ev: ErrorEvent) => {
      if (esVersionVieja(ev.error ?? { message: ev.message })) recargarUnaVez();
    };

    window.addEventListener("unhandledrejection", alFallar);
    window.addEventListener("error", alReventar);
    return () => {
      window.removeEventListener("unhandledrejection", alFallar);
      window.removeEventListener("error", alReventar);
    };
  }, []);

  return null;
}
