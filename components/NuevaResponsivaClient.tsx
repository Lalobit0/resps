"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Empleado, Equipo } from "../lib/types";
import { crearResponsiva } from "../app/responsivas/actions";
import SignatureCanvas from "./SignatureCanvas";
import { Card, Empty, Label, btnPrimary, inputCls } from "./ui";

export default function NuevaResponsivaClient({
  empleados,
  equipos,
  entregaDefault,
}: {
  empleados: Empleado[];
  equipos: Equipo[];
  entregaDefault: string;
}) {
  const router = useRouter();
  const [empleadoId, setEmpleadoId] = useState("");
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [filtro, setFiltro] = useState("");
  const [entregadoPor, setEntregadoPor] = useState(entregaDefault);
  const [observaciones, setObservaciones] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const empleado = empleados.find((e) => String(e.id) === empleadoId);

  const equiposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return equipos;
    return equipos.filter((e) =>
      [e.codigo, e.categoria, e.marca, e.modelo, e.numero_serie ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [equipos, filtro]);

  const alternar = (id: number) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const enviar = () => {
    setError("");
    if (!empleado) return setError("Selecciona al empleado que recibe el equipo.");
    if (seleccion.length === 0) return setError("Selecciona al menos un equipo disponible.");
    if (!firma) return setError("Falta la firma del empleado en pantalla.");

    iniciar(async () => {
      const res = await crearResponsiva({
        empleadoId: empleado.id,
        equipoIds: seleccion,
        entregadoPor,
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
          <h2 className="mb-3 text-base font-bold text-ink">1. Empleado que recibe</h2>
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
              {empleado.puesto} · {empleado.departamento}
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">2. Equipos a entregar</h2>
          <input
            className={`${inputCls} mb-3`}
            placeholder="Filtrar equipos disponibles…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          {equipos.length === 0 ? (
            <Empty>No hay equipos disponibles. Registra equipo en el inventario primero.</Empty>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {equiposFiltrados.map((e) => (
                <label
                  key={e.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                    seleccion.includes(e.id) ? "border-kraft bg-orange-50/60" : "border-line bg-white hover:bg-paper/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-kraft"
                    checked={seleccion.includes(e.id)}
                    onChange={() => alternar(e.id)}
                  />
                  <span>
                    <span className="mono text-xs font-semibold text-kraft-dark">{e.codigo}</span>{" "}
                    <span className="font-medium">
                      {e.marca} {e.modelo}
                    </span>
                    <span className="block text-xs text-soft">
                      {e.categoria}
                      {e.numero_serie ? ` · Serie ${e.numero_serie}` : ""}
                      {e.specs ? ` · ${e.specs}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-soft">{seleccion.length} equipo(s) seleccionado(s)</p>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">3. Detalles de la entrega</h2>
          <div className="space-y-4">
            <div>
              <Label>Entrega (departamento o persona)</Label>
              <input className={inputCls} value={entregadoPor} onChange={(e) => setEntregadoPor(e.target.value)} />
            </div>
            <div>
              <Label>Observaciones (opcional)</Label>
              <textarea
                className={inputCls}
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. Incluye cargador y funda. Equipo con detalle estético en la tapa."
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">4. Firma del empleado</h2>
          <SignatureCanvas onChange={setFirma} />
        </Card>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <button className={`${btnPrimary} w-full py-3 text-base`} onClick={enviar} disabled={pendiente}>
          {pendiente ? "Generando PDF…" : "Generar responsiva y guardar"}
        </button>
        <p className="text-center text-xs text-soft">
          Al generar, los equipos quedan marcados como asignados y el PDF se guarda en el repositorio.
        </p>
      </div>
    </div>
  );
}
