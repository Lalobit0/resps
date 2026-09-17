"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { cambiarEstadoGafete, eliminarGafete, guardarGafete, importarGafetes } from "../app/gafetes/actions";
import {
  ESTADOS_GAFETE,
  ETIQUETA_ESTADO_GAFETE,
  TONO_ESTADO_GAFETE,
  detallePerfiles,
  difiereDelPerfil,
  puertasDePerfiles,
  textoPerfiles,
  type Gafete,
  type PerfilGafete,
  type Puerta,
} from "../lib/gafetes-comun";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls, tdCls, thCls } from "./ui";

type Persona = { id: number; numero_empleado: string; nombre: string; puesto: string | null; departamento: string | null };

/**
 * La matriz de gafetes de acceso.
 *
 * Es el formato FRH-14 puesto en pantalla: una línea por gafete, con quién lo
 * trae y qué puertas abre. Lo que el Excel no podía hacer es lo que aquí se
 * gana —cruzarlo con la plantilla—: si alguien ya no trabaja aquí y su gafete
 * sigue activo, se ve de un vistazo.
 */
export default function GafetesClient({
  lista,
  puertas,
  perfiles,
  personas,
}: {
  lista: Gafete[];
  puertas: Puerta[];
  perfiles: PerfilGafete[];
  personas: Persona[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Gafete | "nuevo" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("");
  const [depto, setDepto] = useState("");
  const [perfil, setPerfil] = useState("");
  const [puerta, setPuerta] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);

  // Las áreas que de verdad aparecen, para no ofrecer un filtro vacío.
  const departamentos = useMemo(
    () => [...new Set(lista.map((g) => g.departamento).filter((d): d is string => !!d))].sort(),
    [lista]
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const nPuerta = Number(puerta);
    return lista.filter((g) => {
      if (filtro === "activos" && g.estado !== "ACTIVO") return false;
      if (filtro === "por_recoger" && g.estado !== "POR_RECOGER") return false;
      if (filtro === "sin_dueno" && g.empleado_id) return false;
      if (filtro === "difieren" && !hayDiferencia(g)) return false;
      if (depto && g.departamento !== depto) return false;
      if (perfil === "__sin__" ? g.perfiles.length > 0 : perfil && !g.perfiles.includes(perfil)) return false;
      if (nPuerta && !g.puertas.includes(nPuerta)) return false;
      if (!q) return true;
      return `${g.numero} ${g.nombre ?? ""} ${g.numero_empleado ?? ""} ${g.puesto ?? ""} ${g.departamento ?? ""} ${g.perfiles.join("")}`
        .toLowerCase()
        .includes(q);
    });
  }, [lista, busqueda, filtro, depto, perfil, puerta]);

  const hayFiltro = !!(busqueda.trim() || filtro || depto || perfil || puerta);
  const limpiar = () => {
    setBusqueda("");
    setFiltro("");
    setDepto("");
    setPerfil("");
    setPuerta("");
  };

  function hayDiferencia(g: Gafete) {
    const d = difiereDelPerfil(g, perfiles);
    return d.demas.length > 0 || d.faltan.length > 0;
  }

  /**
   * La matriz es de quien trabaja aquí. Quien ya se fue estorba en ella —son
   * renglones que nadie va a volver a tocar— pero no se puede simplemente
   * esconder: su tarjeta sigue existiendo. Así que se va a su propia lista,
   * abajo, donde lo que importa es si todavía abre.
   */
  const salio = (g: Gafete) => g.empleado_activo === 0;

  const enPlantilla = useMemo(() => visibles.filter((g) => !salio(g)), [visibles]);

  const deSalidos = useMemo(
    () =>
      // Primero los que siguen abriendo, que son los que hay que ir a recoger.
      [...visibles.filter(salio)].sort(
        (a, b) => Number(b.estado === "ACTIVO") - Number(a.estado === "ACTIVO") || a.numero.localeCompare(b.numero)
      ),
    [visibles]
  );

  const totalPlantilla = useMemo(() => lista.filter((g) => !salio(g)).length, [lista]);
  const totalSalidos = lista.length - totalPlantilla;

  const deBajas = useMemo(() => lista.filter((g) => g.estado === "ACTIVO" && g.empleado_activo === 0), [lista]);

  const ejecutar = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      setAviso({ ok: r.ok, texto: r.ok ? (r.mensaje ?? "Listo.") : (r.error ?? "No se pudo.") });
      if (r.ok) {
        setForm(null);
        router.refresh();
      }
    });

  const subir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("archivo", f);
    e.target.value = "";
    ejecutar(() => importarGafetes(fd));
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

      {deBajas.length > 0 ? (
        <Card className="mb-5 border-red-300 bg-red-50">
          <h2 className="font-bold text-red-900">
            {deBajas.length} {deBajas.length === 1 ? "gafete sigue activo" : "gafetes siguen activos"} y su dueño ya no
            trabaja aquí
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-red-900">
            La tarjeta sigue abriendo hasta que alguien la quite del lector: {deBajas.map((g) => g.numero).join(", ")}.
          </p>
          <a href="#salidos" className={`${btnGhost} mt-3 inline-flex`}>
            Ver la lista de abajo ↓
          </a>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Gafete, nombre, número, puesto o perfil…"
          className={`${inputCls} max-w-xs`}
        />
        <select className={`${inputCls} max-w-[210px]`} value={depto} onChange={(e) => setDepto(e.target.value)}>
          <option value="">Todas las áreas</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[230px]`} value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          <option value="">Todos los perfiles</option>
          {perfiles.map((p) => (
            <option key={p.id} value={p.clave}>
              {p.clave} · {p.nombre}
            </option>
          ))}
          <option value="__sin__">Sin perfil</option>
        </select>
        <select className={`${inputCls} max-w-[210px]`} value={puerta} onChange={(e) => setPuerta(e.target.value)}>
          <option value="">Cualquier puerta</option>
          {puertas.map((p) => (
            <option key={p.id} value={p.numero}>
              Abre la ({p.numero}) {p.nombre}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[220px]`} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Cualquier situación</option>
          <option value="activos">Solo activos</option>
          <option value="por_recoger">Por recoger</option>
          <option value="sin_dueno">Sin asignar</option>
          <option value="difieren">No cuadran con su perfil</option>
        </select>
        {hayFiltro ? (
          <button className={btnGhost} onClick={limpiar}>
            ✕ Quitar filtros
          </button>
        ) : null}
        <input ref={archivo} type="file" accept=".xlsx,.xls" className="hidden" onChange={subir} />
        <button className={btnGhost} disabled={pendiente} onClick={() => archivo.current?.click()}>
          {pendiente ? "Procesando…" : "↥ Importar matriz"}
        </button>
        <Link href="/gafetes/configuracion" className={btnGhost}>
          Puertas y perfiles
        </Link>
        <button className={btnPrimary} onClick={() => setForm("nuevo")}>
          + Asignar gafete
        </button>
      </div>

      {form ? (
        <FormaGafete
          gafete={form === "nuevo" ? null : form}
          puertas={puertas}
          perfiles={perfiles}
          personas={personas}
          pendiente={pendiente}
          onCancelar={() => setForm(null)}
          onGuardar={(fd) => ejecutar(() => guardarGafete(fd))}
        />
      ) : null}

      {/* --- Qué es cada columna y qué es cada letra --- */}
      <Card className="mb-3 py-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-soft">
          Las puertas, por número
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {puertas.map((p) => (
            <li key={p.id} className={`text-sm ${p.activo ? "text-ink" : "text-soft line-through"}`}>
              <span className="font-bold text-kraft-dark">({p.numero})</span> {p.nombre}
            </li>
          ))}
        </ul>

        {/* La columna de perfil dice "D y F" y ahí se acaba: sin esto hay que
            irse a la configuración para saber qué abre cada letra. */}
        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-soft">
          Los perfiles, por letra
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {perfiles.map((p) => (
            <li key={p.id} className={`text-sm ${p.activo ? "text-ink" : "text-soft line-through"}`}>
              <span className="font-bold text-kraft-dark">{p.clave}</span> {p.nombre}
              <span className="text-soft">
                {" "}
                · {p.puertas.length ? `abre la ${p.puertas.map((n) => `(${n})`).join(", ")}` : "sin puertas"}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mb-2 text-xs text-soft">
        {enPlantilla.length} de {totalPlantilla} gafetes de quien trabaja aquí
        {puerta
          ? ` · quiénes abren la (${puerta}) ${puertas.find((p) => String(p.numero) === puerta)?.nombre ?? ""}`
          : ""}
      </p>

      {enPlantilla.length === 0 ? (
        <Empty>
          {lista.length === 0
            ? "Todavía no hay gafetes. Sube la matriz del formato FRH-14 o asigna el primero a mano."
            : "Ningún gafete de la plantilla coincide con eso."}
        </Empty>
      ) : (
        <TablaGafetes
          filas={enPlantilla}
          puertas={puertas}
          perfiles={perfiles}
          pendiente={pendiente}
          onEditar={setForm}
          onEstado={(id, estado) => ejecutar(() => cambiarEstadoGafete(id, estado))}
          onBorrar={(id) => ejecutar(() => eliminarGafete(id))}
        />
      )}

      {/* --- Los que ya no trabajan aquí, aparte --- */}
      {totalSalidos > 0 ? (
        <section id="salidos" className="mt-8">
          <h2 className="text-base font-bold text-ink">
            Gafetes de quien ya no trabaja aquí
            <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold normal-case text-soft">
              {hayFiltro ? `${deSalidos.length} de ${totalSalidos}` : totalSalidos}
            </span>
          </h2>
          <p className="mb-2 mt-1 max-w-3xl text-xs text-soft">
            Salen de la matriz de arriba porque ya no son plantilla, pero la tarjeta existe: mientras diga{" "}
            <b>Activo</b> o <b>Por recoger</b> sigue abriendo, hasta que alguien la quite del lector. Con{" "}
            <b>Recogido</b> se marca que ya se recuperó.
          </p>
          {deSalidos.length === 0 ? (
            <Empty>Ninguno de ellos coincide con los filtros de arriba.</Empty>
          ) : (
            <TablaGafetes
              filas={deSalidos}
              puertas={puertas}
              perfiles={perfiles}
              pendiente={pendiente}
              resaltarActivos
              onEditar={setForm}
              onEstado={(id, estado) => ejecutar(() => cambiarEstadoGafete(id, estado))}
              onBorrar={(id) => ejecutar(() => eliminarGafete(id))}
            />
          )}
        </section>
      ) : null}
    </>
  );
}

/**
 * La cuadrícula del FRH-14: una línea por gafete y una columna por puerta.
 *
 * Se usa dos veces —la plantilla y los que ya se fueron— y son la misma tabla:
 * lo único que cambia es que en la segunda un gafete todavía activo se pinta
 * en rojo, porque ahí sí es un pendiente.
 */
function TablaGafetes({
  filas,
  puertas,
  perfiles,
  pendiente,
  resaltarActivos = false,
  onEditar,
  onEstado,
  onBorrar,
}: {
  filas: Gafete[];
  puertas: Puerta[];
  perfiles: PerfilGafete[];
  pendiente: boolean;
  resaltarActivos?: boolean;
  onEditar: (g: Gafete) => void;
  onEstado: (id: number, estado: string) => void;
  onBorrar: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full">
        <thead className="border-b border-line bg-paper/60">
          <tr>
            <th className={thCls}>Gafete</th>
            <th className={`${thCls} min-w-[15rem]`}>Quién lo trae</th>
            <th className={thCls}>Perfil</th>
            {puertas.map((p) => (
              <th key={p.id} className={`${thCls} px-1 text-center align-bottom`} title={p.nombre}>
                <span className="block text-sm text-ink">({p.numero})</span>
                {/* El nombre completo cabe de lado: nueve columnas no dan
                    para escribirlo horizontal sin partir la tabla. */}
                <span
                  className="mx-auto mt-1 block whitespace-nowrap text-[10px] font-medium normal-case text-soft"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: "6.5rem" }}
                >
                  {p.nombre}
                </span>
              </th>
            ))}
            <th className={thCls}>Estado</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((g) => {
            const dif = difiereDelPerfil(g, perfiles);
            const abre = new Set(g.puertas);
            // En la lista de salidos, seguir abriendo es lo que hay que ver.
            const pendienteDeRecoger = resaltarActivos && (g.estado === "ACTIVO" || g.estado === "POR_RECOGER");
            return (
              <tr key={g.id} className={pendienteDeRecoger ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-paper/40"}>
                <td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{g.numero}</td>
                <td className={tdCls}>
                  {g.nombre ? (
                    <>
                      <Link href={`/empleados/${g.empleado_id}`} className="font-medium underline decoration-line">
                        {g.nombre}
                      </Link>
                      <div className="text-xs text-soft">
                        {g.numero_empleado}
                        {g.puesto ? ` · ${g.puesto}` : ""}
                        {g.departamento ? ` · ${g.departamento}` : ""}
                      </div>
                      {g.empleado_activo === 0 ? <Badge tono="rojo">Ya no trabaja aquí</Badge> : null}
                    </>
                  ) : (
                    <span className="text-soft">Sin asignar</span>
                  )}
                </td>
                <td className={tdCls}>
                  <span
                    className="cursor-help font-semibold text-ink underline decoration-line decoration-dotted underline-offset-2"
                    title={detallePerfiles(g.perfiles, perfiles)}
                  >
                    {textoPerfiles(g.perfiles)}
                  </span>
                  {dif.demas.length || dif.faltan.length ? (
                    <div className="mt-0.5 text-xs text-amber-700" title="Lo que abre no es lo que dice su perfil">
                      {dif.demas.length ? `+${dif.demas.join(",")}` : ""}
                      {dif.demas.length && dif.faltan.length ? " " : ""}
                      {dif.faltan.length ? `−${dif.faltan.join(",")}` : ""}
                    </div>
                  ) : null}
                </td>
                {puertas.map((p) => (
                  <td key={p.id} className="px-2 py-2.5 text-center">
                    {abre.has(p.numero) ? (
                      <span className="font-bold text-kraft-dark" title={p.nombre}>
                        ✕
                      </span>
                    ) : (
                      <span className="text-line">·</span>
                    )}
                  </td>
                ))}
                <td className={tdCls}>
                  <Badge tono={(TONO_ESTADO_GAFETE[g.estado] ?? "gris") as never}>
                    {ETIQUETA_ESTADO_GAFETE[g.estado] ?? g.estado}
                  </Badge>
                </td>
                <td className={`${tdCls} whitespace-nowrap`}>
                  {/* Nueve columnas de puertas dejan poco ancho: las
                      acciones van en una sola línea y compactas. */}
                  <div className="flex items-center gap-1">
                    <button className={btnGhost} onClick={() => onEditar(g)}>
                      Editar
                    </button>
                    {g.estado === "ACTIVO" || g.estado === "POR_RECOGER" ? (
                      <button
                        className={btnGhost}
                        disabled={pendiente}
                        title="Marcar que la tarjeta ya se recuperó"
                        onClick={() => onEstado(g.id, "RECOGIDO")}
                      >
                        Recogido
                      </button>
                    ) : null}
                    <button
                      className={btnDanger}
                      disabled={pendiente}
                      title={`Borrar el gafete ${g.numero}`}
                      onClick={() => {
                        if (!confirm(`Se va a borrar el gafete ${g.numero} del sistema.\n\n¿Continuar?`)) return;
                        onBorrar(g.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El alta o la edición de un gafete.
 *
 * El perfil manda: al marcarlo se prenden sus puertas. Pero las puertas se
 * pueden tocar aparte, porque en el formato de papel hay gafetes con una
 * puerta de más que su perfil, y eso también hay que poder registrarlo.
 */
function FormaGafete({
  gafete,
  puertas,
  perfiles,
  personas,
  pendiente,
  onCancelar,
  onGuardar,
}: {
  gafete: Gafete | null;
  puertas: Puerta[];
  perfiles: PerfilGafete[];
  personas: Persona[];
  pendiente: boolean;
  onCancelar: () => void;
  onGuardar: (fd: FormData) => void;
}) {
  const [claves, setClaves] = useState<string[]>(gafete?.perfiles ?? []);
  const [abre, setAbre] = useState<number[]>(gafete?.puertas ?? []);
  const [quien, setQuien] = useState<string>(gafete?.empleado_id ? String(gafete.empleado_id) : "");
  const [buscaPersona, setBuscaPersona] = useState("");

  const elegida = personas.find((p) => String(p.id) === quien) ?? null;
  const sugerencias = useMemo(() => {
    const partes = buscaPersona.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!partes.length) return [];
    return personas
      .filter((p) =>
        partes.every((t) =>
          `${p.numero_empleado} ${p.nombre} ${p.puesto ?? ""} ${p.departamento ?? ""}`.toLowerCase().includes(t)
        )
      )
      .slice(0, 30);
  }, [personas, buscaPersona]);

  const alternarPerfil = (clave: string) => {
    const nuevas = claves.includes(clave) ? claves.filter((c) => c !== clave) : [...claves, clave];
    setClaves(nuevas);
    // El perfil propone las puertas: se prenden las suyas y se apagan las que
    // solo venían del perfil que se quitó.
    setAbre(puertasDePerfiles(nuevas, perfiles));
  };

  const sugeridas = puertasDePerfiles(claves, perfiles);
  const difiere = abre.slice().sort().join(",") !== sugeridas.join(",");

  return (
    <Card className="mb-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-soft">
        {gafete ? `Gafete ${gafete.numero}` : "Asignar un gafete"}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(new FormData(e.currentTarget));
        }}
      >
        {gafete ? <input type="hidden" name="id" value={gafete.id} /> : null}
        <input type="hidden" name="empleado_id" value={quien} />
        {claves.map((c) => (
          <input key={c} type="hidden" name="perfiles" value={c} />
        ))}
        {abre.map((n) => (
          <input key={n} type="hidden" name="puertas" value={n} />
        ))}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Número de gafete *</Label>
            <input name="numero" required defaultValue={gafete?.numero ?? ""} className={inputCls} placeholder="4816496" />
          </div>
          <div className="sm:col-span-2">
            <Label>¿Quién lo trae?</Label>
            {elegida ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-paper/60 px-3 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium text-ink">{elegida.nombre}</span>
                  <span className="block text-xs text-soft">
                    {elegida.numero_empleado}
                    {elegida.puesto ? ` · ${elegida.puesto}` : ""}
                    {elegida.departamento ? ` · ${elegida.departamento}` : ""}
                  </span>
                </span>
                <button type="button" className={btnGhost} onClick={() => setQuien("")}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  value={buscaPersona}
                  onChange={(e) => setBuscaPersona(e.target.value)}
                  placeholder="🔍 Busca por nombre, número o puesto…"
                  className={inputCls}
                />
                {buscaPersona.trim() ? (
                  sugerencias.length === 0 ? (
                    <p className="mt-1 text-xs text-soft">Nadie de la plantilla coincide con eso.</p>
                  ) : (
                    <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-line bg-card">
                      {sugerencias.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setQuien(String(p.id));
                              setBuscaPersona("");
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper"
                          >
                            <span>
                              {p.nombre}
                              <span className="block text-xs text-soft">
                                {p.numero_empleado}
                                {p.departamento ? ` · ${p.departamento}` : ""}
                              </span>
                            </span>
                            {p.puesto ? <Badge tono="gris">{p.puesto}</Badge> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <p className="mt-1 text-xs text-soft">Se puede dejar sin asignar: un gafete de visitante, o de repuesto.</p>
                )}
              </>
            )}
          </div>
          <div>
            <Label>Estado</Label>
            <select name="estado" defaultValue={gafete?.estado ?? "ACTIVO"} className={inputCls}>
              {ESTADOS_GAFETE.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Se entregó el</Label>
            <input type="date" name="fecha_alta" defaultValue={gafete?.fecha_alta ?? ""} className={inputCls} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Notas</Label>
            <input name="notas" defaultValue={gafete?.notas ?? ""} className={inputCls} />
          </div>
        </div>

        <div className="mt-4">
          <Label>Perfil de acceso</Label>
          <div className="flex flex-wrap gap-2">
            {perfiles.map((p) => {
              const puesto = claves.includes(p.clave);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => alternarPerfil(p.clave)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    puesto ? "border-kraft bg-white shadow-sm" : "border-line bg-paper/60 hover:border-kraft/50"
                  }`}
                >
                  <span className="font-bold text-ink">{p.clave}</span>
                  <span className="ml-2 text-xs text-soft">{p.nombre}</span>
                  <span className="block text-[11px] text-soft">
                    Puertas {p.puertas.join(", ") || "ninguna"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <Label>Qué puertas abre</Label>
          <div className="flex flex-wrap gap-2">
            {puertas.map((p) => {
              const marcada = abre.includes(p.numero);
              const deSuPerfil = sugeridas.includes(p.numero);
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    marcada ? "border-kraft bg-white" : "border-line bg-paper/60"
                  } ${marcada !== deSuPerfil ? "ring-1 ring-amber-400" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() =>
                      setAbre((a) => (a.includes(p.numero) ? a.filter((n) => n !== p.numero) : [...a, p.numero]))
                    }
                  />
                  <span>
                    <span className="font-semibold text-ink">({p.numero})</span> {p.nombre}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-soft">
            {claves.length === 0
              ? "Elige un perfil arriba y se prenden solas; también se pueden marcar a mano."
              : difiere
                ? "⚠️ Lo marcado no es lo que abre su perfil. Queda así a propósito y se señala en la matriz."
                : `Es justo lo que abre el perfil ${textoPerfiles(claves)}.`}
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="submit" className={btnPrimary} disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" className={btnGhost} onClick={onCancelar} disabled={pendiente}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
