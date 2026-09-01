"use client";

import { useMemo, useState, useTransition } from "react";
import { aplicarPaqueteBasico, eliminarRegla, guardarRegla } from "../app/configuracion/actions";
import { CAMPOS_MATRIZ, type ReglaMatriz, type TipoDocumento } from "../lib/expedientes-comun";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

type Regla = ReglaMatriz & { tipo_nombre: string; tipo_codigo: string; tipo_grupo: string | null };
type Aviso = { ok: boolean; texto: string } | null;

const ETIQUETA_CAMPO: Record<string, string> = Object.fromEntries(CAMPOS_MATRIZ.map((c) => [c.clave, c.etiqueta]));

export default function MatrizClient({
  reglas,
  tipos,
  opciones,
}: {
  reglas: Regla[];
  tipos: TipoDocumento[];
  opciones: Record<string, string[]>;
}) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [pendiente, empezar] = useTransition();

  const grupos = useMemo(() => {
    const mapa = new Map<string, Regla[]>();
    for (const r of reglas) {
      const clave = r.campo === "TODOS" ? "Todo el personal" : `${ETIQUETA_CAMPO[r.campo] ?? r.campo}: ${r.valor}`;
      mapa.set(clave, [...(mapa.get(clave) ?? []), r]);
    }
    // "Todo el personal" siempre primero: es la base sobre la que se suma el resto.
    return [...mapa.entries()].sort(([a], [b]) =>
      a === "Todo el personal" ? -1 : b === "Todo el personal" ? 1 : a.localeCompare(b)
    );
  }, [reglas]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarRegla(datos);
      setAviso({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
      if (r.ok) setEditando(null);
    });
  };

  const borrar = (r: Regla) => {
    if (!confirm(`¿Dejar de pedir ${r.tipo_nombre} a ${r.campo === "TODOS" ? "todo el personal" : r.valor}?`)) return;
    empezar(async () => {
      const res = await eliminarRegla(r.id);
      setAviso({ ok: res.ok, texto: res.ok ? res.mensaje ?? "Listo." : res.error ?? "No se pudo." });
    });
  };

  const paquete = () => {
    empezar(async () => {
      const r = await aplicarPaqueteBasico();
      setAviso({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
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

      {reglas.length === 0 ? (
        <Card className="mb-5 border-amber-300 bg-amber-50">
          <h2 className="font-bold text-amber-900">Todavía no se le pide nada a nadie</h2>
          <p className="mt-2 max-w-2xl text-sm text-amber-900">
            Puedes empezar de cero, o poner de un golpe el paquete que casi cualquier empresa mexicana le pide a todo su
            personal: INE, CURP, RFC, NSS, acta de nacimiento, comprobante de domicilio, contrato y aviso de privacidad.
            Quedan como reglas normales y se pueden quitar una por una.
          </p>
          <button onClick={paquete} disabled={pendiente} className={`${btnPrimary} mt-4`}>
            {pendiente ? "Aplicando…" : "Poner el paquete básico"}
          </button>
        </Card>
      ) : null}

      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setEditando(editando === "nueva" ? null : "nueva")}>
          {editando === "nueva" ? "Cancelar" : "+ Nueva regla"}
        </button>
      </div>

      {editando === "nueva" ? (
        <Card className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Pedir un documento</h2>
          <form onSubmit={enviar} className="mt-4">
            <CamposRegla tipos={tipos} opciones={opciones} />
            <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
              {pendiente ? "Guardando…" : "Crear regla"}
            </button>
          </form>
        </Card>
      ) : null}

      {reglas.length === 0 ? null : (
        <div className="space-y-6">
          {grupos.map(([titulo, lista]) => (
            <section key={titulo}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-soft">
                {titulo}
                <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold normal-case text-soft">
                  {lista.length} {lista.length === 1 ? "documento" : "documentos"}
                </span>
              </h2>
              <div className="overflow-x-auto rounded-lg border border-line bg-card">
                <table className="w-full">
                  <thead className="border-b border-line bg-paper/60">
                    <tr>
                      <th className={thCls}>Documento</th>
                      <th className={thCls}>Cómo cuenta</th>
                      <th className={thCls}>Nota</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lista.map((r) => (
                      <tr key={r.id}>
                        <td className={tdCls}>
                          <span className="font-medium">{r.tipo_nombre}</span>
                          <div className="font-mono text-[11px] text-soft">{r.tipo_codigo}</div>
                          {r.tipo_grupo ? (
                            <div className="mt-0.5 text-xs text-soft">
                              También se cumple con cualquier otro documento de “{r.tipo_grupo}”
                            </div>
                          ) : null}
                        </td>
                        <td className={tdCls}>
                          {r.obligatorio === null ? (
                            <span className="text-sm text-soft">Como diga el tipo</span>
                          ) : r.obligatorio ? (
                            <Badge tono="petrol">Obligatorio aquí</Badge>
                          ) : (
                            <Badge tono="gris">Opcional aquí</Badge>
                          )}
                        </td>
                        <td className={`${tdCls} text-soft`}>{r.nota || "—"}</td>
                        <td className={tdCls}>
                          <div className="flex gap-2">
                            <button className={btnGhost} onClick={() => setEditando(editando === r.id ? null : r.id)}>
                              {editando === r.id ? "Cerrar" : "Editar"}
                            </button>
                            <button className={btnDanger} onClick={() => borrar(r)} disabled={pendiente}>
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lista.map((r) =>
                      editando === r.id ? (
                        <tr key={`e-${r.id}`}>
                          <td colSpan={4} className="bg-paper/50 px-4 py-5">
                            <form onSubmit={enviar}>
                              <input type="hidden" name="id" value={r.id} />
                              <CamposRegla tipos={tipos} opciones={opciones} regla={r} />
                              <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
                                Guardar
                              </button>
                            </form>
                          </td>
                        </tr>
                      ) : null
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {reglas.length > 0 && grupos.length === 0 ? <Empty>No hay reglas.</Empty> : null}
    </>
  );
}

function CamposRegla({
  tipos,
  opciones,
  regla,
}: {
  tipos: TipoDocumento[];
  opciones: Record<string, string[]>;
  regla?: Regla;
}) {
  const [campo, setCampo] = useState<string>(regla?.campo ?? "TODOS");
  const lista = opciones[campo] ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="md:col-span-2">
        <Label>Documento</Label>
        <select name="doc_tipo_id" required defaultValue={regla?.doc_tipo_id ?? ""} className={inputCls}>
          <option value="" disabled>
            Elige…
          </option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.categoria ? `${t.categoria} · ` : ""}
              {t.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>¿A quién?</Label>
        <select name="campo" value={campo} onChange={(e) => setCampo(e.target.value)} className={inputCls}>
          {CAMPOS_MATRIZ.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>{campo === "TODOS" ? "—" : "Cuál"}</Label>
        {campo === "TODOS" ? (
          <p className="pt-2 text-sm text-soft">Se le pide a toda la plantilla.</p>
        ) : (
          <>
            <input
              name="valor"
              list={`opciones-${campo}`}
              defaultValue={regla?.valor ?? ""}
              required
              className={inputCls}
              placeholder="Escribe o elige"
            />
            <datalist id={`opciones-${campo}`}>
              {lista.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div>
        <Label>Cómo cuenta</Label>
        <select
          name="obligatorio"
          defaultValue={regla?.obligatorio === null || regla?.obligatorio === undefined ? "" : String(regla.obligatorio)}
          className={inputCls}
        >
          <option value="">Como diga el tipo de documento</option>
          <option value="1">Obligatorio para este grupo</option>
          <option value="0">Opcional para este grupo</option>
        </select>
      </div>

      <div className="md:col-span-3">
        <Label>Nota (por qué se pide)</Label>
        <input name="nota" defaultValue={regla?.nota ?? ""} className={inputCls} />
      </div>
    </div>
  );
}
