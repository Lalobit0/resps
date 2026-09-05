"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { comprobar } from "../../lib/auth";
import { anotar, anotarDenegado } from "../../lib/bitacora";
import { importarDeExcel, type Mapeo } from "../../lib/importar";
import {
  ESTADOS_GAFETE,
  clavesDePerfil,
  fijarAccesos,
  gafete,
  perfiles,
  puertas,
  puertasDePerfiles,
  textoPerfiles,
} from "../../lib/gafetes";
import type { ResultadoAccion } from "../../lib/types";

const VER = "gafetes.ver";
const EDITAR = "gafetes.editar";

function refrescar() {
  revalidatePath("/gafetes");
  revalidatePath("/gafetes/configuracion");
  revalidatePath("/empleados");
}

const limpio = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// ------------------------------------------------------------------ gafetes

export async function guardarGafete(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) {
    await anotarDenegado("GAFETE_GUARDA", "Intento de cambiar un gafete sin permiso", "GAFETE");
    return { ok: false, error: permiso.error };
  }

  const id = Number(limpio(datos.get("id"))) || 0;
  const numero = limpio(datos.get("numero"));
  const empleadoId = Number(limpio(datos.get("empleado_id"))) || null;
  const estado = limpio(datos.get("estado")) || "ACTIVO";
  const fechaAlta = limpio(datos.get("fecha_alta"));
  const notas = limpio(datos.get("notas"));
  const claves = [...new Set(datos.getAll("perfiles").map((v) => String(v).trim().toUpperCase()).filter(Boolean))];
  const numerosPuerta = [...new Set(datos.getAll("puertas").map((v) => Number(v)).filter((n) => n > 0))];

  if (!numero) return { ok: false, error: "Escribe el número del gafete." };
  if (!ESTADOS_GAFETE.some((e) => e.clave === estado)) return { ok: false, error: "Ese estado no existe." };
  if (empleadoId && !db.prepare("SELECT 1 FROM empleados WHERE id = ?").get(empleadoId)) {
    return { ok: false, error: "Esa persona ya no está en la plantilla." };
  }

  // El mismo número no puede andar en dos gafetes vivos: es una tarjeta física.
  const repetido = db
    .prepare("SELECT id FROM gafetes WHERE UPPER(numero) = UPPER(?) AND id != ? AND estado != 'CANCELADO'")
    .get(numero, id) as { id: number } | undefined;
  if (repetido) return { ok: false, error: `El gafete ${numero} ya está registrado.` };

  const quien = empleadoId
    ? (db.prepare("SELECT numero_empleado, nombre FROM empleados WHERE id = ?").get(empleadoId) as {
        numero_empleado: string;
        nombre: string;
      })
    : null;

  if (id) {
    db.prepare(
      "UPDATE gafetes SET numero = ?, empleado_id = ?, estado = ?, fecha_alta = ?, notas = ? WHERE id = ?"
    ).run(numero, empleadoId, estado, fechaAlta || null, notas || null, id);
    fijarAccesos(id, claves, numerosPuerta);
    await anotar({
      accion: "GAFETE_EDITA",
      descripcion: `Cambió el gafete ${numero}${quien ? ` de ${quien.numero_empleado} ${quien.nombre}` : ""} (perfil ${textoPerfiles(claves)})`,
      entidad: "GAFETE",
      entidadId: id,
    });
    refrescar();
    return { ok: true, mensaje: `Gafete ${numero} guardado.` };
  }

  const res = db
    .prepare("INSERT INTO gafetes (numero, empleado_id, estado, fecha_alta, notas) VALUES (?, ?, ?, ?, ?)")
    .run(numero, empleadoId, estado, fechaAlta || null, notas || null);
  const nuevoId = Number(res.lastInsertRowid);
  fijarAccesos(nuevoId, claves, numerosPuerta);

  await anotar({
    accion: "GAFETE_ALTA",
    descripcion: `Gafete ${numero}${quien ? ` para ${quien.numero_empleado} ${quien.nombre}` : " sin asignar"} (perfil ${textoPerfiles(claves)})`,
    entidad: "GAFETE",
    entidadId: nuevoId,
  });
  refrescar();
  return { ok: true, id: nuevoId, mensaje: `Gafete ${numero} registrado.` };
}

export async function cambiarEstadoGafete(id: number, estado: string): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) return { ok: false, error: permiso.error };
  if (!ESTADOS_GAFETE.some((e) => e.clave === estado)) return { ok: false, error: "Ese estado no existe." };

  const g = gafete(id);
  if (!g) return { ok: false, error: "Ese gafete ya no existe." };

  const cierra = ["RECOGIDO", "CANCELADO"].includes(estado);
  db.prepare("UPDATE gafetes SET estado = ?, fecha_baja = ? WHERE id = ?").run(
    estado,
    cierra ? new Date().toISOString().slice(0, 10) : null,
    id
  );

  await anotar({
    accion: "GAFETE_ESTADO",
    descripcion: `El gafete ${g.numero}${g.nombre ? ` de ${g.nombre}` : ""} pasó de ${g.estado} a ${estado}`,
    entidad: "GAFETE",
    entidadId: id,
  });
  refrescar();
  return { ok: true, mensaje: `Gafete ${g.numero} marcado como ${estado.toLowerCase().replace("_", " ")}.` };
}

