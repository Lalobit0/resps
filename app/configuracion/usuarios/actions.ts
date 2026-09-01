"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import {
  cerrarSesionesDe,
  comprobar,
  hashClave,
  permisosValidos,
  revisarClave,
  usuarioActual,
} from "../../../lib/auth";
import { anotar, anotarDenegado } from "../../../lib/bitacora";
import type { ResultadoAccion } from "../../../lib/types";

/**
 * Usuarios y roles.
 *
 * Todo lo que se toca aquí cambia quién puede ver expedientes de personal, así
 * que cada movimiento queda en la bitácora con nombre y apellido, incluidos los
 * intentos que se rechazan.
 */

const PERMISO = "usuarios.administrar";

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();

/** Cuenta cuántos superadministradores activos quedan, para no quedarse sin ninguno. */
function superadminsActivos(exceptoId?: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM usuarios u JOIN roles r ON r.id = u.rol_id
         WHERE u.activo = 1 AND r.todo = 1 AND u.id != ?`
      )
      .get(exceptoId ?? -1) as { c: number }
  ).c;
}

export async function crearUsuario(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("USUARIO_ALTA", "Intento de crear un usuario sin permiso", "USUARIO");
    return { ok: false, error: permiso.error };
  }

  const usuario = texto(datos, "usuario").toLowerCase();
  const nombre = texto(datos, "nombre");
  const correo = texto(datos, "correo");
  const rolId = Number(datos.get("rol_id"));
  const clave = String(datos.get("clave") ?? "");
  const empleadoId = Number(datos.get("empleado_id")) || null;

  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    return { ok: false, error: "El usuario va en minúsculas, sin espacios, de 3 a 30 caracteres." };
  }
  if (!nombre) return { ok: false, error: "Falta el nombre de la persona." };
  if (!rolId) return { ok: false, error: "Elige un rol." };
  const problema = revisarClave(clave);
  if (problema) return { ok: false, error: problema };

  const repetido = db.prepare("SELECT id FROM usuarios WHERE usuario = ?").get(usuario);
  if (repetido) return { ok: false, error: `Ya existe un usuario "${usuario}".` };

  const res = db
    .prepare(
      `INSERT INTO usuarios (usuario, nombre, correo, rol_id, clave_hash, debe_cambiar, empleado_id)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(usuario, nombre, correo || null, rolId, hashClave(clave), empleadoId);

  const rol = db.prepare("SELECT nombre FROM roles WHERE id = ?").get(rolId) as { nombre: string };
  await anotar({
    accion: "USUARIO_ALTA",
    descripcion: `Creó el usuario ${usuario} (${nombre}) con el rol ${rol.nombre}`,
    entidad: "USUARIO",
    entidadId: Number(res.lastInsertRowid),
    despues: { usuario, nombre, rol: rol.nombre },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: `Listo. ${nombre} ya puede entrar; el sistema le va a pedir cambiar la contraseña.` };
}

export async function editarUsuario(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("USUARIO_EDITA", "Intento de editar un usuario sin permiso", "USUARIO");
    return { ok: false, error: permiso.error };
  }

  const id = Number(datos.get("id"));
  const antes = db.prepare("SELECT usuario, nombre, correo, rol_id, activo FROM usuarios WHERE id = ?").get(id) as
    | { usuario: string; nombre: string; correo: string | null; rol_id: number; activo: number }
    | undefined;
  if (!antes) return { ok: false, error: "Ese usuario ya no existe." };

  const nombre = texto(datos, "nombre");
  const correo = texto(datos, "correo");
  const rolId = Number(datos.get("rol_id"));
  const activo = datos.get("activo") === "1" ? 1 : 0;
  if (!nombre) return { ok: false, error: "Falta el nombre." };
  if (!rolId) return { ok: false, error: "Elige un rol." };

  const rolNuevo = db.prepare("SELECT nombre, todo FROM roles WHERE id = ?").get(rolId) as {
    nombre: string;
    todo: number;
  };
  // Nadie puede dejar el sistema sin quien lo administre: si esta persona es
  // superadministrador y el cambio la quita de serlo, tiene que quedar otro.
  const eraSuperadmin =
    antes.activo === 1 &&
    (db.prepare("SELECT todo FROM roles WHERE id = ?").get(antes.rol_id) as { todo: number }).todo === 1;
  const sigueSiendoSuperadmin = activo === 1 && rolNuevo.todo === 1;
  if (eraSuperadmin && !sigueSiendoSuperadmin && superadminsActivos(id) === 0) {
    return { ok: false, error: "Es el último superadministrador activo: nombra otro antes de cambiarlo." };
  }

  db.prepare("UPDATE usuarios SET nombre = ?, correo = ?, rol_id = ?, activo = ? WHERE id = ?").run(
    nombre,
    correo || null,
    rolId,
    activo,
    id
  );
  // Al desactivar o al cambiarle el rol, sus sesiones abiertas dejan de valer.
  if (!activo || rolId !== antes.rol_id) cerrarSesionesDe(id);

  await anotar({
    accion: "USUARIO_EDITA",
    descripcion: `Modificó al usuario ${antes.usuario}`,
    entidad: "USUARIO",
    entidadId: id,
    antes,
    despues: { nombre, correo, rol: rolNuevo.nombre, activo },
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: "Guardado." };
}

export async function restablecerClave(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("USUARIO_CLAVE", "Intento de restablecer una contraseña sin permiso", "USUARIO");
    return { ok: false, error: permiso.error };
  }

  const id = Number(datos.get("id"));
  const clave = String(datos.get("clave") ?? "");
  const problema = revisarClave(clave);
  if (problema) return { ok: false, error: problema };

  const u = db.prepare("SELECT usuario, nombre FROM usuarios WHERE id = ?").get(id) as
    | { usuario: string; nombre: string }
    | undefined;
  if (!u) return { ok: false, error: "Ese usuario ya no existe." };

  db.prepare("UPDATE usuarios SET clave_hash = ?, debe_cambiar = 1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?").run(
    hashClave(clave),
    id
  );
  cerrarSesionesDe(id);

  await anotar({
    accion: "USUARIO_CLAVE",
    descripcion: `Restableció la contraseña de ${u.usuario}`,
    entidad: "USUARIO",
    entidadId: id,
  });

  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: `Dale esta contraseña a ${u.nombre}. Se la va a pedir cambiar al entrar.` };
}

