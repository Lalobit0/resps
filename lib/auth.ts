import crypto from "crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { CLAVES_PERMISO, type Permiso } from "./permisos";

/**
 * Quién está usando el sistema.
 *
 * Hasta ahora Control TI no lo preguntaba, y con inventario de una sola
 * persona alcanzaba. Con expedientes de personal ya no: hay que poder contestar
 * quién validó un documento, quién lo descargó y quién cambió un permiso. Todo
 * eso empieza aquí.
 *
 * La contraseña se guarda con scrypt (el que trae Node, sin librerías nuevas):
 * sal aleatoria por usuario y comparación en tiempo constante.
 */

export const COOKIE_SESION = "sesion";
/** Horas de inactividad antes de pedir la contraseña otra vez. */
const HORAS_SESION = 12;
/** Intentos fallidos seguidos antes de dejar descansar la cuenta unos minutos. */
const MAX_INTENTOS = 8;
const MINUTOS_BLOQUEO = 10;

export type UsuarioSesion = {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  rol_id: number;
  rol_clave: string;
  rol_nombre: string;
  /** El superadministrador no se limita con la lista de permisos. */
  todo: boolean;
  debe_cambiar: boolean;
  empleado_id: number | null;
  permisos: Set<string>;
};

// ---------------------------------------------------------------- contraseñas

export function hashClave(clave: string): string {
  const sal = crypto.randomBytes(16);
  const llave = crypto.scryptSync(clave.normalize("NFKC"), sal, 32);
  return `${sal.toString("hex")}:${llave.toString("hex")}`;
}

