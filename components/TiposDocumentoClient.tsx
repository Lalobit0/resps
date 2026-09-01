"use client";

import { useMemo, useState, useTransition } from "react";
import {
  activarTipoDocumento,
  eliminarCategoria,
  guardarCategoria,
  guardarTipoDocumento,
} from "../app/configuracion/actions";
import { NIVELES_CONFIDENCIALIDAD, type TipoDocumento } from "../lib/expedientes-comun";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

type Categoria = { id: number; nombre: string; descripcion: string | null; orden: number; activo: number };
type Aviso = { ok: boolean; texto: string } | null;

/** Cómo se lee la vigencia de un tipo en una sola línea. */
function textoVigencia(t: TipoDocumento): string {
  switch (t.vigencia_tipo) {
    case "FECHA":
      return "La que traiga impresa";
    case "DIAS":
      return `${t.vigencia_valor} días desde la emisión`;
    case "MESES":
      return `${t.vigencia_valor} ${t.vigencia_valor === 1 ? "mes" : "meses"} desde la emisión`;
    case "ANIOS":
      return `${t.vigencia_valor} ${t.vigencia_valor === 1 ? "año" : "años"} desde la emisión`;
    default:
      return "No vence";
  }
}

export default function TiposDocumentoClient({
  tipos,
  categorias,
  enMatriz,
  cargados,
}: {
  tipos: TipoDocumento[];
  categorias: Categoria[];
  enMatriz: Record<number, number>;
  cargados: Record<number, number>;
}) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<number | "nuevo" | null>(null);
  const [verCategorias, setVerCategorias] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [soloSinVigencia, setSoloSinVigencia] = useState(false);
  const [pendiente, empezar] = useTransition();

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return tipos.filter((t) => {
      if (soloSinVigencia && t.vigencia_tipo !== "SIN") return false;
      if (!q) return true;
      return `${t.nombre} ${t.codigo} ${t.categoria ?? ""}`.toLowerCase().includes(q);
    });
  }, [tipos, filtro, soloSinVigencia]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, TipoDocumento[]>();
    for (const t of visibles) {
      const clave = t.categoria ?? "Sin categoría";
      mapa.set(clave, [...(mapa.get(clave) ?? []), t]);
    }
    return [...mapa.entries()];
  }, [visibles]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarTipoDocumento(datos);
      setAviso({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
      if (r.ok) setEditando(null);
    });
  };

  const alternar = (t: TipoDocumento) => {
    empezar(async () => {
      const r = await activarTipoDocumento(t.id, !t.activo);
      setAviso({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
    });
  };

  const sinVigencia = tipos.filter((t) => t.activo && t.vigencia_tipo === "SIN").length;

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

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Buscar</Label>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="INE, licencia, médico…"
              className={`${inputCls} w-56`}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={soloSinVigencia}
              onChange={(e) => setSoloSinVigencia(e.target.checked)}
              className="h-4 w-4 accent-brand-red"
            />
            Solo los que no tienen vigencia ({sinVigencia})
          </label>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => setVerCategorias((v) => !v)}>
            {verCategorias ? "Ocultar categorías" : "Categorías"}
          </button>
          <button className={btnPrimary} onClick={() => setEditando(editando === "nuevo" ? null : "nuevo")}>
            {editando === "nuevo" ? "Cancelar" : "+ Tipo de documento"}
          </button>
        </div>
      </div>

      {verCategorias ? <Categorias categorias={categorias} avisar={setAviso} /> : null}

      {editando === "nuevo" ? (
        <Card className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Tipo de documento nuevo</h2>
          <form onSubmit={enviar} className="mt-4">
            <CamposTipo categorias={categorias} />
            <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
              {pendiente ? "Guardando…" : "Crear"}
            </button>
          </form>
        </Card>
      ) : null}

      {visibles.length === 0 ? <Empty>Ningún tipo de documento coincide con eso.</Empty> : null}

      <div className="space-y-6">
        {porCategoria.map(([categoria, lista]) => (
          <section key={categoria}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-soft">{categoria}</h2>
            <div className="overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full">
                <thead className="border-b border-line bg-paper/60">
                  <tr>
                    <th className={thCls}>Documento</th>
                    <th className={thCls}>Vigencia</th>
                    <th className={thCls}>Reglas</th>
                    <th className={thCls}>Acceso</th>
                    <th className={thCls}>Se pide a</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lista.map((t) => (
                    <tr key={t.id} className={t.activo ? "" : "opacity-55"}>
                      <td className={tdCls}>
                        <div className="font-medium">{t.nombre}</div>
                        <div className="font-mono text-[11px] text-soft">{t.codigo}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.obligatorio ? <Badge tono="petrol">Obligatorio</Badge> : <Badge tono="gris">Opcional</Badge>}
                          {t.critico ? <Badge tono="rojo">Crítico</Badge> : null}
                          {t.multiples_vigentes ? <Badge tono="gris">Varios a la vez</Badge> : null}
                          {!t.activo ? <Badge tono="gris">Desactivado</Badge> : null}
                        </div>
                      </td>
                      <td className={tdCls}>
                        <span className={t.vigencia_tipo === "SIN" ? "text-soft" : ""}>{textoVigencia(t)}</span>
                        {t.vigencia_tipo !== "SIN" ? (
                          <div className="text-xs text-soft">Avisa {t.dias_alerta.replace(/,/g, ", ")} días antes</div>
                        ) : null}
                      </td>
                      <td className={`${tdCls} text-xs text-soft`}>
                        {t.requiere_validacion ? "Lo valida RH" : "Sin validación"}
                        {t.requiere_firma_empleado || t.requiere_firma_jefe || t.requiere_firma_rh ? (
                          <div>Requiere firma</div>
                        ) : null}
                        {t.permite_no_aplica ? null : <div>No admite “no aplica”</div>}
                      </td>
                      <td className={tdCls}>
                        {t.confidencialidad === "GENERAL" ? (
                          <span className="text-xs text-soft">General</span>
                        ) : (
                          <Badge tono="ambar">
                            {NIVELES_CONFIDENCIALIDAD.find((n) => n.clave === t.confidencialidad)?.etiqueta ??
                              t.confidencialidad}
                          </Badge>
                        )}
                      </td>
                      <td className={tdCls}>
                        {enMatriz[t.id] ? (
                          <span className="text-sm">
                            {enMatriz[t.id]} {enMatriz[t.id] === 1 ? "regla" : "reglas"}
                          </span>
                        ) : (
                          <span className="text-xs text-soft">A nadie todavía</span>
                        )}
                        {cargados[t.id] ? (
                          <div className="text-xs text-soft">{cargados[t.id]} cargados</div>
                        ) : null}
                      </td>
                      <td className={tdCls}>
                        <div className="flex gap-2">
                          <button className={btnGhost} onClick={() => setEditando(editando === t.id ? null : t.id)}>
                            {editando === t.id ? "Cerrar" : "Editar"}
                          </button>
                          <button className={btnGhost} onClick={() => alternar(t)} disabled={pendiente}>
                            {t.activo ? "Desactivar" : "Reactivar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {lista.map((t) =>
                    editando === t.id ? (
                      <tr key={`e-${t.id}`}>
                        <td colSpan={6} className="bg-paper/50 px-4 py-5">
                          <form onSubmit={enviar}>
                            <input type="hidden" name="id" value={t.id} />
                            <CamposTipo categorias={categorias} tipo={t} />
                            <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
                              {pendiente ? "Guardando…" : "Guardar"}
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
    </>
  );
}

function Interruptor({
  nombre,
  etiqueta,
  ayuda,
  activo,
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: string;
  activo?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-2.5 text-sm">
      {/* El campo oculto hace que el "no" también viaje: si solo va la casilla,
          desmarcarla no manda nada y el valor anterior se queda. */}
      <input type="hidden" name={nombre} value="0" />
      <input
        type="checkbox"
        name={nombre}
        value="1"
        defaultChecked={activo}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-red"
      />
      <span>
        <span className="font-medium text-ink">{etiqueta}</span>
        {ayuda ? <span className="block text-xs text-soft">{ayuda}</span> : null}
      </span>
    </label>
  );
}

function CamposTipo({ categorias, tipo }: { categorias: Categoria[]; tipo?: TipoDocumento }) {
  const [vigencia, setVigencia] = useState(tipo?.vigencia_tipo ?? "SIN");
  const porPlazo = vigencia === "DIAS" || vigencia === "MESES" || vigencia === "ANIOS";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Nombre</Label>
          <input name="nombre" required defaultValue={tipo?.nombre ?? ""} className={inputCls} />
        </div>
        <div>
          <Label>Código interno</Label>
          <input
            name="codigo"
            defaultValue={tipo?.codigo ?? ""}
            placeholder="Se genera solo"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <input name="descripcion" defaultValue={tipo?.descripcion ?? ""} className={inputCls} />
        </div>
        <div>
          <Label>Categoría</Label>
          <select name="categoria_id" defaultValue={tipo?.categoria_id ?? ""} className={inputCls}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-soft">Vigencia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>¿Vence?</Label>
            <select name="vigencia_tipo" value={vigencia} onChange={(e) => setVigencia(e.target.value as never)} className={inputCls}>
              <option value="SIN">No vence</option>
              <option value="FECHA">Sí, con la fecha que trae impresa</option>
              <option value="DIAS">Sí, a los N días de emitido</option>
              <option value="MESES">Sí, a los N meses de emitido</option>
              <option value="ANIOS">Sí, a los N años de emitido</option>
            </select>
          </div>
          {porPlazo ? (
            <div>
              <Label>¿Cuántos?</Label>
              <input
                name="vigencia_valor"
                type="number"
                min={1}
                defaultValue={tipo?.vigencia_valor ?? ""}
                className={inputCls}
              />
            </div>
          ) : (
            <input type="hidden" name="vigencia_valor" value={tipo?.vigencia_valor ?? ""} />
          )}
          <div>
            <Label>Avisar con cuántos días</Label>
            <input name="dias_alerta" defaultValue={tipo?.dias_alerta ?? "60,30,15,7"} className={inputCls} />
            <p className="mt-1 text-xs text-soft">Separados por comas. El mayor marca cuándo pasa a “por vencer”.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Interruptor
            nombre="requiere_emision"
            etiqueta="Pedir la fecha de emisión"
            activo={!!tipo?.requiere_emision}
          />
          <Interruptor
            nombre="requiere_vencimiento"
            etiqueta="Pedir la fecha de vencimiento"
            activo={!!tipo?.requiere_vencimiento}
          />
          <Interruptor
            nombre="requiere_renovacion"
            etiqueta="Hay que renovarlo al vencer"
            activo={!!tipo?.requiere_renovacion}
          />
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <fieldset className="rounded-md border border-line p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-soft">Cómo cuenta</legend>
          <div className="space-y-3">
            <Interruptor
              nombre="obligatorio"
              etiqueta="Obligatorio"
              ayuda="Cuenta para el porcentaje de cumplimiento."
              activo={tipo ? !!tipo.obligatorio : true}
            />
            <Interruptor
              nombre="critico"
              etiqueta="Crítico"
              ayuda="Si falta, el expediente sale en rojo aunque lo demás esté bien."
              activo={!!tipo?.critico}
            />
            <Interruptor
              nombre="permite_no_aplica"
              etiqueta="Admite “no aplica”"
              ayuda="RH puede excusarlo con un motivo, sin que penalice."
              activo={tipo ? !!tipo.permite_no_aplica : true}
            />
            <Interruptor
              nombre="multiples_vigentes"
              etiqueta="Puede haber varios vigentes"
              ayuda="Para DC-3, constancias y certificaciones."
              activo={!!tipo?.multiples_vigentes}
            />
            <Interruptor
              nombre="conserva_versiones"
              etiqueta="Conservar versiones anteriores"
              activo={tipo ? !!tipo.conserva_versiones : true}
            />
            <Interruptor nombre="activo" etiqueta="Activo" activo={tipo ? !!tipo.activo : true} />
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-line p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-soft">Revisión y firma</legend>
          <div className="space-y-3">
            <Interruptor
              nombre="requiere_validacion"
              etiqueta="RH tiene que validarlo"
              ayuda="Mientras no se valide, no cuenta como cumplido."
              activo={tipo ? !!tipo.requiere_validacion : true}
            />
            <Interruptor nombre="requiere_firma_empleado" etiqueta="Lo firma el empleado" activo={!!tipo?.requiere_firma_empleado} />
            <Interruptor nombre="requiere_firma_jefe" etiqueta="Lo firma el jefe directo" activo={!!tipo?.requiere_firma_jefe} />
            <Interruptor nombre="requiere_firma_rh" etiqueta="Lo firma RH" activo={!!tipo?.requiere_firma_rh} />
          </div>
        </fieldset>
      </div>

      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-soft">Quién puede verlo</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Nivel de confidencialidad</Label>
            <select name="confidencialidad" defaultValue={tipo?.confidencialidad ?? "GENERAL"} className={inputCls}>
              {NIVELES_CONFIDENCIALIDAD.map((n) => (
                <option key={n.clave} value={n.clave}>
                  {n.etiqueta}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-soft">
              Todo lo que no sea “general” pide además el permiso de documentos confidenciales.
            </p>
          </div>
          <div className="space-y-3 pt-6">
            <Interruptor
              nombre="visible_empleado"
              etiqueta="El empleado lo ve en su portal"
              activo={tipo ? !!tipo.visible_empleado : true}
            />
            <Interruptor
              nombre="descargable_empleado"
              etiqueta="El empleado puede descargarlo"
              activo={!!tipo?.descargable_empleado}
            />
          </div>
          <div>
            <Label>Responsable</Label>
            <input name="responsable" defaultValue={tipo?.responsable ?? ""} className={inputCls} />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <Label>Formatos permitidos</Label>
          <input name="formatos" defaultValue={tipo?.formatos ?? "pdf,jpg,jpeg,png"} className={inputCls} />
        </div>
        <div>
          <Label>Tamaño máximo (MB)</Label>
          <input name="tam_max_mb" type="number" min={1} max={50} defaultValue={tipo?.tam_max_mb ?? 20} className={inputCls} />
        </div>
        <div>
          <Label>Orden en la lista</Label>
          <input name="orden" type="number" defaultValue={tipo?.orden ?? 0} className={inputCls} />
        </div>
        <div>
          <Label>Notas</Label>
          <input name="notas" defaultValue={tipo?.notas ?? ""} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- categorías

function Categorias({ categorias, avisar }: { categorias: Categoria[]; avisar: (a: Aviso) => void }) {
  const [pendiente, empezar] = useTransition();
  const [editando, setEditando] = useState<number | null>(null);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const forma = e.currentTarget;
    empezar(async () => {
      const r = await guardarCategoria(datos);
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
      if (r.ok) {
        setEditando(null);
        if (!datos.get("id")) forma.reset();
      }
    });
  };

  const borrar = (c: Categoria) => {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    empezar(async () => {
      const r = await eliminarCategoria(c.id);
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
    });
  };

  return (
    <Card className="mb-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Categorías</h2>
      <p className="mt-1 text-sm text-soft">Solo agrupan los documentos en pantalla; no cambian ninguna regla.</p>

      <ul className="mt-4 divide-y divide-line">
        {categorias.map((c) => (
          <li key={c.id} className="py-2.5">
            {editando === c.id ? (
              <form onSubmit={enviar} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={c.id} />
                <div>
                  <Label>Nombre</Label>
                  <input name="nombre" defaultValue={c.nombre} required className={`${inputCls} w-52`} />
                </div>
                <div className="grow">
                  <Label>Descripción</Label>
                  <input name="descripcion" defaultValue={c.descripcion ?? ""} className={inputCls} />
                </div>
                <div>
                  <Label>Orden</Label>
                  <input name="orden" type="number" defaultValue={c.orden} className={`${inputCls} w-20`} />
                </div>
                <button type="submit" disabled={pendiente} className={btnPrimary}>
                  Guardar
                </button>
                <button type="button" className={btnGhost} onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-ink">{c.nombre}</span>
                  {c.descripcion ? <span className="ml-2 text-sm text-soft">{c.descripcion}</span> : null}
                </div>
                <div className="flex gap-2">
                  <button className={btnGhost} onClick={() => setEditando(c.id)}>
                    Editar
                  </button>
                  <button className={btnDanger} onClick={() => borrar(c)}>
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={enviar} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <div>
          <Label>Categoría nueva</Label>
          <input name="nombre" required placeholder="Nombre" className={`${inputCls} w-52`} />
        </div>
        <div className="grow">
          <Label>Descripción</Label>
          <input name="descripcion" className={inputCls} />
        </div>
        <div>
          <Label>Orden</Label>
          <input name="orden" type="number" defaultValue={100} className={`${inputCls} w-20`} />
        </div>
        <button type="submit" disabled={pendiente} className={btnPrimary}>
          Agregar
        </button>
      </form>
    </Card>
  );
}
