"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { entrar } from "../app/entrar/actions";
import { inputCls, Label } from "./ui";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-5 w-full rounded-md bg-brand-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export default function FormaAcceso({ volver }: { volver: string }) {
  const [estado, accion] = useActionState(entrar, null);

  return (
    <form action={accion} className="mt-5">
      <input type="hidden" name="volver" value={volver} />
      <div>
        <Label>Usuario</Label>
        <input name="usuario" autoFocus autoComplete="username" required className={inputCls} />
      </div>
      <div className="mt-3">
        <Label>Contraseña</Label>
        <input name="clave" type="password" autoComplete="current-password" required className={inputCls} />
      </div>

      {estado?.error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.error}
        </p>
      ) : null}

      <Boton />
    </form>
  );
}
