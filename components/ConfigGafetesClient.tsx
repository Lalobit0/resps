"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { guardarPerfil, guardarPuerta } from "../app/gafetes/actions";
import type { PerfilGafete, Puerta } from "../lib/gafetes-comun";
import { Badge, Card, Label, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

/**
 * Las puertas y los perfiles.
 *
 * Las puertas cambian —se pone un lector nuevo, se cierra un pasillo— y los
 * perfiles con ellas. Cambiar un perfil no toca los gafetes que ya lo tienen:
 * lo que abre una tarjeta que ya está en la calle se ajusta uno por uno, a
 * propósito, porque es un cambio físico en el lector.
 */
export default function ConfigGafetesClient({
  puertas,
  perfiles,
}: {
  puertas: Puerta[];
  perfiles: PerfilGafete[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [puerta, setPuerta] = useState<Puerta | "nueva" | null>(null);
  const [perfil, setPerfil] = useState<PerfilGafete | "nuevo" | null>(null);
  const [pendiente, iniciar] = useTransition();

  const enviar = (fn: (fd: FormData) => Promise<{ ok: boolean; mensaje?: string; error?: string }>) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      iniciar(async () => {
        const r = await fn(fd);
        setAviso({ ok: r.ok, texto: r.ok ? (r.mensaje ?? "Listo.") : (r.error ?? "No se pudo.") });
        if (r.ok) {
          setPuerta(null);
          setPerfil(null);
          router.refresh();
        }
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

      {/* ------------------------------------------------------- Perfiles */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-soft">Perfiles de acceso</h2>
        <button className={btnGhost} onClick={() => setPerfil(perfil === "nuevo" ? null : "nuevo")}>
          {perfil === "nuevo" ? "Cancelar" : "+ Nuevo perfil"}
        </button>
      </div>

      {perfil ? (
        <Card className="mb-4">
          <form onSubmit={enviar(guardarPerfil)}>
            {perfil !== "nuevo" ? <input type="hidden" name="id" value={perfil.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <Label>Letra</Label>
                <input
                  name="clave"
                  required
                  maxLength={1}
                  defaultValue={perfil === "nuevo" ? "" : perfil.clave}
                  className={inputCls}
                  placeholder="G"
                />
              </div>
              <div>
                <Label>Nombre</Label>
                <input
                  name="nombre"
                  required
                  defaultValue={perfil === "nuevo" ? "" : perfil.nombre}
                  className={inputCls}
                  placeholder="TODO ACCESO"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Descripción</Label>
                <input
                  name="descripcion"
                  defaultValue={perfil === "nuevo" ? "" : (perfil.descripcion ?? "")}
                  className={inputCls}
                  placeholder="Acceso de la Puerta (1) a la (8)"
                />
              </div>
            </div>

            <div className="mt-4">
              <Label>Qué puertas abre</Label>
              <div className="flex flex-wrap gap-2">
                {puertas.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-paper/60 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="puertas"
                      value={p.numero}
                      defaultChecked={perfil !== "nuevo" && perfil.puertas.includes(p.numero)}
                    />
                    <span>
                      <span className="font-semibold text-ink">({p.numero})</span> {p.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="hidden" name="activo" value="0" />
              <input type="checkbox" name="activo" value="1" defaultChecked={perfil === "nuevo" || !!perfil.activo} />
              Se puede seguir asignando
            </label>

            <button type="submit" className={`${btnPrimary} mt-4`} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar perfil"}
            </button>
          </form>
        </Card>
      ) : null}

      <div className="mb-6 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full">
          <thead className="border-b border-line bg-paper/60">
            <tr>
              <th className={thCls}>Perfil</th>
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Qué abre</th>
              <th className={thCls}>Descripción</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {perfiles.map((p) => (
              <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                <td className={`${tdCls} text-base font-bold`}>{p.clave}</td>
                <td className={`${tdCls} font-medium`}>
                  {p.nombre}
                  {p.activo ? null : <span className="ml-2 text-xs text-soft">(no se asigna)</span>}
                </td>
                <td className={tdCls}>
                  <div className="flex flex-wrap gap-1">
                    {p.puertas.length === 0 ? (
                      <span className="text-soft">Ninguna</span>
                    ) : (
                      p.puertas.map((n) => (
                        <Badge key={n} tono="petrol">
                          ({n})
                        </Badge>
                      ))
                    )}
                  </div>
                </td>
                <td className={`${tdCls} text-sm text-soft`}>{p.descripcion || "—"}</td>
                <td className={tdCls}>
                  <button className={btnGhost} onClick={() => setPerfil(perfil !== "nuevo" && perfil?.id === p.id ? null : p)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* -------------------------------------------------------- Puertas */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-soft">Puertas</h2>
        <button className={btnGhost} onClick={() => setPuerta(puerta === "nueva" ? null : "nueva")}>
          {puerta === "nueva" ? "Cancelar" : "+ Nueva puerta"}
        </button>
      </div>

      {puerta ? (
        <Card className="mb-4">
          <form onSubmit={enviar(guardarPuerta)} className="flex flex-wrap items-end gap-3">
            {puerta !== "nueva" ? <input type="hidden" name="id" value={puerta.id} /> : null}
            <div className="w-24">
              <Label>Número</Label>
              <input
                name="numero"
                type="number"
                min="1"
                required
                defaultValue={puerta === "nueva" ? "" : puerta.numero}
                className={inputCls}
              />
            </div>
            <div className="min-w-[16rem] flex-1">
              <Label>Cómo se llama</Label>
              <input
                name="nombre"
                required
                defaultValue={puerta === "nueva" ? "" : puerta.nombre}
                className={inputCls}
                placeholder="Pasillo Embarques"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="hidden" name="activo" value="0" />
              <input type="checkbox" name="activo" value="1" defaultChecked={puerta === "nueva" || !!puerta.activo} />
              En uso
            </label>
            <button type="submit" className={btnPrimary} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full">
          <thead className="border-b border-line bg-paper/60">
            <tr>
              <th className={thCls}>Número</th>
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Perfiles que la abren</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {puertas.map((p) => {
              const quienes = perfiles.filter((x) => x.puertas.includes(p.numero)).map((x) => x.clave);
              return (
                <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                  <td className={`${tdCls} text-base font-bold`}>({p.numero})</td>
                  <td className={`${tdCls} font-medium`}>
                    {p.nombre}
                    {p.activo ? null : <span className="ml-2 text-xs text-soft">(fuera de uso)</span>}
                  </td>
                  <td className={tdCls}>
                    {quienes.length ? (
                      <span className="font-semibold text-ink">{quienes.join(", ")}</span>
                    ) : (
                      <span className="text-soft">Ninguno — solo a mano</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <button className={btnGhost} onClick={() => setPuerta(puerta !== "nueva" && puerta?.id === p.id ? null : p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