export async function guardarRol(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) {
    await anotarDenegado("ROL_EDITA", "Intento de cambiar permisos sin permiso", "ROL");
    return { ok: false, error: permiso.error };
  }
  const yo = await usuarioActual();

  const id = Number(datos.get("id")) || 0;
  const nombre = texto(datos, "nombre");
  const descripcion = texto(datos, "descripcion");
  const permisos = permisosValidos(datos.getAll("permisos").map(String));
  if (!nombre) return { ok: false, error: "Ponle nombre al rol." };

  if (!id) {
    const clave = nombre
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .slice(0, 30);
    if (db.prepare("SELECT id FROM roles WHERE clave = ?").get(clave)) {
      return { ok: false, error: `Ya existe un rol que se llama así.` };
    }
    const res = db
      .prepare("INSERT INTO roles (clave, nombre, descripcion, todo, sistema) VALUES (?, ?, ?, 0, 0)")
      .run(clave, nombre, descripcion || null);
    const nuevoId = Number(res.lastInsertRowid);
    const ins = db.prepare("INSERT OR IGNORE INTO rol_permisos (rol_id, permiso) VALUES (?, ?)");
    for (const p of permisos) ins.run(nuevoId, p);

    await anotar({
      accion: "ROL_ALTA",
      descripcion: `Creó el rol ${nombre}`,
      entidad: "ROL",
      entidadId: nuevoId,
      despues: { nombre, permisos },
    });
    revalidatePath("/configuracion/usuarios");
    return { ok: true, mensaje: `Rol "${nombre}" creado.` };
  }

  const rol = db.prepare("SELECT clave, nombre, todo FROM roles WHERE id = ?").get(id) as
    | { clave: string; nombre: string; todo: number }
    | undefined;
  if (!rol) return { ok: false, error: "Ese rol ya no existe." };
  if (rol.todo === 1) {
    return { ok: false, error: "El superadministrador siempre puede todo; sus permisos no se editan." };
  }
  // Quitarse a uno mismo la llave de la puerta deja el sistema sin quien lo abra.
  if (yo && yo.rol_id === id && !permisos.includes(PERMISO)) {
    return { ok: false, error: "No puedes quitarle a tu propio rol la administración de usuarios." };
  }

  const antes = (db.prepare("SELECT permiso FROM rol_permisos WHERE rol_id = ?").all(id) as { permiso: string }[]).map(
    (r) => r.permiso
  );

  db.prepare("UPDATE roles SET nombre = ?, descripcion = ? WHERE id = ?").run(nombre, descripcion || null, id);
  db.prepare("DELETE FROM rol_permisos WHERE rol_id = ?").run(id);
  const ins = db.prepare("INSERT OR IGNORE INTO rol_permisos (rol_id, permiso) VALUES (?, ?)");
  for (const p of permisos) ins.run(id, p);

  await anotar({
    accion: "ROL_EDITA",
    descripcion: `Cambió los permisos del rol ${nombre}`,
    entidad: "ROL",
    entidadId: id,
    antes: antes.sort(),
    despues: [...permisos].sort(),
  });

  revalidatePath("/configuracion/usuarios");
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Permisos guardados." };
}

export async function eliminarRol(datos: FormData): Promise<ResultadoAccion> {
  const permiso = await comprobar(PERMISO);
  if ("error" in permiso) return { ok: false, error: permiso.error };

  const id = Number(datos.get("id"));
  const rol = db.prepare("SELECT nombre, sistema FROM roles WHERE id = ?").get(id) as
    | { nombre: string; sistema: number }
    | undefined;
  if (!rol) return { ok: false, error: "Ese rol ya no existe." };
  if (rol.sistema === 1) return { ok: false, error: "Los roles que trae el sistema no se borran; desactívalos si no los usas." };

  const enUso = (db.prepare("SELECT COUNT(*) AS c FROM usuarios WHERE rol_id = ?").get(id) as { c: number }).c;
  if (enUso > 0) {
    return { ok: false, error: `Hay ${enUso} ${enUso === 1 ? "persona" : "personas"} con este rol. Cámbialas de rol primero.` };
  }

  db.prepare("DELETE FROM roles WHERE id = ?").run(id);
  await anotar({ accion: "ROL_BAJA", descripcion: `Eliminó el rol ${rol.nombre}`, entidad: "ROL", entidadId: id });
  revalidatePath("/configuracion/usuarios");
  return { ok: true, mensaje: "Rol eliminado." };
}
