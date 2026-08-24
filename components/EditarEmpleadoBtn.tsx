"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarEmpleado } from "../app/empleados/actions";
import CamposEmpleado, { empleadoAFormulario, type DatosEmpleado } from "./CamposEmpleado";
import { btnGhost, btnPrimary } from "./ui";

/**
 * Corrige los datos del empleado desde su propio histórico.
 *
 * Es donde se nota que algo está mal —el área sin definir, el jefe que ya
 * cambió—, así que se arregla ahí mismo en vez de ir a buscarlo al listado.
 */
export default function EditarEmpleadoBtn({
  empleado,
  className,
  etiqueta = "✎ Editar datos",
}: {
  empleado: Parameters<typeof empleadoAFormulario>[0];
  className?: string;
  etiqueta?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<DatosEmpleado | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const guardar = () => {
    if (!form) return;
    setError("");
    iniciar(async () => {
      const res = await guardarEmpleado(form);
      if (res.ok) {
        setForm(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo guardar.");
    });
  };

  return (
    <>
      <button
        type="button"
        className={className ?? btnGhost}
        onClick={() => {
          setError("");
          setForm(empleadoAFormulario(empleado));
        }}
        title="Corregir los datos de este empleado"
      >
        {etiqueta}
      </button>

      {form ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-6 w-full max-w-3xl rounded-lg border border-line bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Editar empleado</h2>
                <p className="mt-0.5 text-sm text-soft">
                  Los cambios se ven enseguida en su histórico, en el inventario y en las cartas que se generen desde
                  ahora. Las responsivas ya firmadas conservan lo que decía el papel.
                </p>
              </div>
              <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
                ✕ Cerrar
              </button>
            </div>

            <CamposEmpleado
              valor={form}
              onCambio={(campo, texto) => setForm((f) => (f ? { ...f, [campo]: texto } : f))}
              deshabilitado={pendiente}
            />

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button className={btnPrimary} onClick={guardar} disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar cambios"}
              </button>
              <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