export function verificarClave(clave: string, hash: string): boolean {
  const [salHex, llaveHex] = (hash || "").split(":");
  if (!salHex || !llaveHex) return false;
  try {
    const esperado = Buffer.from(llaveHex, "hex");
    const calculado = crypto.scryptSync(clave.normalize("NFKC"), Buffer.from(salHex, "hex"), esperado.length);
    return crypto.timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

/** Reglas mínimas de contraseña. Devuelve el motivo si no pasa. */
export function revisarClave(clave: string): string | null {
  if (clave.length < 8) return "La contraseña necesita al menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(clave)) return "Ponle al menos una letra.";
  if (!/[0-9]/.test(clave)) return "Ponle al menos un número.";
  if (/^(?:admin|12345678|password|contrasena|contraseña)/i.test(clave)) return "Esa contraseña es demasiado fácil de adivinar.";
  return null;
}

// ------------------------------------------------------------------ el primer

/**
 * Sin usuarios nadie podría entrar nunca. La primera vez se crea una cuenta de
 * superadministrador con contraseña temporal, marcada para cambiarse en cuanto
 * entre. La pantalla de acceso lo avisa mientras siga sin cambiarse.
 */
export const USUARIO_INICIAL = "admin";
export const CLAVE_INICIAL = "admin";

export function haySoloCuentaInicial(): boolean {
  // Se crea aquí y no solo al intentar entrar: si no, la primera vez que
  // alguien abre el sistema no habría cuentas todavía y la pantalla de acceso
  // no podría decirle con qué entrar.
  asegurarCuentaInicial();
  const n = (db.prepare("SELECT COUNT(*) AS c FROM usuarios WHERE activo = 1").get() as { c: number }).c;
  if (n !== 1) return false;
  const u = db.prepare("SELECT debe_cambiar FROM usuarios WHERE usuario = ?").get(USUARIO_INICIAL) as
    | { debe_cambiar: number }
    | undefined;
  return !!u && u.debe_cambiar === 1;
}

export function asegurarCuentaInicial() {
  const n = (db.prepare("SELECT COUNT(*) AS c FROM usuarios").get() as { c: number }).c;
  if (n > 0) return;
  const rol = db.prepare("SELECT id FROM roles WHERE clave = 'SUPERADMIN'").get() as { id: number } | undefined;
  if (!rol) return;
  db.prepare(
    "INSERT INTO usuarios (usuario, nombre, rol_id, clave_hash, debe_cambiar) VALUES (?, ?, ?, ?, 1)"
  ).run(USUARIO_INICIAL, "Administrador", rol.id, hashClave(CLAVE_INICIAL));
}

// -------------------------------------------------------------------- sesión

function limpiarSesionesVencidas() {
  db.prepare("DELETE FROM sesiones WHERE expira <= datetime('now','localtime')").run();
}

export type ResultadoAcceso = { ok: true; token: string; debeCambiar: boolean } | { ok: false; error: string };

export function iniciarSesion(usuario: string, clave: string, ip: string, agente: string): ResultadoAcceso {
  asegurarCuentaInicial();
  const nombre = (usuario || "").trim().toLowerCase();
  if (!nombre || !clave) return { ok: false, error: "Escribe tu usuario y tu contraseña." };

  const u = db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(nombre) as
    | {
        id: number;
        clave_hash: string;
        activo: number;
        debe_cambiar: number;
        intentos_fallidos: number;
        bloqueado_hasta: string | null;
      }
    | undefined;

  // El mismo mensaje si el usuario no existe o la contraseña está mal: decir
  // cuál de las dos falló le regala información a quien esté probando.
  const generico = { ok: false as const, error: "Usuario o contraseña incorrectos." };
  if (!u) return generico;
  if (!u.activo) return { ok: false, error: "Esta cuenta está desactivada. Habla con el administrador." };

  if (u.bloqueado_hasta) {
    const sigueBloqueado = db
      .prepare("SELECT datetime('now','localtime') < ? AS b")
      .get(u.bloqueado_hasta) as { b: number };
    if (sigueBloqueado.b) {
      return { ok: false, error: `Demasiados intentos. Vuelve a intentar en unos ${MINUTOS_BLOQUEO} minutos.` };
    }
  }

  if (!verificarClave(clave, u.clave_hash)) {
    const intentos = u.intentos_fallidos + 1;
    if (intentos >= MAX_INTENTOS) {
      db.prepare(
        `UPDATE usuarios SET intentos_fallidos = 0,
           bloqueado_hasta = datetime('now','localtime','+${MINUTOS_BLOQUEO} minutes') WHERE id = ?`
      ).run(u.id);
      return { ok: false, error: `Demasiados intentos. Vuelve a intentar en unos ${MINUTOS_BLOQUEO} minutos.` };
    }
    db.prepare("UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?").run(intentos, u.id);
    return generico;
  }

  limpiarSesionesVencidas();
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sesiones (token, usuario_id, expira, ip, agente)
     VALUES (?, ?, datetime('now','localtime','+${HORAS_SESION} hours'), ?, ?)`
  ).run(token, u.id, ip || null, (agente || "").slice(0, 200) || null);
  db.prepare(
    "UPDATE usuarios SET ultimo_acceso = datetime('now','localtime'), intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?"
  ).run(u.id);

  return { ok: true, token, debeCambiar: u.debe_cambiar === 1 };
}

export function cerrarSesionToken(token: string) {
  db.prepare("DELETE FROM sesiones WHERE token = ?").run(token);
}

/** Cierra todas las sesiones abiertas de una persona (cambio de contraseña, baja). */
export function cerrarSesionesDe(usuarioId: number) {
  db.prepare("DELETE FROM sesiones WHERE usuario_id = ?").run(usuarioId);
}

function armarUsuario(fila: {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  rol_id: number;
  rol_clave: string;
  rol_nombre: string;
  todo: number;
  debe_cambiar: number;
  empleado_id: number | null;
}): UsuarioSesion {
  const permisos = new Set(
    (db.prepare("SELECT permiso FROM rol_permisos WHERE rol_id = ?").all(fila.rol_id) as { permiso: string }[]).map(
      (r) => r.permiso
    )
  );
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    correo: fila.correo,
    rol_id: fila.rol_id,
    rol_clave: fila.rol_clave,
    rol_nombre: fila.rol_nombre,
    todo: fila.todo === 1,
    debe_cambiar: fila.debe_cambiar === 1,
    empleado_id: fila.empleado_id,
    permisos,
  };
}

/**
 * Quién está pidiendo esta página. Se resuelve una sola vez por petición
 * aunque lo pregunten diez componentes.
 */
export const usuarioActual = cache(async (): Promise<UsuarioSesion | null> => {
  const bolsa = await cookies();
  const token = bolsa.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const fila = db
    .prepare(
      `SELECT u.id, u.usuario, u.nombre, u.correo, u.rol_id, u.debe_cambiar, u.empleado_id,
              r.clave AS rol_clave, r.nombre AS rol_nombre, r.todo
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN roles r ON r.id = u.rol_id
       WHERE s.token = ? AND s.expira > datetime('now','localtime') AND u.activo = 1 AND r.activo = 1`
    )
    .get(token) as Parameters<typeof armarUsuario>[0] | undefined;
  if (!fila) return null;

  // Sesión deslizante: mientras se use, no caduca.
  db.prepare(
    `UPDATE sesiones SET expira = datetime('now','localtime','+${HORAS_SESION} hours') WHERE token = ?`
  ).run(token);

  return armarUsuario(fila);
});

// ----------------------------------------------------------------- permisos

export function puede(u: UsuarioSesion | null, permiso: Permiso | string): boolean {
  if (!u) return false;
  if (u.todo) return true;
  return u.permisos.has(permiso);
}

/** Al menos uno de los permisos. Útil para decidir si un menú se enseña. */
export function puedeAlguno(u: UsuarioSesion | null, ...permisos: string[]): boolean {
  return permisos.some((p) => puede(u, p));
}

export class SinPermiso extends Error {
  constructor(public permiso: string) {
    super(`No tienes permiso para esto (${permiso}).`);
    this.name = "SinPermiso";
  }
}

/**
 * Corta la ejecución si quien pide no tiene el permiso.
 *
 * Va en el servidor, dentro de cada acción: esconder un botón no es seguridad,
 * y el punto 77 de la especificación lo pide explícitamente.
 */
export async function exigir(permiso: Permiso | string): Promise<UsuarioSesion> {
  const u = await usuarioActual();
  if (!puede(u, permiso)) throw new SinPermiso(permiso);
  return u as UsuarioSesion;
}

/** Igual que exigir, pero devuelve el error en vez de aventarlo. */
export async function comprobar(permiso: Permiso | string): Promise<{ u: UsuarioSesion } | { error: string }> {
  const u = await usuarioActual();
  if (!u) return { error: "Tu sesión expiró. Vuelve a entrar." };
  if (!puede(u, permiso)) return { error: "No tienes permiso para hacer esto." };
  return { u };
}

/** Solo los permisos que el código conoce; descarta los que quedaron de una versión anterior. */
export function permisosValidos(claves: string[]): string[] {
  const conocidos = new Set<string>(CLAVES_PERMISO);
  return [...new Set(claves)].filter((c) => conocidos.has(c));
}

// ------------------------------------------------------------------- petición

/** De dónde viene la petición, para la bitácora. */
export async function ipDeLaPeticion(): Promise<string> {
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return h.get("x-real-ip") ?? "";
}

export async function agenteDeLaPeticion(): Promise<string> {
  return (await headers()).get("user-agent") ?? "";
}