export async function eliminarGafete(id: number): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const g = gafete(id);
  if (!g) return { ok: false, error: "Ese gafete ya no existe." };

  db.prepare("DELETE FROM gafetes WHERE id = ?").run(id);
  await anotar({
    accion: "GAFETE_BAJA",
    descripcion: `Se borró el gafete ${g.numero}${g.nombre ? ` de ${g.nombre}` : ""}`,
    entidad: "GAFETE",
    entidadId: id,
  });
  refrescar();
  return { ok: true, mensaje: `Gafete ${g.numero} borrado.` };
}

// ---------------------------------------------------------------- catálogos

export async function guardarPuerta(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const id = Number(limpio(datos.get("id"))) || 0;
  const numero = Number(limpio(datos.get("numero")));
  const nombre = limpio(datos.get("nombre"));
  const activo = datos.getAll("activo").includes("1") ? 1 : 0;

  if (!numero || numero < 1) return { ok: false, error: "El número de la puerta no es válido." };
  if (!nombre) return { ok: false, error: "Escribe cómo se llama la puerta." };

  const repetida = db.prepare("SELECT id FROM puertas WHERE numero = ? AND id != ?").get(numero, id);
  if (repetida) return { ok: false, error: `Ya hay una puerta con el número ${numero}.` };

  if (id) db.prepare("UPDATE puertas SET numero = ?, nombre = ?, activo = ? WHERE id = ?").run(numero, nombre, activo, id);
  else db.prepare("INSERT INTO puertas (numero, nombre, activo) VALUES (?, ?, ?)").run(numero, nombre, activo);

  await anotar({ accion: "PUERTA_GUARDA", descripcion: `Puerta (${numero}) ${nombre}`, entidad: "GAFETE" });
  refrescar();
  return { ok: true, mensaje: `Puerta (${numero}) guardada.` };
}

export async function guardarPerfil(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const id = Number(limpio(datos.get("id"))) || 0;
  const clave = limpio(datos.get("clave")).toUpperCase();
  const nombre = limpio(datos.get("nombre"));
  const descripcion = limpio(datos.get("descripcion"));
  const activo = datos.getAll("activo").includes("1") ? 1 : 0;
  const numerosPuerta = [...new Set(datos.getAll("puertas").map((v) => Number(v)).filter((n) => n > 0))];

  if (!/^[A-Z]$/.test(clave)) return { ok: false, error: "El perfil se identifica con una letra: A, B, C…" };
  if (!nombre) return { ok: false, error: "Escribe cómo se llama el perfil." };

  const repetido = db.prepare("SELECT id FROM gafete_perfiles WHERE clave = ? AND id != ?").get(clave, id);
  if (repetido) return { ok: false, error: `Ya existe el perfil ${clave}.` };

  let perfilId = id;
  if (id) {
    db.prepare("UPDATE gafete_perfiles SET clave = ?, nombre = ?, descripcion = ?, activo = ? WHERE id = ?").run(
      clave,
      nombre,
      descripcion || null,
      activo,
      id
    );
  } else {
    const res = db
      .prepare("INSERT INTO gafete_perfiles (clave, nombre, descripcion, activo) VALUES (?, ?, ?, ?)")
      .run(clave, nombre, descripcion || null, activo);
    perfilId = Number(res.lastInsertRowid);
  }

  db.prepare("DELETE FROM perfil_puertas WHERE perfil_id = ?").run(perfilId);
  const buscar = db.prepare("SELECT id FROM puertas WHERE numero = ?");
  const insertar = db.prepare("INSERT OR IGNORE INTO perfil_puertas (perfil_id, puerta_id) VALUES (?, ?)");
  for (const n of numerosPuerta) {
    const p = buscar.get(n) as { id: number } | undefined;
    if (p) insertar.run(perfilId, p.id);
  }

  await anotar({
    accion: "PERFIL_GUARDA",
    descripcion: `Perfil ${clave} (${nombre}): puertas ${numerosPuerta.sort((a, b) => a - b).join(", ") || "ninguna"}`,
    entidad: "GAFETE",
    entidadId: perfilId,
  });
  refrescar();
  return {
    ok: true,
    mensaje: `Perfil ${clave} guardado. Los gafetes que ya lo tienen conservan sus puertas: se ajustan uno por uno.`,
  };
}

// ------------------------------------------------------------- importación

const MAPEO_GAFETES: Mapeo = {
  numero: ["gafete", "num gafete", "numero de gafete", "no gafete"],
  num_emp: ["empleado", "num empleado", "numero de empleado", "no empleado"],
  nombre: ["nombre del empleado", "nombre"],
  perfil: ["perfil"],
};

