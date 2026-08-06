"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  camposFusion,
  candidatosFusion,
  fusionarEquiposManual,
  type CampoFusion,
  type EquipoFusionable,
} from "../app/inventario/actions";
import { ETIQUETA_TIPO } from "../lib/constants";
import { Badge, btnGhost, btnPrimary } from "./ui";

/**
 * Une dos registros que son el mismo aparato: uno suele traer la responsiva y
 * los datos viejos, y el otro los datos frescos del escaneo. Aquí se ven los
 * dos juntos, se decide cuál se conserva y qué valor queda en cada campo. Las
 * responsivas y el historial de los dos pasan al que se queda.
 */
export default function FusionarEquipoBtn({
  equipoId,
  codigo,
  className,
  etiqueta = "Fusionar",
}: {
  equipoId: number;
  codigo: string;
  className?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [base, setBase] = useState<EquipoFusionable | null>(null);
  const [candidatos, setCandidatos] = useState<EquipoFusionable[]>([]);
  const [pareja, setPareja] = useState<EquipoFusionable | null>(null);
  const [campos, setCampos] = useState<CampoFusion[] | null>(null);
  /** Por cada campo: "a" (el de este equipo) o "b" (el del otro). */
  const [lado, setLado] = useState<Record<string, "a" | "b">>({});
  const [conservar, setConservar] = useState<"a" | "b">("a");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const abrir = () => {
    setAbierto(true);
    setError("");
    setPareja(null);
    setCampos(null);
    iniciar(async () => {
      const res = await candidatosFusion(equipoId);
      if (res.ok) {
        setBase(res.base ?? null);
        setCandidatos(res.candidatos ?? []);
      } else setError(res.error ?? "No se pudo buscar.");
    });
  };

  const elegirPareja = (c: EquipoFusionable) => {
    setPareja(c);
    setError("");
    setCampos(null);
    iniciar(async () => {
      const res = await camposFusion(equipoId, c.id);
      if (res.ok && res.campos) {
        setCampos(res.campos);
        // De entrada gana el dato que tenga algo escrito; si los dos traen algo,
        // se queda el del registro más completo, que suele ser el del escaneo.
        const masCompleto: "a" | "b" = (base?.llenos ?? 0) >= c.llenos ? "a" : "b";
        const inicial: Record<string, "a" | "b"> = {};
        for (const f of res.campos) {
          const ta = f.a.trim();
          const tb = f.b.trim();
          inicial[`${f.donde}:${f.clave}`] = !ta && tb ? "b" : !tb && ta ? "a" : masCompleto;
        }
        setLado(inicial);
        // Conservar el registro que trae la responsiva: así no se pierde el papel.
        setConservar((base?.responsivas.length ?? 0) >= c.responsivas.length ? "a" : "b");
      } else setError(res.error ?? "No se pudieron comparar.");
    });
  };

  const aplicarTodo = (cual: "a" | "b") => {
    if (!campos) return;
    const nuevo: Record<string, "a" | "b"> = {};
    for (const f of campos) nuevo[`${f.donde}:${f.clave}`] = cual;
    setLado(nuevo);
  };

  const guardar = () => {
    if (!campos || !pareja || !base) return;
    const conservarId = conservar === "a" ? base.id : pareja.id;
    const eliminarId = conservar === "a" ? pareja.id : base.id;
    const queSeVa = conservar === "a" ? pareja : base;
    const queQueda = conservar === "a" ? base : pareja;

    if (
      !confirm(
        `Se va a conservar ${queQueda.codigo} y desaparecerá ${queSeVa.codigo}.\n\n` +
          `${queSeVa.responsivas.length ? `Las responsivas de ${queSeVa.codigo} (${queSeVa.responsivas.join(", ")}) pasan a ${queQueda.codigo}.\n\n` : ""}` +
          `Se guarda un respaldo de la base antes de hacerlo. ¿Continuar?`
      )
    )
      return;

    setError("");
    iniciar(async () => {
      const res = await fusionarEquiposManual({
        conservarId,
        eliminarId,
        valores: campos.map((f) => ({
          clave: f.clave,
          donde: f.donde,
          valor: lado[`${f.donde}:${f.clave}`] === "b" ? f.b : f.a,
        })),
      });
      if (res.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(res.error ?? "No se pudo unir.");
    });
  };

  const resumen = (e: EquipoFusionable) => (
    <div className="text-xs text-soft">
      <div className="mono text-sm font-bold text-kraft-dark">{e.codigo}</div>
      <div>
        {e.marca} {e.modelo} · {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
      </div>
      <div>Serie: {e.numero_serie || "—"}</div>
      <div>{e.asignado_nombre ? `Asignado a ${e.asignado_nombre}` : "Sin empleado"}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {e.responsivas.length ? (
          <Badge tono="verde">{e.responsivas.length === 1 ? e.responsivas[0] : `${e.responsivas.length} responsivas`}</Badge>
        ) : (
          <Badge tono="ambar">Sin responsiva</Badge>
        )}
        <Badge tono="gris">{e.llenos} datos</Badge>
        {e.mantenimientos ? <Badge tono="gris">{e.mantenimientos} mant.</Badge> : null}
      </div>
    </div>
  );

  const distintos = campos?.filter((f) => f.a.trim() !== f.b.trim()) ?? [];
  const iguales = campos?.filter((f) => f.a.trim() === f.b.trim() && f.a.trim()) ?? [];

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={abrir}
        title={`Unir ${codigo} con otro registro que sea el mismo aparato`}
      >
        {etiqueta}
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-6 w-full max-w-5xl rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Unir dos registros del mismo equipo</h2>
                <p className="mt-0.5 text-sm text-soft">
                  Pasa a un solo registro lo mejor de los dos: la responsiva de uno y los datos actualizados del otro.
                </p>
              </div>
              <button className={btnGhost} onClick={() => setAbierto(false)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            {!pareja ? (
              <>
                <p className="mb-2 text-sm font-semibold text-ink">
                  ¿Con cuál se junta <span className="mono">{codigo}</span>?
                </p>
                {pendiente && !candidatos.length ? <p className="text-sm text-soft">Buscando parecidos…</p> : null}
                {!pendiente && !candidatos.length ? (
                  <p className="rounded-md border border-dashed border-line bg-paper/60 px-4 py-6 text-center text-sm text-soft">
                    No se encontró ningún registro parecido a este equipo.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {candidatos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => elegirPareja(c)}
                      className="rounded-md border border-line bg-white p-3 text-left hover:border-kraft hover:bg-paper/60"
                    >
                      {resumen(c)}
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-kraft-dark">{c.motivo}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["a", base] as const,
                    ["b", pareja] as const,
                  ]).map(([cual, eq]) =>
                    eq ? (
                      <label
                        key={cual}
                        className={`cursor-pointer rounded-md border p-3 ${
                          conservar === cual ? "border-kraft bg-kraft/5" : "border-line bg-white"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <input
                            type="radio"
                            className="h-4 w-4 accent-kraft"
                            checked={conservar === cual}
                            onChange={() => setConservar(cual)}
                          />
                          <span className="text-sm font-bold text-ink">
                            {conservar === cual ? "Se conserva este registro" : "Este desaparece"}
                          </span>
                        </div>
                        {resumen(eq)}
                      </label>
                    ) : null
                  )}
                </div>

                <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Las responsivas y los mantenimientos de los dos quedan en el registro que conserves, sin importar cuál
                  elijas. Lo que decides abajo son los <b>datos</b> que se quedan.
                </p>

                {campos ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-ink">Quedarme con todos los datos de:</span>
                      <button className={btnGhost} onClick={() => aplicarTodo("a")}>
                        {base?.codigo}
                      </button>
                      <button className={btnGhost} onClick={() => aplicarTodo("b")}>
                        {pareja.codigo}
                      </button>
                      <span className="text-soft">…o elige campo por campo.</span>
                    </div>

                    <div className="mt-3 overflow-x-auto rounded-md border border-line">
                      <table className="w-full border-collapse text-sm">
                        <thead className="border-b border-line bg-paper/70">
                          <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft">
                              Campo
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft">
                              {base?.codigo}
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft">
                              {pareja.codigo}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {distintos.length === 0 ? (
                            <tr>
                              <td className="px-3 py-3 text-sm text-soft" colSpan={3}>
                                Los dos registros tienen exactamente los mismos datos.
                              </td>
                            </tr>
                          ) : null}
                          {distintos.map((f) => {
                            const k = `${f.donde}:${f.clave}`;
                            return (
                              <tr key={k} className="border-b border-line/60 last:border-0">
                                <td className="px-3 py-2 align-top text-xs font-semibold text-ink">{f.etiqueta}</td>
                                {(["a", "b"] as const).map((cual) => {
                                  const valor = cual === "a" ? f.a : f.b;
                                  const elegido = lado[k] === cual;
                                  return (
                                    <td key={cual} className="px-3 py-2 align-top">
                                      <label
                                        className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1 ${
                                          elegido ? "bg-emerald-50 ring-1 ring-emerald-300" : "hover:bg-paper"
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          className="mt-0.5 h-3.5 w-3.5 accent-kraft"
                                          checked={elegido}
                                          onChange={() => setLado((p) => ({ ...p, [k]: cual }))}
                                        />
                                        <span className={valor.trim() ? "text-sm text-ink" : "text-sm italic text-soft"}>
                                          {valor.trim() || "(vacío)"}
                                        </span>
                                      </label>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {iguales.length ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-soft">
                          Ver los {iguales.length} campo(s) en los que coinciden
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-soft">
                          {iguales.map((f) => (
                            <li key={`${f.donde}:${f.clave}`}>
                              <b>{f.etiqueta}:</b> {f.a}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
                        {pendiente ? "Uniendo…" : "Unir los dos registros"}
                      </button>
                      <button className={btnGhost} onClick={() => setPareja(null)} disabled={pendiente}>
                        ← Elegir otro
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-soft">Comparando los datos…</p>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
