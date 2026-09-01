"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  agregarNota,
  agregarRequisito,
  archivarDocumento,
  cargarDocumento,
  editarMetadatos,
  eliminarNota,
  marcarNoAplica,
  quitarNoAplica,
  quitarRequisito,
  rechazarDocumento,
  recalcularRequisitos,
  restaurarDocumento,
  validarDocumento,
} from "../app/expedientes/actions";
import {
  ETIQUETA_ESTADO_DOC,
  MOTIVOS_RECHAZO,
  TONO_ESTADO_DOC,
  type Cumplimiento,
  type MovimientoExpediente,
  type RequisitoVista,
  type TipoDocumento,
  type VersionDocumento,
} from "../lib/expedientes-comun";
import { fechaCorta, tamanoLegible } from "../lib/helpers";
import type { Empleado } from "../lib/types";
import { Badge, Card, Empty, Label, btnDanger, btnGhost, btnPrimary, inputCls } from "./ui";

type Permisos = {
  cargar: boolean;
  validar: boolean;
  rechazar: boolean;
  verDocumentos: boolean;
  verConfidencial: boolean;
  descargar: boolean;
  editarMetadatos: boolean;
  eliminar: boolean;
  noAplica: boolean;
  requisitos: boolean;
  comentar: boolean;
  editarEmpleado: boolean;
};

type Nota = {
  id: number;
  texto: string;
  visibilidad: string;
  autor: string | null;
  fecha: string;
  documento_id: number | null;
};

type Archivado = {
  id: number;
  archivado_motivo: string | null;
  archivado_por: string | null;
  archivado_en: string | null;
  tipo_nombre: string;
};

type Aviso = { ok: boolean; texto: string } | null;
type Pestana = "resumen" | "documentos" | "historial" | "notas";

/** El porcentaje en grande, con el color del semáforo y el número siempre visible. */
function Anillo({ porcentaje, nivel }: { porcentaje: number; nivel: string }) {
  const color = nivel === "CRITICO" ? "#dc2626" : nivel === "COMPLETO" ? "#059669" : "#d97706";
  const r = 34;
  const circunferencia = 2 * Math.PI * r;
  const avance = (Math.min(Math.max(porcentaje, 0), 100) / 100) * circunferencia;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e6ee" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${avance} ${circunferencia}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-ink">{porcentaje}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-soft">completo</span>
      </div>
    </div>
  );
}

