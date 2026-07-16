"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import type { ResultadoAccion } from "../../lib/types";

export async function guardarPlantilla(clave: string, contenido: string): Promise<ResultadoAccion> {
  try {
    if (!contenido.trim()) return { ok: false, error: "La plantilla no puede quedar vacía." };
    if (!contenido.includes("{{tabla_equipos}}")) {
      return { ok: false, error: "La plantilla debe incluir el marcador {{tabla_equipos}} para saber dónde va la tabla." };
    }
    db.prepare("UPDATE plantillas SET contenido = ? WHERE clave = ?").run(contenido, clave);
    revalidatePath("/plantillas");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la plantilla." };
  }
}

export async function guardarConfig(datos: {
  empresa: string;
  ciudad: string;
  entrega_default: string;
}): Promise<ResultadoAccion> {
  try {
    const upsert = db.prepare(
      "INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
    );
    upsert.run("empresa", datos.empresa.trim() || "Sultana Packaging");
    upsert.run("ciudad", datos.ciudad.trim() || "Tijuana, Baja California");
    upsert.run("entrega_default", datos.entrega_default.trim() || "Departamento de TI");
    revalidatePath("/plantillas");
    revalidatePath("/responsivas/nueva");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la configuración." };
  }
}
