"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado } from "../lib/types";
import { hoyISO } from "../lib/helpers";
import { reasignarEquipo } from "../app/inventario/actions";
import BuscadorEmpleado from "./BuscadorEmpleado";
import { Card, Label, btnGhost, btnPrimary, inputCls } from "./ui";

/**
 * Pasar un equipo de una persona a otra.
 *
 * Antes había que dar vuelta por tres pantallas —registrar la devolución,
 * volver al inventario, editar, asignar— para mover un radio de un operador a
 * otro. Aquí se escoge al nuevo y ya; la carta del nuevo queda pendiente y el
 * aviso de "equipos sin carta responsiva" se encarga de reclamarla.
 */
export default function ReasignarEquipoBtn({
  equipoId,
  codigo,
  duenoActual,
  areaEquipo,
  empleados,
  className,
  etiqueta = "Reasignar",
}: {
  equipoId: number;
  codigo: string;
  /** Quién lo trae hoy, para decirlo sin que haya que buscarlo. */
  duenoActual?: string | null;
  /** De qué área es el equipo. Importa cuando está libre: se puede pasar a otra. */
  areaEquipo?: string | null;
  empleados: Empleado[];
  className?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const cerrar = () => {
    setAbierto(false);
    setNuevo(null);
    setMotivo("");
    setError("");
  };

  const confirmar = () => {
    if (!nuevo) return setError("Elige a quién se le va a entregar.");
    setError("");
    iniciar(async () => {
      const r = await reasignarEquipo({ equipoId, nuevoEmpleadoId: nuevo, fecha, motivo });
      if (!r.ok) return setError(r.error ?? "No se pudo reasignar.");
      cerrar();
      router.refresh();
      // La carta del nuevo es el siguiente paso natural, así que se abre ya
      // con el equipo puesto en vez de dejarlo como tarea suelta.
      router.push(`/responsivas/nueva?equipo=${equipoId}`);
    });
  };

  return (
    <>
      <button type="button" className={className ?? btnGhost} onClick={() => setAbierto(true)}>
        {etiqueta}
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="my-10 w-full max-w-lg">
            <h2 className="text-base font-bold text-ink">
              {duenoActual ? "Reasignar" : "Asignar"} {codigo}
            </h2>
            <p className="mt-1 text-sm text-soft">
              {duenoActual ? (
                <>
                  Hoy lo trae <span className="font-semibold text-ink">{duenoActual}</span>. Al reasignarlo, su carta
                  responsiva se cierra y el equipo queda a nombre de quien elijas.
                </>
              ) : (
                <>
                  Está libre en el inventario
                  {areaEquipo ? (
                    <>
                      , y pertenece a <span className="font-semibold text-ink">{areaEquipo}</span>
                    </>
                  ) : null}
                  . Se le puede entregar a quien sea: al elegir a alguien queda a su nombre y pasa a su área.
                </>
              )}
            </p>

            <div className="mt-4">
              <Label>¿A quién pasa? *</Label>
              <BuscadorEmpleado empleados={empleados} value={nuevo} onChange={setNuevo} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Desde cuándo</Label>
                <input className={inputCls} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <Label>Motivo</Label>
                <input
                  className={inputCls}
                  placeholder={duenoActual ? "Cambio de turno, se fue a otra área…" : "Se incorporó, le hacía falta…"}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            </div>

            <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Al confirmar se abre la carta responsiva del nuevo, con el equipo ya puesto. Mientras no se genere, el
              equipo aparece en los avisos como pendiente de carta.
            </p>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={confirmar} disabled={pendiente}>
                {pendiente
                  ? duenoActual
                    ? "Reasignando…"
                    : "Asignando…"
                  : `${duenoActual ? "Reasignar" : "Asignar"} y generar su carta`}
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