export default function ExpedienteClient({
  empleado,
  requisitos,
  cumplimiento,
  historial,
  notas,
  archivados,
  disponibles,
  permisos,
  yo,
}: {
  empleado: Empleado;
  requisitos: RequisitoVista[];
  cumplimiento: Cumplimiento;
  historial: MovimientoExpediente[];
  notas: Nota[];
  archivados: Archivado[];
  disponibles: TipoDocumento[];
  permisos: Permisos;
  yo: string;
}) {
  const [pestana, setPestana] = useState<Pestana>("documentos");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, empezar] = useTransition();

  const correr = (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) =>
    empezar(async () => {
      const r = await accion();
      setAviso({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
    });

  const pendientes = requisitos.filter((r) => !r.cubierto);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/expedientes" className="text-sm text-soft underline">
          ← Todos los expedientes
        </Link>
        {permisos.requisitos ? (
          <button
            className={btnGhost}
            disabled={pendiente}
            onClick={() => correr(() => recalcularRequisitos(empleado.id))}
          >
            Recalcular contra la matriz
          </button>
        ) : null}
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-6">
          <Anillo porcentaje={cumplimiento.porcentaje} nivel={cumplimiento.nivel} />
          <div className="min-w-0 grow">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{empleado.nombre}</h1>
              {cumplimiento.nivel === "CRITICO" ? <Badge tono="rojo">Crítico</Badge> : null}
              {cumplimiento.nivel === "COMPLETO" ? <Badge tono="verde">Completo</Badge> : null}
              {!empleado.activo ? <Badge tono="gris">Baja</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-soft">
              <span className="font-mono">{empleado.numero_empleado}</span> · {empleado.puesto} ·{" "}
              {empleado.departamento}
              {empleado.area ? ` · ${empleado.area}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-soft">
              Ingresó el {fechaCorta(empleado.fecha_alta)}
              {empleado.fecha_baja ? ` · Baja el ${fechaCorta(empleado.fecha_baja)}` : ""}
            </p>
            <p className="mt-3 text-sm text-ink">
              <b>
                {cumplimiento.obligatoriosCubiertos} de {cumplimiento.obligatorios}
              </b>{" "}
              documentos obligatorios en regla
              {cumplimiento.total > cumplimiento.obligatorios
                ? ` · ${cumplimiento.total - cumplimiento.obligatorios} opcionales`
                : ""}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-center md:grid-cols-3">
            {[
              ["Faltan", cumplimiento.faltantes, "text-red-700"],
              ["Vencidos", cumplimiento.vencidos, "text-red-700"],
              ["Rechazados", cumplimiento.rechazados, "text-red-700"],
              ["Por vencer", cumplimiento.porVencer, "text-amber-700"],
              ["Por validar", cumplimiento.porValidar, "text-amber-700"],
              ["No aplican", cumplimiento.noAplica, "text-soft"],
            ].map(([etiqueta, valor, tono]) => (
              <div key={etiqueta as string}>
                <div className={`text-xl font-bold tabular-nums ${valor ? (tono as string) : "text-soft/50"}`}>
                  {valor as number}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-soft">{etiqueta as string}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

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

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ["documentos", `Documentos (${requisitos.length})`],
            ["resumen", `Pendientes (${pendientes.length})`],
            ["historial", `Historial (${historial.length})`],
            ["notas", `Notas (${notas.length})`],
          ] as const
        ).map(([clave, etiqueta]) => (
          <button
            key={clave}
            onClick={() => setPestana(clave)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === clave ? "border-brand-red text-ink" : "border-transparent text-soft hover:text-ink"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === "documentos" ? (
        <Documentos
          empleado={empleado}
          requisitos={requisitos}
          disponibles={disponibles}
          archivados={archivados}
          permisos={permisos}
          avisar={setAviso}
        />
      ) : null}

      {pestana === "resumen" ? (
        pendientes.length === 0 ? (
          <Empty>
            No hay nada pendiente en este expediente. {cumplimiento.total === 0 ? "Tampoco se le pide nada todavía." : ""}
          </Empty>
        ) : (
          <Documentos
            empleado={empleado}
            requisitos={pendientes}
            disponibles={[]}
            archivados={[]}
            permisos={permisos}
            avisar={setAviso}
            soloPendientes
          />
        )
      ) : null}

      {pestana === "historial" ? <Historial movimientos={historial} /> : null}

      {pestana === "notas" ? (
        <Notas notas={notas} empleadoId={empleado.id} permisos={permisos} yo={yo} avisar={setAviso} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- documentos

function Documentos({
  empleado,
  requisitos,
  disponibles,
  archivados,
  permisos,
  avisar,
  soloPendientes,
}: {
  empleado: Empleado;
  requisitos: RequisitoVista[];
  disponibles: TipoDocumento[];
  archivados: Archivado[];
  permisos: Permisos;
  avisar: (a: Aviso) => void;
  soloPendientes?: boolean;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [pendiente, empezar] = useTransition();

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, RequisitoVista[]>();
    for (const r of requisitos) {
      const clave = r.tipo.categoria ?? "Sin categoría";
      mapa.set(clave, [...(mapa.get(clave) ?? []), r]);
    }

    // Dentro de cada categoría, los documentos que valen uno por otro se
    // enseñan juntos: son un solo hueco del expediente, no varios.
    return [...mapa.entries()].map(([categoria, lista]) => {
      const bloques: { grupo: string | null; miembros: RequisitoVista[] }[] = [];
      const puestos = new Set<string>();
      for (const r of lista) {
        if (!r.grupo) {
          bloques.push({ grupo: null, miembros: [r] });
          continue;
        }
        if (puestos.has(r.grupo)) continue;
        puestos.add(r.grupo);
        bloques.push({ grupo: r.grupo, miembros: lista.filter((o) => o.grupo === r.grupo) });
      }
      return { categoria, bloques };
    });
  }, [requisitos]);

  const correr = (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) =>
    empezar(async () => {
      const r = await accion();
      avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
    });

  if (requisitos.length === 0) {
    return (
      <Empty>
        A esta persona todavía no se le pide ningún documento. Eso lo define la matriz de requisitos en Configuración.
      </Empty>
    );
  }

  return (
    <>
      {!soloPendientes && permisos.requisitos && disponibles.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <button className={btnGhost} onClick={() => setAgregando((v) => !v)}>
            {agregando ? "Cancelar" : "+ Pedirle otro documento"}
          </button>
        </div>
      ) : null}

      {agregando ? (
        <Card className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Agregar un requisito a esta persona</h2>
          <p className="mt-1 text-sm text-soft">
            Es una excepción para {empleado.nombre.split(" ")[0]}: no cambia lo que se le pide al resto.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              empezar(async () => {
                const r = await agregarRequisito(datos);
                avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
                if (r.ok) setAgregando(false);
              });
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="empleado_id" value={empleado.id} />
            <div className="grow">
              <Label>Documento</Label>
              <select name="doc_tipo_id" required defaultValue="" className={inputCls}>
                <option value="" disabled>
                  Elige…
                </option>
                {disponibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.categoria ? `${t.categoria} · ` : ""}
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Cómo cuenta</Label>
              <select name="obligatorio" defaultValue="1" className={inputCls}>
                <option value="1">Obligatorio</option>
                <option value="0">Opcional</option>
              </select>
            </div>
            <button type="submit" disabled={pendiente} className={btnPrimary}>
              Agregar
            </button>
          </form>
        </Card>
      ) : null}

      <div className="space-y-6">
        {porCategoria.map(({ categoria, bloques }) => (
          <section key={categoria}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-soft">{categoria}</h2>
            <div className="space-y-3">
              {bloques.map((bloque) => {
                const filas = bloque.miembros.map((r) => (
                  <FilaRequisito
                    key={r.id}
                    req={r}
                    empleado={empleado}
                    permisos={permisos}
                    abierto={abierto === r.id}
                    alternar={() => setAbierto(abierto === r.id ? null : r.id)}
                    correr={correr}
                    pendiente={pendiente}
                    avisar={avisar}
                  />
                ));

                if (!bloque.grupo) {
                  return (
                    <div
                      key={bloque.miembros[0].id}
                      className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card"
                    >
                      {filas}
                    </div>
                  );
                }

                const cubierto = bloque.miembros.find((m) => m.cubierto && !m.cubiertoPor);
                return (
                  <div key={bloque.grupo} className="overflow-hidden rounded-lg border border-line bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-4 py-2">
                      <p className="text-sm font-semibold text-ink">
                        {bloque.grupo}
                        <span className="ml-2 text-xs font-normal text-soft">
                          basta con uno de los {bloque.miembros.length}
                        </span>
                      </p>
                      {cubierto ? (
                        <Badge tono="verde">Cubierto con {cubierto.tipo.nombre}</Badge>
                      ) : (
                        <Badge tono="rojo">Falta cualquiera de estos</Badge>
                      )}
                    </div>
                    <div className="divide-y divide-line">{filas}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {!soloPendientes && archivados.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-soft">
            Papelera del expediente ({archivados.length})
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {archivados.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <span className="font-medium text-ink">{a.tipo_nombre}</span>
                  <div className="text-xs text-soft">
                    {a.archivado_motivo} · {a.archivado_por} · {a.archivado_en}
                  </div>
                </div>
                {permisos.eliminar ? (
                  <button className={btnGhost} disabled={pendiente} onClick={() => correr(() => restaurarDocumento(a.id))}>
                    Restaurar
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function FilaRequisito({
  req,
  empleado,
  permisos,
  abierto,
  alternar,
  correr,
  pendiente,
  avisar,
}: {
  req: RequisitoVista;
  empleado: Empleado;
  permisos: Permisos;
  abierto: boolean;
  alternar: () => void;
  correr: (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pendiente: boolean;
  avisar: (a: Aviso) => void;
}) {
  const v = req.version;
  const confidencial = req.tipo.confidencialidad !== "GENERAL";
  const puedeVerlo = permisos.verDocumentos && (!confidencial || permisos.verConfidencial);

  return (
    <div>
      <button
        onClick={alternar}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-paper/40"
      >
        <span aria-hidden className={`text-xs text-soft transition-transform ${abierto ? "rotate-90" : ""}`}>
          ▶
        </span>
        <span className="min-w-0 grow">
          <span className="font-medium text-ink">{req.tipo.nombre}</span>
          {req.tipo.critico ? <span className="ml-2 text-[11px] font-bold text-brand-red">CRÍTICO</span> : null}
          {!req.obligatorio ? <span className="ml-2 text-[11px] text-soft">opcional</span> : null}
          {req.origen === "MANUAL" ? <span className="ml-2 text-[11px] text-soft">agregado a mano</span> : null}
          {confidencial ? <span className="ml-2 text-[11px] text-amber-700">confidencial</span> : null}
          {v ? (
            <span className="block text-xs text-soft">
              Versión {v.version} · cargado el {v.cargado_en?.slice(0, 10)} por {v.cargado_por ?? "—"}
              {req.vence ? ` · vence el ${fechaCorta(req.vence)}` : ""}
            </span>
          ) : null}
          {req.no_aplica ? <span className="block text-xs text-soft">No aplica: {req.no_aplica_motivo}</span> : null}
        </span>
        {req.cubiertoPor ? (
          <Badge tono="gris">No hace falta · trae {req.cubiertoPor}</Badge>
        ) : (
          <Badge tono={TONO_ESTADO_DOC[req.estado]}>
            {ETIQUETA_ESTADO_DOC[req.estado]}
            {req.estado === "POR_VENCER" && req.dias !== null ? ` · ${req.dias} días` : ""}
            {req.estado === "VENCIDO" && req.dias !== null ? ` hace ${Math.abs(req.dias)} días` : ""}
          </Badge>
        )}
      </button>

      {abierto ? (
        <div className="border-t border-line bg-paper/40 px-4 py-5">
          {req.tipo.descripcion ? <p className="mb-4 text-sm text-soft">{req.tipo.descripcion}</p> : null}

          {req.cubiertoPor ? (
            <p className="mb-4 rounded-md border border-line bg-white px-3 py-2 text-sm text-soft">
              Este requisito ya quedó cubierto con <b className="text-ink">{req.cubiertoPor}</b>, que vale por lo
              mismo. No hace falta pedirlo, pero si la persona lo entrega igual se puede cargar aquí.
            </p>
          ) : null}

          {v ? (
            <VersionActual
              req={req}
              version={v}
              puedeVerlo={puedeVerlo}
              permisos={permisos}
              correr={correr}
              pendiente={pendiente}
              avisar={avisar}
            />
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {permisos.noAplica && req.tipo.permite_no_aplica ? (
              req.no_aplica ? (
                <button className={btnGhost} disabled={pendiente} onClick={() => correr(() => quitarNoAplica(req.id))}>
                  Volver a pedirlo
                </button>
              ) : (
                <NoAplica requisitoId={req.id} correr={correr} pendiente={pendiente} />
              )
            ) : null}
            {permisos.requisitos && req.origen === "MANUAL" && !req.documento_id ? (
              <button className={btnDanger} disabled={pendiente} onClick={() => correr(() => quitarRequisito(req.id))}>
                Quitar este requisito
              </button>
            ) : null}
          </div>

          {permisos.cargar && !req.no_aplica ? (
            <PanelCarga req={req} empleado={empleado} avisar={avisar} />
          ) : null}

          {req.historial.length > 1 ? <Versiones versiones={req.historial} puedeVerlo={puedeVerlo} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function VersionActual({
  req,
  version,
  puedeVerlo,
  permisos,
  correr,
  pendiente,
  avisar,
}: {
  req: RequisitoVista;
  version: VersionDocumento;
  puedeVerlo: boolean;
  permisos: Permisos;
  correr: (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pendiente: boolean;
  avisar: (a: Aviso) => void;
}) {
  const [rechazando, setRechazando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [archivando, setArchivando] = useState(false);
  const [enviando, empezar] = useTransition();

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
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Versión {version.version} (la vigente)</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {version.fecha_emision ? (
              <>
                <dt className="text-soft">Emitido</dt>
                <dd className="text-ink">{fechaCorta(version.fecha_emision)}</dd>
              </>
            ) : null}
            {req.vence ? (
              <>
                <dt className="text-soft">Vence</dt>
                <dd className="text-ink">{fechaCorta(req.vence)}</dd>
              </>
            ) : null}
            {version.folio ? (
              <>
                <dt className="text-soft">Folio</dt>
                <dd className="text-ink">{version.folio}</dd>
              </>
            ) : null}
            {version.entidad_emisora ? (
              <>
                <dt className="text-soft">Emitido por</dt>
                <dd className="text-ink">{version.entidad_emisora}</dd>
              </>
            ) : null}
            {version.validado_por ? (
              <>
                <dt className="text-soft">Validó</dt>
                <dd className="text-ink">
                  {version.validado_por} el {version.validado_en?.slice(0, 10)}
                </dd>
              </>
            ) : null}
            {version.notas ? (
              <>
                <dt className="text-soft">Notas</dt>
                <dd className="text-ink">{version.notas}</dd>
              </>
            ) : null}
          </dl>

          {version.estado === "RECHAZADO" ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <b>Rechazado:</b> {version.motivo_rechazo}
              {version.comentario_rechazo ? ` — ${version.comentario_rechazo}` : ""}
              <span className="block text-xs">
                Por {version.rechazado_por} el {version.rechazado_en?.slice(0, 10)}
              </span>
            </p>
          ) : null}
        </div>

        <ul className="space-y-1.5 text-sm">
          {(version.archivos ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              {puedeVerlo ? (
                <a
                  href={`/api/expedientes/archivo/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink underline hover:text-kraft-dark"
                >
                  {a.etiqueta || a.nombre_original}
                </a>
              ) : (
                <span className="text-soft">{a.etiqueta || a.nombre_original}</span>
              )}
              <span className="text-xs text-soft">{tamanoLegible(a.tamano)}</span>
              {puedeVerlo && permisos.descargar ? (
                <a
                  href={`/api/expedientes/archivo/${a.id}?descargar=1`}
                  className="text-xs text-soft underline hover:text-ink"
                >
                  descargar
                </a>
              ) : null}
            </li>
          ))}
          {!puedeVerlo ? (
            <li className="text-xs text-soft">
              {req.tipo.confidencialidad !== "GENERAL"
                ? "Este documento es confidencial y tu rol no lo abre."
                : "Tu rol no abre documentos."}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {permisos.validar && version.estado !== "VALIDADO" && version.vigente ? (
          <form
            onSubmit={enviar(validarDocumento, () => {})}
            className="inline"
          >
            <input type="hidden" name="version_id" value={version.id} />
            <button type="submit" disabled={enviando || pendiente} className={btnPrimary}>
              Validar
            </button>
          </form>
        ) : null}
        {permisos.rechazar && version.vigente ? (
          <button className={btnGhost} onClick={() => setRechazando((r) => !r)}>
            {rechazando ? "Cancelar" : "Rechazar"}
          </button>
        ) : null}
        {permisos.editarMetadatos ? (
          <button className={btnGhost} onClick={() => setCorrigiendo((c) => !c)}>
            {corrigiendo ? "Cancelar" : "Corregir datos"}
          </button>
        ) : null}
        {permisos.eliminar && req.documento_id ? (
          <button className={btnDanger} onClick={() => setArchivando((a) => !a)}>
            {archivando ? "Cancelar" : "Archivar"}
          </button>
        ) : null}
      </div>

      {rechazando ? (
        <form onSubmit={enviar(rechazarDocumento, () => setRechazando(false))} className="mt-4 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="version_id" value={version.id} />
          <div>
            <Label>Motivo</Label>
            <select name="motivo" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                Elige…
              </option>
              {MOTIVOS_RECHAZO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Comentario para quien lo repone</Label>
            <input name="comentario" className={inputCls} placeholder="Qué hay que corregir exactamente" />
          </div>
          <div className="md:col-span-3">
            <button type="submit" disabled={enviando} className={btnDanger}>
              Rechazar documento
            </button>
          </div>
        </form>
      ) : null}

      {corrigiendo ? (
        <form onSubmit={enviar(editarMetadatos, () => setCorrigiendo(false))} className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="version_id" value={version.id} />
          <div>
            <Label>Fecha de emisión</Label>
            <input name="fecha_emision" type="date" defaultValue={version.fecha_emision ?? ""} className={inputCls} />
          </div>
          <div>
            <Label>Fecha de vencimiento</Label>
            <input
              name="fecha_vencimiento"
              type="date"
              defaultValue={version.fecha_vencimiento ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <Label>Folio</Label>
            <input name="folio" defaultValue={version.folio ?? ""} className={inputCls} />
          </div>
          <div>
            <Label>Entidad emisora</Label>
            <input name="entidad_emisora" defaultValue={version.entidad_emisora ?? ""} className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <Label>Notas</Label>
            <input name="notas" defaultValue={version.notas ?? ""} className={inputCls} />
          </div>
          <div className="md:col-span-4">
            <button type="submit" disabled={enviando} className={btnPrimary}>
              Guardar correcciones
            </button>
          </div>
        </form>
      ) : null}

      {archivando ? (
        <form onSubmit={enviar(archivarDocumento, () => setArchivando(false))} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="documento_id" value={req.documento_id ?? 0} />
          <div className="grow">
            <Label>¿Por qué se archiva?</Label>
            <input name="motivo" required className={inputCls} placeholder="Se subió al empleado equivocado, por ejemplo" />
          </div>
          <button type="submit" disabled={enviando} className={btnDanger}>
            Archivar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function NoAplica({
  requisitoId,
  correr,
  pendiente,
}: {
  requisitoId: number;
  correr: (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pendiente: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  if (!abierto) {
    return (
      <button className={btnGhost} onClick={() => setAbierto(true)}>
        Marcar “no aplica”
      </button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <div className="grow">
        <Label>¿Por qué no aplica? (queda registrado)</Label>
        <input ref={campo} autoFocus className={inputCls} placeholder="No maneja vehículos de la empresa" />
      </div>
      <button
        className={btnPrimary}
        disabled={pendiente}
        onClick={() => {
          const datos = new FormData();
          datos.set("requisito_id", String(requisitoId));
          datos.set("motivo", campo.current?.value ?? "");
          correr(() => marcarNoAplica(datos));
          setAbierto(false);
        }}
      >
        Guardar
      </button>
      <button className={btnGhost} onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </div>
  );
}

function PanelCarga({ req, empleado, avisar }: { req: RequisitoVista; empleado: Empleado; avisar: (a: Aviso) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, empezar] = useTransition();
  const forma = useRef<HTMLFormElement>(null);

  const esRenovacion = !!req.version;
  const pidePlazo = req.tipo.vigencia_tipo !== "SIN";

  if (!abierto) {
    return (
      <div className="mt-4">
        <button className={btnPrimary} onClick={() => setAbierto(true)}>
          {esRenovacion ? "Cargar versión nueva" : "Cargar documento"}
        </button>
      </div>
    );
  }

  return (
    <form
      ref={forma}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        empezar(async () => {
          const r = await cargarDocumento(datos);
          avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
          if (r.ok) {
            forma.current?.reset();
            setAbierto(false);
          }
        });
      }}
      className="mt-4 rounded-md border border-kraft/40 bg-white p-4"
    >
      <input type="hidden" name="requisito_id" value={req.id} />

      <h3 className="text-sm font-bold text-ink">
        {esRenovacion ? `Nueva versión de ${req.tipo.nombre}` : `Cargar ${req.tipo.nombre}`}
      </h3>
      <p className="mt-1 text-xs text-soft">
        {esRenovacion
          ? `La versión ${req.version?.version} se conserva completa; esta pasa a ser la vigente.`
          : `Para ${empleado.nombre}.`}{" "}
        Acepta {req.tipo.formatos.replace(/,/g, ", ")} · hasta {req.tipo.tam_max_mb} MB por archivo.
      </p>

      <div className="mt-4">
        <Label>Archivos</Label>
        <input
          type="file"
          name="archivos"
          multiple
          required
          accept={req.tipo.formatos
            .split(",")
            .map((f) => `.${f.trim()}`)
            .join(",")}
          className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-kraft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-kraft-dark"
        />
        <p className="mt-1 text-xs text-soft">
          Puedes seleccionar varios de golpe: las dos caras de la INE o las hojas de un acta van juntas en el mismo
          documento.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label>Fecha de emisión{req.tipo.requiere_emision ? " *" : ""}</Label>
          <input
            name="fecha_emision"
            type="date"
            required={!!req.tipo.requiere_emision}
            className={inputCls}
          />
          {pidePlazo && req.tipo.vigencia_tipo !== "FECHA" ? (
            <p className="mt-1 text-xs text-soft">
              Con esta fecha se calcula el vencimiento ({req.tipo.vigencia_valor}{" "}
              {req.tipo.vigencia_tipo.toLowerCase()}).
            </p>
          ) : null}
        </div>
        <div>
          <Label>Fecha de vencimiento{req.tipo.requiere_vencimiento ? " *" : ""}</Label>
          <input
            name="fecha_vencimiento"
            type="date"
            required={!!req.tipo.requiere_vencimiento}
            className={inputCls}
          />
        </div>
        <div>
          <Label>Folio o número</Label>
          <input name="folio" className={inputCls} />
        </div>
        <div>
          <Label>Entidad emisora</Label>
          <input name="entidad_emisora" className={inputCls} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Notas</Label>
          <input name="notas" className={inputCls} />
        </div>
        <div>
          <Label>Origen</Label>
          <select name="origen" defaultValue="RH" className={inputCls}>
            <option value="RH">Lo entregó a RH</option>
            <option value="MIGRACION">Digitalización del archivero</option>
            <option value="IMPORTACION">Vino de otro sistema</option>
          </select>
          <p className="mt-1 text-xs text-soft">La digitalización entra como “en revisión” para validarla después.</p>
        </div>
      </div>

      {esRenovacion ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label>¿Por qué se sustituye?</Label>
            <input name="motivo_sustitucion" className={inputCls} placeholder="Se renovó, venía mal escaneado…" />
          </div>
          {req.tipo.multiples_vigentes ? (
            <label className="flex items-end gap-2 pb-2 text-sm text-ink">
              <input type="checkbox" name="como_nuevo" value="1" className="mb-1 h-4 w-4 accent-brand-red" />
              <span>
                Es un documento aparte, no una versión nueva
                <span className="block text-xs text-soft">Para otra DC-3 o certificación distinta.</span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={enviando} className={btnPrimary}>
          {enviando ? "Subiendo…" : "Cargar"}
        </button>
        <button type="button" className={btnGhost} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Versiones({ versiones, puedeVerlo }: { versiones: VersionDocumento[]; puedeVerlo: boolean }) {
  const anteriores = versiones.filter((v) => !v.vigente);
  if (!anteriores.length) return null;

  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-soft">Versiones anteriores</h3>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
        {anteriores.map((v) => (
          <li key={v.id} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                Versión {v.version} · {v.cargado_en?.slice(0, 10)} · {v.cargado_por ?? "—"}
              </span>
              <span className="text-xs text-soft">
                Sustituida {v.sustituida_en?.slice(0, 10)}
                {v.motivo_sustitucion ? ` — ${v.motivo_sustitucion}` : ""}
              </span>
            </div>
            {puedeVerlo ? (
              <div className="mt-1 flex flex-wrap gap-3">
                {(v.archivos ?? []).map((a) => (
                  <a
                    key={a.id}
                    href={`/api/expedientes/archivo/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-soft underline hover:text-ink"
                  >
                    {a.etiqueta || a.nombre_original}
                  </a>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------- historial

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  APERTURA: "Se abrió el expediente",
  CARGA: "Carga",
  VALIDACION: "Validación",
  RECHAZO: "Rechazo",
  CORRECCION: "Corrección",
  NO_APLICA: "No aplica",
  NO_APLICA_QUITADO: "Vuelve a pedirse",
  REQUISITO_ALTA: "Requisito agregado",
  REQUISITO_BAJA: "Requisito quitado",
  ARCHIVADO: "Archivado",
  RESTAURADO: "Restaurado",
  DESCARGA: "Descarga",
  RECALCULO: "Recálculo",
};

function Historial({ movimientos }: { movimientos: MovimientoExpediente[] }) {
  if (!movimientos.length) return <Empty>Todavía no ha pasado nada en este expediente.</Empty>;

  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {movimientos.map((m) => (
        <li key={m.id} className="relative">
          <span aria-hidden className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-kraft" />
          <p className="text-sm text-ink">
            <b>{ETIQUETA_MOVIMIENTO[m.accion] ?? m.accion}</b> · {m.detalle}
          </p>
          <p className="text-xs text-soft">
            {m.fecha} · {m.usuario ?? "sistema"}
          </p>
        </li>
      ))}
    </ol>
  );
}

// --------------------------------------------------------------------- notas

function Notas({
  notas,
  empleadoId,
  permisos,
  yo,
  avisar,
}: {
  notas: Nota[];
  empleadoId: number;
  permisos: Permisos;
  yo: string;
  avisar: (a: Aviso) => void;
}) {
  const [enviando, empezar] = useTransition();
  const forma = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-5">
      {permisos.comentar ? (
        <Card>
          <form
            ref={forma}
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              empezar(async () => {
                const r = await agregarNota(datos);
                avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
                if (r.ok) forma.current?.reset();
              });
            }}
          >
            <input type="hidden" name="empleado_id" value={empleadoId} />
            <Label>Nota nueva</Label>
            <textarea name="texto" rows={3} required className={inputCls} />
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label>Quién la puede ver</Label>
                <select name="visibilidad" defaultValue="INTERNA" className={inputCls}>
                  <option value="INTERNA">Solo RH</option>
                  <option value="EMPLEADO">También el empleado</option>
                </select>
              </div>
              <button type="submit" disabled={enviando} className={btnPrimary}>
                {enviando ? "Guardando…" : "Guardar nota"}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {notas.length === 0 ? (
        <Empty>No hay notas en este expediente.</Empty>
      ) : (
        <ul className="space-y-3">
          {notas.map((n) => (
            <li key={n.id} className="rounded-lg border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-ink">{n.texto}</p>
                <Badge tono={n.visibilidad === "INTERNA" ? "gris" : "petrol"}>
                  {n.visibilidad === "INTERNA" ? "Interna de RH" : "Visible para el empleado"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-soft">
                {n.autor ?? "—"} · {n.fecha}
                {n.autor === yo && permisos.comentar ? (
                  <button
                    className="ml-3 underline hover:text-ink"
                    onClick={() =>
                      empezar(async () => {
                        const r = await eliminarNota(n.id);
                        avisar({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Listo." : r.error ?? "No se pudo." });
                      })
                    }
                  >
                    borrar
                  </button>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
