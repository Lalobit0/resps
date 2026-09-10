"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { EmpleadoConEquipos } from "../lib/types";
import { cambiarActivoEmpleado, eliminarEmpleado, guardarEmpleado, importarEmpleados } from "../app/empleados/actions";
import { ETIQUETA_TIPO } from "../lib/constants";
import ExportarBotones from "./ExportarBotones";
import CamposEmpleado, { EMPLEADO_VACIO, empleadoAFormulario, type DatosEmpleado } from "./CamposEmpleado";
import DarDeBajaBtn from "./DarDeBajaBtn";
import {
  CONDICIONES_EMPLEADO,
  GRUPOS_CONDICION,
  columnaDe,
  serializarCondiciones,
  type Condiciones,
} from "../lib/filtros-empleados";
import { AvisoTabla, Tabla, useTabla, type Columna } from "./Tabla";
import { Badge, Card, Empty, btnGhost, btnPrimary, inputCls } from "./ui";

const mini = "rounded border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-paper";
const miniDanger = "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50";

/** Cuántas veces se cumple una condición para este empleado. */
const cuantos = (e: EmpleadoConEquipos, clave: string) => e[columnaDe(clave) as `c_${string}`] ?? 0;

// El texto de las columnas de pastillas: lo mismo que se ve, para que ordenar
// y filtrar desde el encabezado coincida con lo que está en pantalla.
const textoDepto = (e: EmpleadoConEquipos) =>
  `${e.departamento}${e.area && e.area !== e.departamento ? ` · ${e.area}` : ""}`;

