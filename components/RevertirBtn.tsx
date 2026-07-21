"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertirBitacora } from "../app/responsivas/actions";
import { btnPrimary } from "./ui";

export default function RevertirBtn({ id }: { id: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const revertir = () => {
    if (!confirm("¿Revertir este movimiento? Se restaurará la responsiva y su equipo en el inventario.")) return;
    iniciar(async () => {
      const res = await revertirBitacora(id);
      if (res.ok) router.refresh();
      else alert(res.error ?? "No se pudo revertir.");
    });
  };

  return (
    <button type="button" onClick={revertir} disabled={pendiente} className={`${btnPrimary} px-3 py-1.5 text-xs`}>
      {pendiente ? "Restaurando…" : "↩ Restaurar"}
    </button>
  );
}
