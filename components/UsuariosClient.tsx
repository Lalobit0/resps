"use client";

import { useState, useTransition } from "react";
import { crearUsuario, editarUsuario, eliminarRol, guardarRol, restablecerClave } from "../app/configuracion/usuarios/actions";
import { GRUPOS_PERMISO, permisosDelGrupo } from "../lib/permisos";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

export type UsuarioFila = {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  rol_id: number;
  rol_nombre: string;
  todo: number;
  activo: number;
  debe_cambiar: number;
  ultimo_acceso: string | null;
  sesiones: number;
};

export type RolFila = {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  todo: number;
  sistema: number;
  activo: number;
  personas: number;
};

type Aviso = { ok: boolean; texto: string } | null;

/** Contraseña temporal legible: se la dictas a la persona por teléfono. */
function claveSugerida(): string {
  const silabas = ["ka", "lo", "mi", "ru", "te", "sa", "vi", "no", "pa", "de"];
  const p = Array.from({ length: 3 }, () => silabas[Math.floor(Math.random() * silabas.length)]).join("");
  return `${p.charAt(0).toUpperCase()}${p.slice(1)}${Math.floor(Math.random() * 9000) + 1000}`;
}

export default function UsuariosClient({
  usuarios,
  roles,
  permisosPorRol,
  empleados,
  miId,
}: {
  usuarios: UsuarioFila[];
  roles: RolFila[];
  permisosPorRol: Record<number, string[]>;
  empleados: { id: number; nombre: string; numero_empleado: string }[];
  miId: number;
}) {
  const [pestana, setPestana] = useState<"personas" | "roles">("personas");
  const [aviso, setAviso] = useState<Aviso>(null);

  return (
    <>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ["personas", `Personas (${usuarios.length})`],
            ["roles", `Roles y permisos (${roles.length})`],
          ] as const
        ).map(([clave, etiqueta]) => (
          <button
            key={clave}
            onClick={() => {
              setPestana(clave);
              setAviso(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === clave ? "border-brand-red text-ink" : "border-transparent text-soft hover:text-ink"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

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

      {pestana === "personas" ? (
        <Personas usuarios={usuarios} roles={roles} empleados={empleados} miId={miId} avisar={setAviso} />
      ) : (
        <Roles roles={roles} permisosPorRol={permisosPorRol} avisar={setAviso} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ personas

function Personas({
  usuarios,
  roles,
  empleados,
  miId,
  avisar,
}: {
  usuarios: UsuarioFila[];
  roles: RolFila[];
  empleados: { id: number; nombre: string; numero_empleado: string }[];
  miId: number;
  avisar: (a: Aviso) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [claveDe, setClaveDe] = useState<number | null>(null);
  const [pendiente, empezar] = useTransition();

  const enviar = (accion: (d: FormData) => Promise<{ ok: boolean; error?: string; mensaje?: string }>, cerrar: () => void) => (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await accion(datos);
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
      if (r.ok) cerrar();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setNuevo((v) => !v)}>
          {nuevo ? "Cancelar" : "+ Nueva persona"}
        </button>
      </div>

      {nuevo ? (
        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Dar de alta a alguien</h2>
          <form onSubmit={enviar(crearUsuario, () => setNuevo(false))} className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <Label>Usuario</Label>
              <input name="usuario" required placeholder="ana.lopez" className={inputCls} />
              <p className="mt-1 text-xs text-soft">Con esto entra. Minúsculas, sin espacios.</p>
            </div>
            <div>
              <Label>Nombre completo</Label>
              <input name="nombre" required placeholder="Ana López" className={inputCls} />
            </div>
            <div>
              <Label>Correo</Label>
              <input name="correo" type="email" className={inputCls} />
            </div>
            <div>
              <Label>Rol</Label>
              <select name="rol_id" required defaultValue="" className={inputCls}>
                <option value="" disabled>
                  Elige…
                </option>
                {roles
                  .filter((r) => r.activo)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Contraseña temporal</Label>
              <input name="clave" required defaultValue={claveSugerida()} className={inputCls} />
              <p className="mt-1 text-xs text-soft">Se la va a pedir cambiar al entrar.</p>
            </div>
            <div>
              <Label>¿Es empleado de la empresa?</Label>
              <select name="empleado_id" defaultValue="" className={inputCls}>
                <option value="">No ligarlo a nadie</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numero_empleado} · {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={pendiente} className={btnPrimary}>
                {pendiente ? "Guardando…" : "Crear la cuenta"}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full">
          <thead className="border-b border-line bg-paper/60">
            <tr>
              <th className={thCls}>Persona</th>
              <th className={thCls}>Usuario</th>
              <th className={thCls}>Rol</th>
              <th className={thCls}>Estado</th>
              <th className={thCls}>Último acceso</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? "" : "opacity-60"}>
                <td className={tdCls}>
                  <span className="font-medium">{u.nombre}</span>
                  {u.correo ? <div className="text-xs text-soft">{u.correo}</div> : null}
                </td>
                <td className={`${tdCls} font-mono text-xs`}>{u.usuario}</td>
                <td className={tdCls}>{u.rol_nombre}</td>
                <td className={tdCls}>
                  <div className="flex flex-wrap gap-1">
                    <Badge tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Desactivado"}</Badge>
                    {u.debe_cambiar ? <Badge tono="ambar">Contraseña temporal</Badge> : null}
                    {u.sesiones > 0 ? <Badge tono="petrol">Dentro</Badge> : null}
                  </div>
                </td>
                <td className={`${tdCls} whitespace-nowrap text-soft`}>{u.ultimo_acceso ?? "Nunca"}</td>
                <td className={tdCls}>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={btnGhost}
                      onClick={() => {
                        setEditando(editando === u.id ? null : u.id);
                        setClaveDe(null);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className={btnGhost}
                      onClick={() => {
                        setClaveDe(claveDe === u.id ? null : u.id);
                        setEditando(null);
                      }}
                    >
                      Contraseña
                    </button>
                  </div>

                  {editando === u.id ? (
                    <form onSubmit={enviar(editarUsuario, () => setEditando(null))} className="mt-3 grid gap-3 md:grid-cols-4">
                      <input type="hidden" name="id" value={u.id} />
                      <div>
                        <Label>Nombre</Label>
                        <input name="nombre" defaultValue={u.nombre} required className={inputCls} />
                      </div>
                      <div>
                        <Label>Correo</Label>
                        <input name="correo" type="email" defaultValue={u.correo ?? ""} className={inputCls} />
                      </div>
                      <div>
                        <Label>Rol</Label>
                        <select name="rol_id" defaultValue={u.rol_id} className={inputCls}>
                          {roles
                            .filter((r) => r.activo || r.id === u.rol_id)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <Label>Puede entrar</Label>
                        <select name="activo" defaultValue={u.activo} className={inputCls} disabled={u.id === miId}>
                          <option value="1">Sí</option>
                          <option value="0">No</option>
                        </select>
                        {u.id === miId ? <p className="mt-1 text-xs text-soft">No puedes desactivarte tú.</p> : null}
                      </div>
                      <div className="md:col-span-4">
                        <button type="submit" disabled={pendiente} className={btnPrimary}>
                          Guardar
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {claveDe === u.id ? (
                    <form onSubmit={enviar(restablecerClave, () => setClaveDe(null))} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={u.id} />
                      <div>
                        <Label>Contraseña temporal nueva</Label>
                        <input name="clave" required defaultValue={claveSugerida()} className={`${inputCls} w-56`} />
                      </div>
                      <button type="submit" disabled={pendiente} className={btnDanger}>
                        Restablecer y cerrar sus sesiones
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- roles

function Roles({
  roles,
  permisosPorRol,
  avisar,
}: {
  roles: RolFila[];
  permisosPorRol: Record<number, string[]>;
  avisar: (a: Aviso) => void;
}) {
  const [abierto, setAbierto] = useState<number | "nuevo" | null>(null);
  const [pendiente, empezar] = useTransition();

  const enviar = (accion: (d: FormData) => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await accion(datos);
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
      if (r.ok) setAbierto(null);
    });
  };

  const borrar = (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar el rol "${nombre}"?`)) return;
    const datos = new FormData();
    datos.set("id", String(id));
    empezar(async () => {
      const r = await eliminarRol(datos);
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setAbierto(abierto === "nuevo" ? null : "nuevo")}>
          {abierto === "nuevo" ? "Cancelar" : "+ Nuevo rol"}
        </button>
      </div>

      {abierto === "nuevo" ? (
        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Rol nuevo</h2>
          <form onSubmit={enviar(guardarRol)} className="mt-4">
            <FormaRol />
            <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
              Crear rol
            </button>
          </form>
        </Card>
      ) : null}

      {roles.length === 0 ? <Empty>No hay roles configurados.</Empty> : null}

      {roles.map((r) => {
        const permisos = permisosPorRol[r.id] ?? [];
        return (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{r.nombre}</h3>
                  {r.todo ? <Badge tono="rojo">Puede todo</Badge> : null}
                  {r.sistema ? <Badge tono="gris">De fábrica</Badge> : null}
                  <Badge tono="petrol">
                    {r.personas} {r.personas === 1 ? "persona" : "personas"}
                  </Badge>
                </div>
                {r.descripcion ? <p className="mt-1 max-w-2xl text-sm text-soft">{r.descripcion}</p> : null}
                {!r.todo ? (
                  <p className="mt-2 text-xs text-soft">
                    {permisos.length} {permisos.length === 1 ? "permiso" : "permisos"}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                {!r.todo ? (
                  <button className={btnGhost} onClick={() => setAbierto(abierto === r.id ? null : r.id)}>
                    {abierto === r.id ? "Cerrar" : "Editar permisos"}
                  </button>
                ) : null}
                {!r.sistema ? (
                  <button className={btnDanger} onClick={() => borrar(r.id, r.nombre)}>
                    Eliminar
                  </button>
                ) : null}
              </div>
            </div>

            {abierto === r.id ? (
              <form onSubmit={enviar(guardarRol)} className="mt-5 border-t border-line pt-5">
                <input type="hidden" name="id" value={r.id} />
                <FormaRol nombre={r.nombre} descripcion={r.descripcion ?? ""} marcados={permisos} />
                <button type="submit" disabled={pendiente} className={`${btnPrimary} mt-5`}>
                  {pendiente ? "Guardando…" : "Guardar permisos"}
                </button>
              </form>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function FormaRol({
  nombre = "",
  descripcion = "",
  marcados = [],
}: {
  nombre?: string;
  descripcion?: string;
  marcados?: string[];
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Nombre del rol</Label>
          <input name="nombre" required defaultValue={nombre} className={inputCls} />
        </div>
        <div>
          <Label>Para qué sirve</Label>
          <input name="descripcion" defaultValue={descripcion} className={inputCls} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {GRUPOS_PERMISO.map((grupo) => (
          <fieldset key={grupo} className="rounded-md border border-line p-4">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-soft">{grupo}</legend>
            <div className="space-y-2.5">
              {permisosDelGrupo(grupo).map((p) => (
                <label key={p.clave} className="flex cursor-pointer gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="permisos"
                    value={p.clave}
                    defaultChecked={marcados.includes(p.clave)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-red"
                  />
                  <span>
                    <span className="font-medium text-ink">{p.nombre}</span>
                    <span className="block text-xs text-soft">{p.ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}