const textoEquipos = (e: EmpleadoConEquipos) =>
  [
    (e.computo ?? 0) > 0 ? `PC ${e.computo}` : "",
    (e.celular ?? 0) > 0 ? `CEL ${e.celular}` : "",
    (e.radio ?? 0) > 0 ? `RADIO ${e.radio}` : "",
    (e.otro ?? 0) > 0 ? `OTRO ${e.otro}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

const textoCartas = (e: EmpleadoConEquipos) =>
  [
    cuantos(e, "wifi") > 0 ? "WI-FI" : "",
    cuantos(e, "vale") > 0 ? `VALE ${cuantos(e, "vale")}` : "",
    cuantos(e, "mantenimiento") > 0 ? `MANTTO ${cuantos(e, "mantenimiento")}` : "",
    cuantos(e, "gafete") > 0 ? "GAFETE" : "",
    (e.sin_responsiva ?? 0) > 0 ? `SIN CARTA ${e.sin_responsiva}` : "",
    cuantos(e, "sin_firma") > 0 ? `SIN FIRMA ${cuantos(e, "sin_firma")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

export default function EmpleadosClient({ empleados }: { empleados: EmpleadoConEquipos[] }) {
  const [form, setForm] = useState<DatosEmpleado | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("");
  const [filtroClase, setFiltroClase] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  // Las pastillas: sin entrada no se pide nada, "si" es que lo tenga, "no" es
  // que no lo tenga. Se acumulan, así que se puede pedir "con cómputo pero sin
  // carta de Wi-Fi" de un solo golpe.
  const [condiciones, setCondiciones] = useState<Condiciones>({});
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const departamentos = useMemo(
    () => Array.from(new Set(empleados.map((e) => e.departamento).filter(Boolean))).sort(),
    [empleados]
  );

  const clases = useMemo(
    () => Array.from(new Set(empleados.map((e) => e.clase ?? "").filter(Boolean))).sort(),
    [empleados]
  );

  // Primero lo de siempre (texto, departamento, clase, estado). Sobre ese
  // resultado se cuentan las pastillas, para que el número de cada una diga
  // cuántos quedarían dentro de lo que ya se está viendo.
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empleados.filter((e) => {
      if (filtroEstado === "activos" && !e.activo) return false;
      if (filtroEstado === "inactivos" && e.activo) return false;
      if (filtroDepto && e.departamento !== filtroDepto) return false;
      if (filtroClase && (e.clase ?? "") !== filtroClase) return false;
      if (
        q &&
        ![e.nombre, e.numero_empleado, e.puesto, e.departamento, e.area ?? "", e.supervisor ?? "", e.clase ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [empleados, busqueda, filtroDepto, filtroClase, filtroEstado]);

  const filtrados = useMemo(
    () =>
      base.filter((e) =>
        CONDICIONES_EMPLEADO.every((c) => {
          const pedido = condiciones[c.clave];
          if (!pedido) return true;
          return pedido === "si" ? cuantos(e, c.clave) > 0 : cuantos(e, c.clave) === 0;
        })
      ),
    [base, condiciones]
  );

  const conteos = useMemo(() => {
    const salida: Record<string, number> = {};
    for (const c of CONDICIONES_EMPLEADO) salida[c.clave] = base.filter((e) => cuantos(e, c.clave) > 0).length;
    return salida;
  }, [base]);

  const activas = Object.keys(condiciones).length;

  /** Un clic pide que sí lo tenga, otro que no, y el tercero deja de pedirlo. */
  const girar = (clave: string) =>
    setCondiciones((prev) => {
      const siguiente = { ...prev };
      if (!prev[clave]) siguiente[clave] = "si";
      else if (prev[clave] === "si") siguiente[clave] = "no";
      else delete siguiente[clave];
      return siguiente;
    });

  const columnas = useMemo<Columna<EmpleadoConEquipos>[]>(
    () => [
      { clave: "no", titulo: "No.", ancho: "5%", valor: (e) => e.numero_empleado, claseCelda: "mono text-xs" },
      {
        clave: "nombre",
        titulo: "Nombre",
        ancho: "14%",
        valor: (e) => e.nombre,
        claseCelda: "truncate",
        celda: (e) => (
          <Link
            href={`/empleados/${e.id}`}
            className="block truncate font-medium text-ink hover:text-kraft hover:underline"
            title={`${e.nombre} · ver histórico`}
          >
            {e.nombre}
          </Link>
        ),
      },
      {
        clave: "clase",
        titulo: "Clase",
        ancho: "7%",
        valor: (e) => e.clase ?? "",
        claseCelda: "truncate text-xs",
        celda: (e) => <span title={e.clase ?? ""}>{e.clase || <span className="text-soft">—</span>}</span>,
      },
      {
        clave: "puesto",
        titulo: "Puesto",
        ancho: "10%",
        valor: (e) => e.puesto,
        claseCelda: "truncate text-xs",
        celda: (e) => <span title={e.puesto}>{e.puesto}</span>,
      },
      {
        clave: "depto",
        titulo: "Depto / Área",
        ancho: "10%",
        valor: (e) => textoDepto(e),
        claseCelda: "truncate text-xs",
        celda: (e) => (
          <span title={textoDepto(e)}>
            {e.departamento}
            {e.area && e.area !== e.departamento ? <span className="text-soft"> · {e.area}</span> : null}
          </span>
        ),
      },
      {
        clave: "jefe",
        titulo: "Jefe directo",
        ancho: "8%",
        valor: (e) => e.supervisor ?? "",
        claseCelda: "truncate text-xs text-soft",
        celda: (e) => <span title={e.supervisor ?? ""}>{e.supervisor ?? "—"}</span>,
      },
      {
        clave: "equipos",
        titulo: "Equipos",
        ancho: "12%",
        ayuda: "Equipos asignados por tipo",
        valor: (e) => textoEquipos(e),
        celda: (e) => (
          <Link href={`/empleados/${e.id}`} className="flex flex-wrap items-center gap-1" title="Ver su histórico">
            {(e.computo ?? 0) > 0 ? <Badge tono="verde">PC {e.computo}</Badge> : null}
            {(e.celular ?? 0) > 0 ? <Badge tono="petrol">CEL {e.celular}</Badge> : null}
            {(e.radio ?? 0) > 0 ? <Badge tono="ambar">RADIO {e.radio}</Badge> : null}
            {(e.otro ?? 0) > 0 ? <Badge tono="gris">OTRO {e.otro}</Badge> : null}
            {/* Sin nada entregado la celda quedaría vacía y parecería un error. */}
            {!textoEquipos(e) ? <span className="text-xs text-soft">—</span> : null}
          </Link>
        ),
      },
      {
        clave: "cartas",
        titulo: "Cartas y pendientes",
        ancho: "13%",
        ayuda: "Cartas que tiene y lo que le falta",
        valor: (e) => textoCartas(e),
        celda: (e) => (
          <Link href={`/empleados/${e.id}`} className="flex flex-wrap items-center gap-1" title="Ver su histórico">
            {cuantos(e, "wifi") > 0 ? <Badge tono="verde">WI-FI</Badge> : null}
            {cuantos(e, "vale") > 0 ? <Badge tono="ambar">VALE {cuantos(e, "vale")}</Badge> : null}
            {cuantos(e, "mantenimiento") > 0 ? <Badge tono="petrol">MANTTO {cuantos(e, "mantenimiento")}</Badge> : null}
            {cuantos(e, "gafete") > 0 ? <Badge tono="kraft">GAFETE</Badge> : null}
            {(e.sin_responsiva ?? 0) > 0 ? <Badge tono="rojo">SIN CARTA {e.sin_responsiva}</Badge> : null}
            {cuantos(e, "sin_firma") > 0 ? <Badge tono="rojo">SIN FIRMA {cuantos(e, "sin_firma")}</Badge> : null}
            {!textoCartas(e) ? <span className="text-xs text-soft">—</span> : null}
          </Link>
        ),
      },
      {
        clave: "estado",
        titulo: "Estado",
        ancho: "8%",
        valor: (e) => (e.activo ? "Activo" : "Inactivo"),
        celda: (e) => (e.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="gris">Inactivo</Badge>),
      },
      {
        clave: "acciones",
        titulo: "Acciones",
        ancho: "13%",
        celda: (e) => (
          <div className="flex flex-wrap items-center gap-1">
            <button className={mini} onClick={() => setForm(empleadoAFormulario(e))}>
              Editar
            </button>
            {e.activo ? (
              <DarDeBajaBtn empleadoId={e.id} nombre={e.nombre} className={mini} />
            ) : (
              <button className={mini} disabled={pendiente} onClick={() => reactivar(e)}>
                Reactivar
              </button>
            )}
            <button
              className={miniDanger}
              disabled={pendiente}
              onClick={() => {
                if (confirm(`¿Eliminar a ${e.nombre}? Esta acción no se puede deshacer.`)) {
                  ejecutar(() => eliminarEmpleado(e.id));
                }
              }}
            >
              Eliminar
            </button>
          </div>
        ),
      },
    ],
    // `pendiente` cambia los botones; lo demás son funciones estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendiente]
  );

  const tabla = useTabla({ id: "empleados", columnas, filas: filtrados });

  const enviar = () => {
    if (!form) return;
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await guardarEmpleado(form);
      if (res.ok) setForm(null);
      else setError(res.error ?? "Error desconocido.");
    });
  };

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    setMensaje("");
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error desconocido.");
    });
  };

  // Solo reactiva: la baja va por su propio flujo, que además recibe los equipos.
  const reactivar = (e: EmpleadoConEquipos) => ejecutar(() => cambiarActivoEmpleado(e.id, true));

  const importar = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError("");
    setMensaje("");
    const fd = new FormData();
    fd.append("archivo", archivo);
    iniciar(async () => {
      const res = await importarEmpleados(fd);
      if (res.ok) setMensaje(res.mensaje ?? "Empleados importados.");
      else setError(res.error ?? "No se pudo importar.");
    });
  };

  return (
    <div className="space-y-4">
      {mensaje ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, número, puesto…"
          className={`${inputCls} max-w-xs`}
        />
        <select className={`${inputCls} max-w-[200px]`} value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}>
          <option value="">Todos los departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[190px]`} value={filtroClase} onChange={(e) => setFiltroClase(e.target.value)}>
          <option value="">Todas las clases</option>
          {clases.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[150px]`} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
        <button className={btnGhost} disabled={pendiente} onClick={() => fileRef.current?.click()}>
          {pendiente ? "Procesando…" : "↥ Importar Excel"}
        </button>
        <Link href="/empleados/bajas" className={btnGhost}>
          Bajas →
        </Link>
        <button
          className={btnPrimary}
          onClick={() => {
            setForm(EMPLEADO_VACIO);
            setError("");
            setMensaje("");
          }}
        >
          + Nuevo empleado
        </button>
      </div>

      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Buscar por lo que tienen</p>
          <p className="text-xs text-soft">
            Un clic para pedir que <span className="font-semibold text-emerald-700">sí lo tenga</span>, otro para{" "}
            <span className="font-semibold text-red-700">que no</span>, y el tercero lo quita.
            {activas > 0 ? (
              <button className="ml-2 font-semibold text-kraft-dark underline" onClick={() => setCondiciones({})}>
                Limpiar los {activas}
              </button>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {GRUPOS_CONDICION.map((grupo) => {
            const delGrupo = CONDICIONES_EMPLEADO.filter((c) => c.grupo === grupo);
            if (!delGrupo.length) return null;
            return (
              <div key={grupo} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-soft">{grupo}</span>
                {delGrupo.map((c) => {
                  const pedido = condiciones[c.clave];
                  const tono =
                    pedido === "si"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : pedido === "no"
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-line bg-white text-ink hover:bg-paper";
                  return (
                    <button
                      key={c.clave}
                      onClick={() => girar(c.clave)}
                      title={
                        pedido === "si"
                          ? `${c.ayuda}. Otro clic para pedir a los que NO.`
                          : pedido === "no"
                            ? `Solo los que NO cumplen: ${c.ayuda.toLowerCase()}. Otro clic para quitarlo.`
                            : c.ayuda
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${tono}`}
                    >
                      {pedido === "si" ? "✓ " : pedido === "no" ? "✕ " : ""}
                      {c.etiqueta}
                      <span className={`ml-1.5 text-[10px] ${pedido ? "opacity-70" : "text-soft"}`}>
                        {conteos[c.clave]}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-xs text-soft">
          <span>
            {tabla.filas.length} de {empleados.length} empleados · haz clic en un nombre para ver su histórico, o en
            el título de una columna para ordenarla y filtrarla.
          </span>
          <AvisoTabla estado={tabla} />
        </p>
        <ExportarBotones
          tabla="empleados"
          params={{
            q: busqueda,
            depto: filtroDepto,
            clase: filtroClase,
            estado: filtroEstado,
            cond: serializarCondiciones(condiciones),
          }}
        />
      </div>

      {form ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
        <Card className="my-6 w-full max-w-3xl">
          <h2 className="mb-4 text-base font-bold text-ink">{form.id ? "Editar empleado" : "Nuevo empleado"}</h2>
          <CamposEmpleado
            valor={form}
            onCambio={(campo, texto) => setForm((f) => (f ? { ...f, [campo]: texto } : f))}
            deshabilitado={pendiente}
          />
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} onClick={enviar} disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar empleado"}
            </button>
            <button className={btnGhost} onClick={() => setForm(null)} disabled={pendiente}>
              Cancelar
            </button>
          </div>
        </Card>
        </div>
      ) : null}

      <Card className="p-0">
        <Tabla
          estado={tabla}
          claveFila={(e) => e.id}
          minAncho={1180}
          vacio={<Empty>No hay empleados que coincidan. Ajusta el filtro, registra uno o importa tu Excel.</Empty>}
        />
      </Card>
    </div>
  );
}