/**
 * Sube la matriz del formato FRH-14.
 *
 * Liga por número de empleado, que es lo único estable —el nombre viene con
 * dobles espacios y acentos de más—. El perfil se lee como letras sueltas,
 * porque en el papel la misma idea aparece de seis maneras; y las puertas
 * marcadas con X mandan sobre lo que dirían los perfiles, porque en el
 * formato hay gafetes que abren una puerta de más y eso también es un hecho.
 */
export async function importarGafetes(formData: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(EDITAR);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") return { ok: false, error: "No se recibió el archivo." };

    const listaPuertas = puertas();
    // Cada puerta es una columna, y su encabezado trae el número entre
    // paréntesis: "(7) Producción p/Alta".
    const mapeo: Mapeo = { ...MAPEO_GAFETES };
    for (const p of listaPuertas) {
      mapeo[`puerta_${p.numero}`] = [`${p.numero} ${p.nombre}`, `puerta ${p.numero}`, `${p.numero}`];
    }

    const buf = Buffer.from(await archivo.arrayBuffer());
    const filas = await importarDeExcel(buf, mapeo, "Matriz Gafetes de acceso");
    if (!filas.length) return { ok: false, error: "No se encontró la matriz. Revisa los encabezados de la hoja." };

    const listaPerfiles = perfiles();
    const buscarEmp = db.prepare("SELECT id FROM empleados WHERE numero_empleado = ?");
    const buscarGaf = db.prepare("SELECT id FROM gafetes WHERE UPPER(numero) = UPPER(?)");
    const hoy = new Date().toISOString().slice(0, 10);

    let nuevos = 0;
    let actualizados = 0;
    let ligados = 0;
    const sinEmpleado: string[] = [];
    const omitidos: string[] = [];
    const ajustados: string[] = [];

    const proceso = db.transaction(() => {
      for (const f of filas) {
        const numero = (f.numero || "").trim();
        if (!numero) {
          omitidos.push((f.nombre || f.num_emp || "renglón sin gafete").trim());
          continue;
        }

        const numEmp = (f.num_emp || "").trim();
        const emp = numEmp ? (buscarEmp.get(numEmp) as { id: number } | undefined) : undefined;
        if (numEmp && !emp) sinEmpleado.push(`${numero} (empleado ${numEmp})`);
        if (emp) ligados++;

        const claves = clavesDePerfil(f.perfil).filter((c) => listaPerfiles.some((p) => p.clave === c));

        // Lo marcado con X manda; si el renglón no marcó nada, se toma lo que
        // dicen sus perfiles.
        const marcadas = listaPuertas.filter((p) => (f[`puerta_${p.numero}`] || "").trim()).map((p) => p.numero);
        const delPerfil = puertasDePerfiles(claves, listaPerfiles);
        const finales = marcadas.length ? marcadas : delPerfil;
        if (marcadas.length && marcadas.join(",") !== delPerfil.join(",")) ajustados.push(numero);

        const existe = buscarGaf.get(numero) as { id: number } | undefined;
        let gafeteId: number;
        if (existe) {
          db.prepare("UPDATE gafetes SET empleado_id = COALESCE(?, empleado_id) WHERE id = ?").run(
            emp?.id ?? null,
            existe.id
          );
          gafeteId = existe.id;
          actualizados++;
        } else {
          const res = db
            .prepare("INSERT INTO gafetes (numero, empleado_id, estado, fecha_alta) VALUES (?, ?, 'ACTIVO', ?)")
            .run(numero, emp?.id ?? null, hoy);
          gafeteId = Number(res.lastInsertRowid);
          nuevos++;
        }
        fijarAccesos(gafeteId, claves, finales);
      }
    });
    proceso();

    await anotar({
      accion: "GAFETES_IMPORTA",
      descripcion: `Se subió la matriz de gafetes: ${nuevos} nuevos, ${actualizados} actualizados, ${ligados} ligados a empleado`,
      entidad: "GAFETE",
    });
    refrescar();

    const partes = [`${nuevos} nuevos`, `${actualizados} actualizados`, `${ligados} ligados a empleado`];
    if (omitidos.length) partes.push(`${omitidos.length} sin número de gafete`);
    let extra = "";
    if (sinEmpleado.length) {
      extra += ` ${sinEmpleado.length} gafete(s) traen un número de empleado que no está en la plantilla: ${sinEmpleado.slice(0, 5).join(", ")}${sinEmpleado.length > 5 ? "…" : ""}.`;
    }
    if (ajustados.length) {
      extra += ` ${ajustados.length} abren puertas distintas de las de su perfil; salen marcados en la matriz.`;
    }

    return { ok: true, mensaje: `Matriz cargada: ${partes.join(", ")}.${extra}` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer el archivo. Asegúrate de que sea el Excel del formato FRH-14." };
  }
}
