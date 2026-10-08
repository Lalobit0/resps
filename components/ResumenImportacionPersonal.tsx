"use client";

import Link from "next/link";
import { useState } from "react";
import { resumirCambios, type ResumenPersonal } from "../lib/cambios-personal";
import { btnGhost, btnPrimary } from "./ui";

/**
 * Cómo quedó la plantilla después de subir el Excel.
 *
 * Lo que había antes era un renglón verde con "137 actualizados", y eso
 * esconde justo lo que hay que ver: esos 137 son casi todos la misma gente
 * con los mismos datos, y entre ellos van los dos o tres cambios de verdad.
 * Aquí se nombran uno por uno.
 *
 * Y cuando alguien dejó de venir en el archivo, el botón para revisarlo está
 * aquí mismo: antes había que leer "revísalas en Bajas" e ir a buscarlo.
 */
export default function ResumenImportacionPersonal({
  resumen,
  onCerrar,
}: {
  resumen: ResumenPersonal;
  onCerrar: () => void;
}) {
  const [verTodo, setVerTodo] = useState(false);
  const { nuevos, cambios, sinCambios, omitidos, ausentes, ausentesConEquipo } = resumen;

  const TOPE = 12;
  const cambiosVisibles = verTodo ? cambios : cambios.slice(0, TOPE);
  const nuevosVisibles = verTodo ? nuevos : nuevos.slice(0, TOPE);
  const recortado = !verTodo && (cambios.length > TOPE || nuevos.length > TOPE);

  const dato = (n: number, singular: string, plural: string, tono: string) => (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tono}`}>
      {n} {n === 1 ? singular : plural}
    </span>
  );

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Así quedó la plantilla</h3>
        <button type="button" onClick={onCerrar} className="text-xs font-medium text-soft hover:text-ink">
          ✕ Cerrar
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {dato(nuevos.length, "nuevo", "nuevos", "bg-sky-100 text-sky-900")}
        {dato(cambios.length, "con cambios", "con cambios", "bg-amber-100 text-amber-900")}
        {dato(sinCambios, "sin cambios", "sin cambios", "bg-white text-soft")}
        {omitidos ? dato(omitidos, "renglón omitido", "renglones omitidos", "bg-red-100 text-red-900") : null}
      </div>

      {nuevos.length ? (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Se dieron de alta</p>
          <ul className="mt-1 space-y-0.5 text-sm text-ink">
            {nuevosVisibles.map((n) => (
              <li key={n.numero_empleado}>
                <span className="mono text-xs text-kraft-dark">{n.numero_empleado}</span> {n.nombre}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cambios.length ? (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Les cambió algo</p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {cambiosVisibles.map((c) => (
              <li key={c.numero_empleado}>
                <span className="mono text-xs text-kraft-dark">{c.numero_empleado}</span> {c.nombre}
                <span className="block text-xs text-soft">{resumirCambios(c.cambios)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recortado ? (
        <button type="button" onClick={() => setVerTodo(true)} className="mt-2 text-xs font-medium text-kraft-dark hover:underline">
          Ver los {Math.max(cambios.length, nuevos.length)} completos
        </button>
      ) : null}

      {!nuevos.length && !cambios.length ? (
        <p className="mt-2 text-sm text-soft">La plantilla vino igual que como estaba. No se cambió nada.</p>
      ) : null}

      {/* Lo que ya no viene en el archivo no se da de baja solo: hay que
          revisarlo. El botón va aquí para no tener que ir a buscarlo. */}
      {ausentes ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm text-amber-900">
            <b>
              {ausentes} {ausentes === 1 ? "persona que estaba en el sistema ya no viene" : "personas que estaban en el sistema ya no vienen"}
            </b>{" "}
            en el archivo
            {ausentesConEquipo ? (
              <>
                , y <b>{ausentesConEquipo}</b> {ausentesConEquipo === 1 ? "trae equipo" : "traen equipo"} a su nombre
              </>
            ) : null}
            . Nadie se da de baja solo: el archivo también puede venir incompleto.
          </p>
          <Link href="/empleados/bajas" className={`${btnPrimary} mt-2 inline-block`}>
            Revisar {ausentes === 1 ? "la baja" : `las ${ausentes} bajas`} →
          </Link>
        </div>
      ) : (
        <div className="mt-3">
          <Link href="/empleados/bajas" className={btnGhost}>
            Ver bajas →
          </Link>
        </div>
      )}
    </div>
  );
}
