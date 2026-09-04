"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { descartarDuplicado, eliminarEquipo, reabrirDuplicado } from "../app/inventario/actions";
import { ETIQUETA_ESTADO } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import FusionarEquipoBtn from "./FusionarEquipoBtn";
import { Badge, Card, btnDanger, btnGhost, btnPrimary, tonoEstadoEquipo } from "./ui";

export type EquipoDup = {
  id: number;
  codigo: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  estado: string;
  asignado_nombre: string | null;
  asignado_numero: string | null;
  created_at: string;
  responsivas: string[];
  mantenimientos: number;
  /** Lo que trae lleno, para compararlo con el otro registro. */
  datos: { etiqueta: string; valor: string }[];
};

export type GrupoVista = {
  clave: string;
  campo: string;
  etiqueta: string;
  valor: string;
  bloqueante: boolean;
  nota: string | null;
  equipos: EquipoDup[];
};

/**
 * Revisión de datos repetidos, un caso por tarjeta.
 *
 * Los registros van uno junto al otro con lo que trae cada uno; lo que no
 * coincide se resalta, que es lo único que hay que mirar para decidir. Debajo,
 * las tres salidas: unirlos, borrar el que sobra o decir que son distintos.
 */
export default function DuplicadosClient({
  porRevisar,
  yaRevisados,
}: {
  porRevisar: GrupoVista[];
  yaRevisados: GrupoVista[];
}) {
  const [verRevisados, setVerRevisados] = useState(false);

  return (
    <div className="space-y-4">
      {porRevisar.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✅ No queda ningún caso por revisar.
        </div>
      ) : null}

      {porRevisar.map((g) => (
        <TarjetaGrupo key={g.clave} grupo={g} />
      ))}

      {yaRevisados.length ? (
        <div className="pt-2">
          <button className={btnGhost} onClick={() => setVerRevisados((v) => !v)}>
            {verRevisados ? "Ocultar" : `Ver los ${yaRevisados.length} ya revisados`}
          </button>
          {verRevisados ? (
            <div className="mt-3 space-y-4">
              {yaRevisados.map((g) => (
                <TarjetaGrupo key={g.clave} grupo={g} revisado />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TarjetaGrupo({ grupo: g, revisado = false }: { grupo: GrupoVista; revisado?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  // Solo importa lo que NO coincide: en lo demás los dos registros dicen igual.
  const etiquetas = [...new Set(g.equipos.flatMap((e) => e.datos.map((d) => d.etiqueta)))];
  const valorDe = (e: EquipoDup, etiqueta: string) => e.datos.find((d) => d.etiqueta === etiqueta)?.valor ?? "";
  const difiere = (etiqueta: string) => new Set(g.equipos.map((e) => valorDe(e, etiqueta))).size > 1;

  const borrar = (e: EquipoDup) => {
    // Lo que hay que mirar antes de borrar una copia: si tiene dueño, cartas o
    // mantenimientos, el bueno es este y el que sobra es el otro.
    const ataduras = [
      e.asignado_nombre
        ? `⚠️ Está asignado a ${e.asignado_nombre}${e.asignado_numero ? ` (${e.asignado_numero})` : ""}. Al borrarlo, esa persona se queda sin el equipo registrado.`
        : "",
      e.responsivas.length
        ? `⚠️ Tiene ${e.responsivas.length} carta(s) responsiva(s) (${e.responsivas.join(", ")}). Si es el mismo aparato que el otro registro, conviene UNIRLOS en vez de borrar: así las cartas no se pierden.`
        : "",
      e.mantenimientos ? `⚠️ Tiene ${e.mantenimientos} mantenimiento(s) registrado(s).` : "",
    ].filter(Boolean);

    if (
      !confirm(
        `Se va a eliminar ${e.codigo} del inventario.\n\n` +
          (ataduras.length
            ? `${ataduras.join("\n\n")}\n\n`
            : "No está asignado a nadie y no tiene cartas ni mantenimientos: se puede quitar sin perder nada.\n\n") +
          `¿Continuar?`
      )
    )
      return;
    setError("");
    iniciar(async () => {
      const res = await eliminarEquipo(e.id);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo eliminar.");
    });
  };

  const descartar = () => {
    const nota = prompt(
      (g.campo === "sin_serie"
        ? `Marcar como revisado: ${g.equipos.map((e) => e.codigo).join(", ")} son equipos distintos, no copias.\n\n`
        : `Marcar como revisado: los equipos que comparten ${g.etiqueta} “${g.valor}” son distintos.\n\n`) +
        `Deja una nota de por qué (opcional):`,
      ""
    );
    if (nota === null) return;
    setError("");
    iniciar(async () => {
      const res = await descartarDuplicado(g.campo, g.valor, nota);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo marcar.");
    });
  };

  const reabrir = () => {
    setError("");
    iniciar(async () => {
      const res = await reabrirDuplicado(g.campo, g.valor);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo devolver a la lista.");
    });
  };

  return (
    <Card className={revisado ? "opacity-70" : undefined}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink">
              {g.campo === "sin_serie" ? (
                <>
                  {g.equipos.length} equipos idénticos y sin número de serie:{" "}
                  <span className="text-kraft-dark">
                    {[g.equipos[0]?.marca, g.equipos[0]?.modelo].filter(Boolean).join(" ") || "sin marca"}
                  </span>
                </>
              ) : (
                <>
                  Mismo {g.etiqueta}: <span className="mono text-kraft-dark">{g.valor}</span>
                </>
              )}
            </h2>
            {g.campo === "sin_serie" ? (
              <Badge tono="ambar">Puede ser el mismo, subido dos veces</Badge>
            ) : g.bloqueante ? (
              <Badge tono="rojo">No debería repetirse</Badge>
            ) : (
              <Badge tono="ambar">Solo aviso</Badge>
            )}
            {revisado ? <Badge tono="gris">Ya revisado</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-soft">
            {g.campo === "sin_serie"
              ? `Traen exactamente los mismos datos: ${g.equipos.map((e) => e.codigo).join(", ")}`
              : `${g.equipos.length} registros lo comparten: ${g.equipos.map((e) => e.codigo).join(", ")}`}
            {revisado && g.nota ? ` · Nota: ${g.nota}` : ""}
          </p>
          {g.campo === "sin_serie" && !revisado ? (
            <p className="mt-1 max-w-2xl text-xs text-soft">
              Sin serie no hay cómo distinguirlos, así que volver a subir el Excel los dio de alta otra vez. Revisa a
              quién está asignado cada uno antes de quitar el que sobra: el que ya tiene dueño o responsiva es el
              bueno.
            </p>
          ) : null}
        </div>
        {revisado ? (
          <button className={btnGhost} onClick={reabrir} disabled={pendiente}>
            Volver a revisarlo
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {g.equipos.length === 2 ? (
              <FusionarEquipoBtn
                equipoId={g.equipos[0].id}
                codigo={g.equipos[0].codigo}
                parejaId={g.equipos[1].id}
                className={btnPrimary}
                etiqueta="Unir estos dos"
              />
            ) : null}
            <button className={btnGhost} onClick={descartar} disabled={pendiente}>
              No son el mismo
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-line bg-paper/70">
            <tr>
              <th className="w-40 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft">Dato</th>
              {g.equipos.map((e) => (
                <th key={e.id} className="px-3 py-2 text-left align-top">
                  <span className="mono text-sm font-bold text-kraft-dark">{e.codigo}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tono={tonoEstadoEquipo(e.estado)}>{ETIQUETA_ESTADO[e.estado] ?? e.estado}</Badge>
                    {e.responsivas.length ? (
                      <Badge tono="verde">
                        {e.responsivas.length === 1 ? e.responsivas[0] : `${e.responsivas.length} responsivas`}
                      </Badge>
                    ) : (
                      <Badge tono="ambar">Sin responsiva</Badge>
                    )}
                    {e.mantenimientos ? <Badge tono="gris">{e.mantenimientos} mant.</Badge> : null}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal normal-case text-soft">
                    {e.asignado_nombre ? `${e.asignado_numero} ${e.asignado_nombre}` : "Sin empleado"} · alta{" "}
                    {fechaCorta(e.created_at.slice(0, 10))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {etiquetas.map((etiqueta) => {
              const distinto = difiere(etiqueta);
              return (
                <tr key={etiqueta} className="border-b border-line/60 last:border-0">
                  <td className={`px-3 py-1.5 align-top text-xs font-semibold ${distinto ? "text-ink" : "text-soft"}`}>
                    {etiqueta}
                  </td>
                  {g.equipos.map((e) => {
                    const v = valorDe(e, etiqueta);
                    return (
                      <td
                        key={e.id}
                        className={`px-3 py-1.5 align-top text-sm ${
                          distinto ? "bg-amber-50/70 font-medium text-ink" : "text-soft"
                        }`}
                      >
                        {v || <span className="italic text-soft">(vacío)</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {revisado ? null : (
            <tfoot className="border-t border-line bg-paper/50">
              <tr>
                <td className="px-3 py-2 text-xs font-semibold text-soft">Acciones</td>
                {g.equipos.map((e) => (
                  <td key={e.id} className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/inventario?q=${encodeURIComponent(e.codigo)}&editar=${e.id}`} className={btnGhost}>
                        Ver / editar
                      </Link>
                      {g.equipos.length > 2 ? (
                        <FusionarEquipoBtn equipoId={e.id} codigo={e.codigo} className={btnGhost} etiqueta="Unir…" />
                      ) : null}
                      <button className={btnDanger} onClick={() => borrar(e)} disabled={pendiente}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
