import crypto from "crypto";
import fs from "fs";
import path from "path";
import { STORAGE_EXPEDIENTES } from "./db";

/**
 * Dónde viven los archivos del expediente y cómo se guardan.
 *
 * Tres cosas importan aquí:
 *
 * - Nada se sirve por ruta directa. Los archivos quedan fuera de `public/`
 *   justamente para que nadie los abra adivinando la dirección; salen por una
 *   ruta que primero revisa el permiso.
 * - El nombre en disco lo pone el sistema. El que trajo el archivo se guarda
 *   aparte para enseñárselo a la persona, pero nunca toca el disco: es la vía
 *   por la que se cuelan los `../..` y los nombres imposibles.
 * - Se calcula la huella del contenido, que sirve para detectar que subieron
 *   dos veces exactamente el mismo archivo.
 */

const MAX_ABSOLUTO_MB = 50;

export type ArchivoEntrante = {
  nombre: string;
  bytes: Buffer;
  mime: string;
};

export type Guardado = {
  ruta: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
  hash: string;
};

const EXTENSIONES_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return "";
  return nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mimeDe(nombre: string, mimeDeclarado?: string): string {
  return EXTENSIONES_MIME[extensionDe(nombre)] ?? mimeDeclarado ?? "application/octet-stream";
}

/** Se puede enseñar dentro del sistema sin obligar a descargarlo. */
export function seVeEnPantalla(mime: string | null): boolean {
  if (!mime) return false;
  return mime === "application/pdf" || mime.startsWith("image/");
}

/** Revisa lo que dice el tipo documental antes de escribir nada en disco. */
export function revisarArchivo(
  a: ArchivoEntrante,
  reglas: { formatos: string; tam_max_mb: number }
): string | null {
  if (!a.bytes.length) return `El archivo “${a.nombre}” llegó vacío.`;

  const permitidas = (reglas.formatos || "")
    .split(",")
    .map((f) => f.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  const ext = extensionDe(a.nombre);
  if (permitidas.length && !permitidas.includes(ext)) {
    return `“${a.nombre}” es ${ext ? `un archivo .${ext}` : "un archivo sin extensión"} y este documento solo acepta ${permitidas
      .map((f) => `.${f}`)
      .join(", ")}.`;
  }

  const limite = Math.min(reglas.tam_max_mb || MAX_ABSOLUTO_MB, MAX_ABSOLUTO_MB);
  const mb = a.bytes.length / (1024 * 1024);
  if (mb > limite) {
    return `“${a.nombre}” pesa ${mb.toFixed(1)} MB y el límite son ${limite} MB. Escanéalo en menor calidad o pártelo.`;
  }
  return null;
}

const trozoLimpio = (v: string) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase() || "archivo";

/**
 * Guarda un archivo y devuelve dónde quedó, en ruta relativa a la carpeta de
 * expedientes: así se puede mover la carpeta de lugar sin tocar la base.
 */
export function guardarArchivo(
  a: ArchivoEntrante,
  ubicacion: { empleadoId: number; codigoTipo: string; versionId: number; indice: number }
): Guardado {
  const carpeta = path.join(STORAGE_EXPEDIENTES, String(ubicacion.empleadoId), trozoLimpio(ubicacion.codigoTipo));
  fs.mkdirSync(carpeta, { recursive: true });

  const ext = extensionDe(a.nombre);
  const archivo = `v${ubicacion.versionId}-${ubicacion.indice + 1}-${trozoLimpio(
    a.nombre.replace(/\.[^.]+$/, "")
  )}${ext ? `.${ext}` : ""}`;
  const completa = path.join(carpeta, archivo);
  fs.writeFileSync(completa, a.bytes);

  return {
    ruta: path.relative(STORAGE_EXPEDIENTES, completa),
    nombreOriginal: a.nombre.slice(0, 200),
    mime: mimeDe(a.nombre, a.mime),
    tamano: a.bytes.length,
    hash: crypto.createHash("sha256").update(a.bytes).digest("hex"),
  };
}

/**
 * Ruta absoluta de un archivo guardado, comprobando que de verdad esté dentro
 * de la carpeta de expedientes. Sin esto, un renglón manipulado en la base
 * podría apuntar a cualquier archivo del servidor.
 */
export function rutaAbsoluta(relativa: string): string | null {
  const completa = path.resolve(STORAGE_EXPEDIENTES, relativa);
  const raiz = path.resolve(STORAGE_EXPEDIENTES);
  if (completa !== raiz && !completa.startsWith(raiz + path.sep)) return null;
  return fs.existsSync(completa) ? completa : null;
}
