"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Aviso } from "../lib/avisos";

const TONOS: Record<Aviso["tono"], string> = {
  ambar: "border-amber-300 bg-amber-50 text-amber-900",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  rojo: "border-red-200 bg-red-50 text-red-800",
};

/**
 * Los pendientes del sistema en una campana, en lugar de tres o cuatro barras
 * de color apiladas sobre cada pantalla. El globito rojo lleva la cuenta y el
 * panel dice qué hay y a dónde ir a resolverlo.
 */
export default function CampanaAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();
  const params = useSearchParams();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/avisos", { cache: "no-store" });
      const datos = (await r.json()) as { avisos: Aviso[] };
      setAvisos(datos.avisos ?? []);
    } catch {
      // Sin conexión con el servidor la campana simplemente no muestra nada.
    } finally {
      setCargando(false);
    }
  }, []);

  // Al entrar y en cada cambio de pantalla: lo que acabas de resolver
  // desaparece de la cuenta sin tener que recargar.
  useEffect(() => {
    cargar();
  }, [cargar, ruta, params]);

  // Se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => {
      if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false);
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const total = avisos.reduce((s, a) => s + a.total, 0);

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => {
          setAbierto(!abierto);
          if (!abierto) cargar();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-lg transition-colors hover:bg-paper"
        title={total ? `${total} pendiente(s)` : "Sin pendientes"}
        aria-label={total ? `${total} pendientes` : "Sin pendientes"}
      >
        <span aria-hidden>🔔</span>
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </button>

      {abierto ? (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[90vw] rounded-lg border border-line bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">Pendientes</p>
            <button className="text-xs text-soft hover:text-ink" onClick={cargar} disabled={cargando}>
              {cargando ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          {!avisos.length ? (
            <p className="rounded-md border border-dashed border-line bg-paper/60 px-3 py-6 text-center text-sm text-soft">
              {cargando ? "Revisando…" : "Todo en orden, no hay nada pendiente."}
            </p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {avisos.map((a) => (
                <Link
                  key={a.clave}
                  href={a.href}
                  onClick={() => setAbierto(false)}
                  className={`block rounded-md border px-3 py-2 transition-opacity hover:opacity-80 ${TONOS[a.tono]}`}
                >
                  <p className="text-sm font-bold">{a.titulo}</p>
                  <p className="mt-0.5 text-xs">{a.detalle}</p>
                  <p className="mt-1 text-xs font-semibold underline">{a.etiquetaAccion} →</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
