"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { darDeBajaEnLote, reactivarEmpleado } from "../app/empleados/actions";
import type { Ausente, EmpleadoDeBaja } from "../lib/bajas";
import { ETIQUETA_TIPO } from "../lib/constants";
import { dinero, fechaCorta, hoyISO } from "../lib/helpers";
import { Badge, Card, Empty, Label, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

/**
 * Las bajas de personal.
 *
 * Arriba, lo que hay que resolver: quién estaba en el sistema y ya no vino en
 * la última plantilla. Abajo, los que ya se cerraron, con lo que quedó
 * pendiente de cada uno.
 *
 * Nadie se da de baja solo. El Excel puede venir incompleto, y confirmar una
 * baja libera equipos y cierra cartas: es una decisión, no un efecto
 * secundario de subir un archivo.
 */
export default function BajasClient({
  pendientes,
  historial,
  cargaFecha,
  cargaArchivo,
}: {
  pendientes: Ausente[];
  historial: EmpleadoDeBaja[];
  cargaFecha: string | null;
  cargaArchivo: string | null;
}) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  // Por empleado, los equipos que sí entregó. De entrada se asume que todo:
  // es lo normal, y así solo se desmarca la excepción.
  const [entregados, setEntregados] = useState<Record<number, Set<number>>>(() =>
    Object.fromEntries(pendientes.map((a) => [a.id, new Set(a.equipos.map((e) => e.id))]))
  );
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const conEquipo = useMemo(() => pendientes.filter((a) => a.equipos.length).length, [pendientes]);
  const conVale = useMemo(() => pendientes.filter((a) => a.vales.length).length, [pendientes]);

  const alternar = (id: number) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const alternarEquipo = (empId: number, eqId: number) =>
    setEntregados((m) => {
      const n = new Set(m[empId] ?? []);
      if (n.has(eqId)) n.delete(eqId);
      else n.add(eqId);
      return { ...m, [empId]: n };
    });

  const confirmar = () => {
    const lista = pendientes.filter((a) => elegidos.has(a.id));
    if (!lista.length) return setAviso({ ok: false, texto: "Marca a quién se va a dar de baja." });

    const equipos = lista.reduce((n, a) => n + (entregados[a.id]?.size ?? 0), 0);
    const quedan = lista.reduce((n, a) => n + a.equipos.length - (entregados[a.id]?.size ?? 0), 0);
    const vales = lista.reduce((n, a) => n + a.vales.length, 0);
    if (
      !confirm(
        `Se va a dar de baja a ${lista.length} ${lista.length === 1 ? "persona" : "personas"}.\n\n` +
          (equipos ? `${equipos} equipo(s) vuelven al inventario como disponibles.\n` : "") +
          (quedan ? `⚠️ ${quedan} equipo(s) se quedan a nombre de quien se fue: falta recuperarlos.\n` : "") +
          (vales ? `⚠️ Hay ${vales} vale(s) de descuento vigentes. La baja no los cancela.\n` : "") +
          `\n¿Continuar?`
      )
    )
      return;

    iniciar(async () => {
      const res = await darDeBajaEnLote({
        fecha,
        motivo,
        personas: lista.map((a) => ({ id: a.id, recibidos: [...(entregados[a.id] ?? [])] })),
      });
      setAviso({ ok: res.ok, texto: res.ok ? (res.mensaje ?? "Listo.") : (res.error ?? "No se pudo.") });
      if (res.ok) {
        setElegidos(new Set());
        router.refresh();
      }
    });
  };

  const revivir = (b: EmpleadoDeBaja) => {
    if (!confirm(`${b.nombre} vuelve a la plantilla.\n\nLos equipos que ya se liberaron no se le devuelven solos.\n\n¿Continuar?`))
      return;
    iniciar(async () => {
      const res = await reactivarEmpleado(b.id);
      setAviso({ ok: res.ok, texto: res.ok ? (res.mensaje ?? "Listo.") : (res.error ?? "No se pudo.") });
      if (res.ok) router.refresh();
    });
  };

  return (
    <>
      {aviso ? (
        <p
          role="status"
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            aviso.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {/* ---------------------------------------------- Por resolver */}
      {pendientes.length > 0 ? (
        <Card className="mb-6 border-amber-300 bg-amber-50/60">
          <h2 className="text-base font-bold text-ink">
            {pendientes.length} {pendientes.length === 1 ? "persona ya no viene" : "personas ya no vienen"} en la
            plantilla
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-soft">
            Estaban activas en el sistema y no aparecieron en la última carga
            {cargaArchivo ? ` (${cargaArchivo}` : ""}
            {cargaFecha ? `${cargaArchivo ? ", " : " ("}${cargaFecha})` : cargaArchivo ? ")" : ""}. Casi siempre eso
            quiere decir que se fueron, pero el archivo también puede venir incompleto, así que aquí se confirman una
            por una.
            {conEquipo ? ` ${conEquipo} ${conEquipo === 1 ? "trae equipo" : "traen equipo"} a su nombre.` : ""}
            {conVale ? ` ${conVale} ${conVale === 1 ? "tiene un vale" : "tienen vales"} de descuento vigente.` : ""}
          </p>

          <div className="mt-4 space-y-3">
            {pendientes.map((a) => {
              const marcado = elegidos.has(a.id);
              const suyos = entregados[a.id] ?? new Set<number>();
              return (
                <div
                  key={a.id}
                  className={`rounded-md border bg-white px-3 py-3 ${marcado ? "border-kraft shadow-sm" : "border-line"}`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={marcado} onChange={() => alternar(a.id)} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-ink">{a.nombre}</span>
                      <span className="ml-2 text-xs text-soft">
                        {a.numero_empleado}
                        {a.puesto ? ` · ${a.puesto}` : ""}
                        {a.departamento ? ` · ${a.departamento}` : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {a.equipos.length ? (
                          <Badge tono="ambar">
                            {a.equipos.length} equipo{a.equipos.length === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <Badge tono="verde">Sin equipo</Badge>
                        )}
                        {a.cartas.length ? <Badge tono="petrol">{a.cartas.length} carta(s) vigente(s)</Badge> : null}
                        {a.vales.length ? <Badge tono="rojo">{a.vales.length} vale(s) de descuento</Badge> : null}
                        {a.mantenimientos ? <Badge tono="gris">{a.mantenimientos} mantenimiento(s)</Badge> : null}
                        {a.documentos ? <Badge tono="gris">{a.documentos} documento(s)</Badge> : null}
                      </span>
                    </span>
                    <Link href={`/empleados/${a.id}`} className={btnGhost} onClick={(e) => e.stopPropagation()}>
                      Ver ficha
                    </Link>
                  </label>

                  {marcado && a.equipos.length ? (
                    <div className="mt-3 rounded-md border border-line bg-paper/60 px-3 py-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">
                        ¿Qué entregó? Lo que dejes sin marcar se queda a su nombre
                      </p>
                      <ul className="space-y-1">
                        {a.equipos.map((eq) => (
                          <li key={eq.id}>
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={suyos.has(eq.id)}
                                onChange={() => alternarEquipo(a.id, eq.id)}
                              />
                              <span className="mono text-xs text-kraft-dark">{eq.codigo}</span>
                              <span className="text-ink">
                                {[eq.marca, eq.modelo].filter(Boolean).join(" ") || ETIQUETA_TIPO[eq.tipo] || eq.tipo}
                              </span>
                              <span className="text-xs text-soft">
                                {ETIQUETA_TIPO[eq.tipo] ?? eq.tipo}
                                {eq.numero_serie ? ` · ${eq.numero_serie}` : ""}
                                {eq.area ? ` · vuelve a ${eq.area}` : ""}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {marcado && a.vales.length ? (
                    <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      Tiene {a.vales.length} vale(s) de descuento vigente(s):{" "}
                      {a.vales.map((v) => `${v.folio}${v.concepto ? ` (${v.concepto}${v.monto != null ? `, ${dinero(v.monto)}` : ""})` : ""}`).join(", ")}
                      . La baja no los cancela — hay que ver con nómina si se descuentan del finiquito.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-amber-200 pt-4">
            <div>
              <Label>Fecha de baja</Label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </div>
            <div className="min-w-[16rem] flex-1">
              <Label>Motivo (para todas)</Label>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ya no viene en la plantilla de RH"
                className={inputCls}
              />
            </div>
            <button className={btnPrimary} onClick={confirmar} disabled={pendiente || elegidos.size === 0}>
              {pendiente ? "Dando de baja…" : `Dar de baja a ${elegidos.size || "las marcadas"}`}
            </button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <h2 className="text-base font-bold text-ink">No hay bajas por confirmar</h2>
          <p className="mt-1 max-w-3xl text-sm text-soft">
            Todo el que está activo en el sistema vino en la última plantilla. Cuando subas una nueva y falte alguien,
            aparecerá aquí para revisarlo antes de darlo por ido.
          </p>
          <Link href="/empleados" className={`${btnGhost} mt-3 inline-flex`}>
            ↥ Ir a importar la plantilla
          </Link>
        </Card>
      )}

      {/* ---------------------------------------------- Los que ya se fueron */}
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-soft">
        Ya no trabajan aquí
        <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold normal-case text-soft">
          {historial.length}
        </span>
      </h2>

      {historial.length === 0 ? (
        <Empty>Todavía no se ha dado de baja a nadie.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full">
            <thead className="border-b border-line bg-paper/60">
              <tr>
                <th className={thCls}>Quién</th>
                <th className={thCls}>Baja</th>
                <th className={thCls}>Motivo</th>
                <th className={thCls}>Qué quedó pendiente</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {historial.map((b) => (
                <tr key={b.id} className="hover:bg-paper/40">
                  <td className={tdCls}>
                    <Link href={`/empleados/${b.id}`} className="font-medium text-ink underline decoration-line">
                      {b.nombre}
                    </Link>
                    <div className="text-xs text-soft">
                      {b.numero_empleado}
                      {b.puesto ? ` · ${b.puesto}` : ""}
                      {b.departamento ? ` · ${b.departamento}` : ""}
                    </div>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-sm`}>{fechaCorta(b.fecha_baja)}</td>
                  <td className={`${tdCls} text-sm text-soft`}>{b.motivo_baja || "—"}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1.5">
                      {b.pendientes ? (
                        <Badge tono="rojo">Sigue con {b.pendientes}</Badge>
                      ) : (
                        <Badge tono="verde">Entregó todo</Badge>
                      )}
                      {b.cartas_vigentes ? <Badge tono="ambar">{b.cartas_vigentes} carta(s) sin cerrar</Badge> : null}
                      {b.vales_vigentes ? <Badge tono="ambar">{b.vales_vigentes} vale(s) vigente(s)</Badge> : null}
                    </div>
                  </td>
                  <td className={tdCls}>
                    <button className={btnGhost} onClick={() => revivir(b)} disabled={pendiente}>
                      Reactivar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
