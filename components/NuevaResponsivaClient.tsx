"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado, Equipo } from "../lib/types";
import { CARTAS, CLASES_CARTA, ETIQUETA_TIPO, type ClaseCarta } from "../lib/constants";
import { crearResponsiva } from "../app/responsivas/actions";
import SignatureCanvas from "./SignatureCanvas";
import { Badge, Card, Empty, Label, btnPrimary, inputCls } from "./ui";

export default function NuevaResponsivaClient({
  empleados,
  equipos,
}: {
  empleados: Empleado[];
  equipos: Equipo[];
}) {
  const router = useRouter();
  const [clase, setClase] = useState<ClaseCarta>("COMPUTO");
  const [empleadoId, setEmpleadoId] = useState("");
  const [equipoId, setEquipoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const config = CARTAS[clase];
  const requiereEquipo = config.tiposEquipo.length > 0;
  const empleado = empleados.find((e) => String(e.id) === empleadoId);

  const equiposDelTipo = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return equipos
      .filter((e) => config.tiposEquipo.includes(e.tipo as (typeof config.tiposEquipo)[number]))
      .filter((e) =>
        !q ? true : [e.codigo, e.categoria, e.marca, e.modelo, e.numero_serie ?? ""].join(" ").toLowerCase().includes(q)
      );
  }, [equipos, config, filtro]);

  const cambiarClase = (c: ClaseCarta) => {
    setClase(c);
    setEquipoId(null);
    setError("");
  };

  const enviar = () => {
    setError("");
    if (!empleado) return setError("Selecciona al empleado que recibe.");
    if (requiereEquipo && !equipoId) return setError("Selecciona el equipo a asignar.");
    if (!firma) return setError("Falta la firma del empleado en pantalla.");

    iniciar(async () => {
      const res = await crearResponsiva({
        clase,
        empleadoId: empleado.id,
        equipoId: requiereEquipo ? equipoId : null,
        observaciones,
        firma,
      });
      if (res.ok && res.id) {
        window.open(`/api/pdf/${res.id}`, "_blank");
        router.push(`/responsivas?nueva=${res.folio}`);
        router.refresh();
      } else {
        setError(res.error ?? "Error desconocido.");
      }
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">1. Tipo de carta</h2>
          <div className="grid grid-cols-2 gap-2">
            {CLASES_CARTA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => cambiarClase(c)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  clase === c
                    ? "border-kraft bg-orange-50/60 font-semibold text-kraft-dark"
                    : "border-line bg-white hover:bg-paper/60"
                }`}
              >
                {CARTAS[c].etiqueta}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">2. Empleado que recibe</h2>
          <select className={inputCls} value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
            <option value="">— Selecciona un empleado —</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numero_empleado} · {e.nombre}
              </option>
            ))}
          </select>
          {empleado ? (
            <p className="mt-2 text-sm text-soft">
              {empleado.puesto} · {empleado.area || empleado.departamento}
              {empleado.supervisor ? ` · Jefe: ${empleado.supervisor}` : ""}
            </p>
          ) : null}
        </Card>

        {requiereEquipo ? (
          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">3. Equipo a entregar</h2>
            <input
              className={`${inputCls} mb-3`}
              placeholder="Filtrar equipos disponibles…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            {equiposDelTipo.length === 0 ? (
              <Empty>No hay equipos disponibles de este tipo. Regístralos en el inventario primero.</Empty>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {equiposDelTipo.map((e) => (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                      equipoId === e.id ? "border-kraft bg-orange-50/60" : "border-line bg-white hover:bg-paper/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="equipo"
                      className="mt-0.5 accent-kraft"
                      checked={equipoId === e.id}
                      onChange={() => setEquipoId(e.id)}
                    />
                    <span>
                      <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                      <span className="font-medium">
                        {e.marca} {e.modelo}
                      </span>
                      <span className="block text-xs text-soft">
                        {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
                        {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                        {e.specs ? ` · ${e.specs}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <h2 className="mb-1 text-base font-bold text-ink">3. Sin equipo</h2>
            <p className="text-sm text-soft">
              Esta carta es para el <Badge tono="petrol">acceso a la red Wi-Fi</Badge>; no se asigna ningún equipo físico.
            </p>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">4. Observaciones (opcional)</h2>
          <div>
            <Label>Observaciones</Label>
            <textarea
              className={inputCls}
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Incluye cargador y funda."
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">5. Firma del empleado</h2>
          <SignatureCanvas onChange={setFirma} />
        </Card>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente}>
          {pendiente ? "Generando PDF…" : "Generar responsiva y guardar"}
        </button>
        <p className="text-center text-xs text-soft">
          El PDF se guarda en el repositorio con el formato oficial de Sultana Packaging.
        </p>
      </div>
    </div>
  );
}
