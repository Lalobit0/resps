"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarMiClave } from "../app/cuenta/actions";
import { btnPrimary, inputCls, Label } from "./ui";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} mt-5 w-full`}>
      {pending ? "Guardando…" : "Guardar contraseña"}
    </button>
  );
}

export default function CambiarClave() {
  const [estado, accion] = useActionState(cambiarMiClave, null);

  return (
    <form action={accion}>
      <div>
        <Label>Contraseña actual</Label>
        <input name="actual" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      <div className="mt-3">
        <Label>Contraseña nueva</Label>
        <input name="nueva" type="password" autoComplete="new-password" required className={inputCls} />
        <p className="mt-1 text-xs text-soft">Mínimo 8 caracteres, con letras y números.</p>
      </div>
      <div className="mt-3">
        <Label>Repite la nueva</Label>
        <input name="repetida" type="password" autoComplete="new-password" required className={inputCls} />
      </div>

      {estado?.error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.error}
        </p>
      ) : null}
      {estado?.mensaje ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {estado.mensaje}
        </p>
      ) : null}

      <Boton />
    </form>
  );
}
