"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { db, BACKUP_DIR, DB_PATH } from "../../lib/db";
import type { ResultadoAccion } from "../../lib/types";
import { exigir } from "../../lib/auth";

const NOMBRE_OK = /^app-\d{8}-\d{6}\.db$/;

function selloDeTiempo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function crearRespaldo(): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const nombre = `app-${selloDeTiempo()}.db`;
    // Copia en caliente y consistente de la base (incluye lo que esté en el WAL).
    await db.backup(path.join(BACKUP_DIR, nombre));
    revalidatePath("/respaldos");
    return { ok: true, mensaje: `Respaldo creado: ${nombre}` };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo crear el respaldo." };
  }
}

export async function eliminarRespaldo(nombre: string): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    if (!NOMBRE_OK.test(nombre)) return { ok: false, error: "Nombre de respaldo no válido." };
    fs.rmSync(path.join(BACKUP_DIR, nombre), { force: true });
    revalidatePath("/respaldos");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el respaldo." };
  }
}

export async function restaurarRespaldo(nombre: string): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    if (!NOMBRE_OK.test(nombre)) return { ok: false, error: "Nombre de respaldo no válido." };
    const origen = path.join(BACKUP_DIR, nombre);
    if (!fs.existsSync(origen)) return { ok: false, error: "Ese respaldo ya no existe." };
    // Se marca para restaurar en el próximo arranque (intercambio seguro).
    fs.copyFileSync(origen, `${DB_PATH}.restore`);
    return {
      ok: true,
      mensaje: "Respaldo listo para restaurar. Cierra la app y vuelve a abrirla con iniciar.bat para aplicar los datos de ese respaldo.",
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo preparar la restauración." };
  }
}

export async function restaurarDesdeArchivo(formData: FormData): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    const archivo = formData.get("archivo") as File | null;
    if (!archivo || typeof archivo.arrayBuffer !== "function") return { ok: false, error: "No se recibió ningún archivo." };
    if (!/\.db$/i.test(archivo.name)) return { ok: false, error: "El archivo debe ser una base .db de Control TI." };
    const buf = Buffer.from(await archivo.arrayBuffer());
    // Verifica que sea una base SQLite (cabecera mágica).
    if (buf.subarray(0, 15).toString("latin1") !== "SQLite format 3") {
      return { ok: false, error: "El archivo no parece una base de datos válida." };
    }
    fs.writeFileSync(`${DB_PATH}.restore`, buf);
    return {
      ok: true,
      mensaje: "Archivo listo para restaurar. Cierra la app y vuelve a abrirla con iniciar.bat para aplicar esos datos.",
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo preparar la restauración desde archivo." };
  }
}

export async function cancelarRestauracion(): Promise<ResultadoAccion> {
  await exigir("config.administrar");
  try {
    fs.rmSync(`${DB_PATH}.restore`, { force: true });
    revalidatePath("/respaldos");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cancelar." };
  }
}
