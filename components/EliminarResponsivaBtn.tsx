"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarResponsiva } from "../app/responsivas/actions";

const cls =
  "inline-flex items-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

export default function EliminarResponsivaBtn({ id, folio, compacto = false }: { id: number; folio: string; compacto?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const eliminar = () => {
    if (
      !confirm(
        `¿Eliminar la responsiva ${folio}?\n\nSe moverá a la papelera y su equipo quedará DISPONIBLE en el inventario (el equipo no se borra).\n\nQueda en la bitácora, así que podrás revertirlo.`
      )
    )
      return;
    iniciar(async () => {
      const res = await eliminarResponsiva(id);
      if (res.ok) router.refresh();
      else alert(res.error ?? "No se pudo eliminar.");
    });
  };

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={pendiente}
      className={compacto ? "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50" : cls}
    >
      {pendiente ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
