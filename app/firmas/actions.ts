"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { ROLES_FIRMA, type RolFirma } from "../../lib/constants";
import type { ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/firmas");
  revalidatePath("/responsivas");
  revalidatePath("/responsivas/nueva");
}

// ~1.5 MB de data URL: de sobra para una firma y evita guardar fotos completas.
const MAX_IMAGEN = 1_500_000;

/** Valida que la imagen sea un PNG/JPG en data URL y de tamaño razonable. */
function validarImagenFirma(imagen: string): string | null {
  if (!imagen) return "Falta la firma: dibújala o carga un archivo.";
  if (!/^data:image\/(png|jpe?g);base64,/i.test(imagen)) return "La firma debe ser una imagen PNG o JPG.";
  if (imagen.length > MAX_IMAGEN) return "La imagen de la firma es demasiado grande. Usa solo el recorte de la firma.";
  return null;
}

export async function guardarFirma(datos: {
  id?: number;
  nombre: string;
  puesto: string;
  rol: string;
  imagen: string;
}): Promise<ResultadoAccion> {
  try {
    const nombre = datos.nombre.trim();
    if (!nombre) return { ok: false, error: "Escribe el nombre de quien firma." };

    const rol = (ROLES_FIRMA as readonly string[]).includes(datos.rol) ? (datos.rol as RolFirma) : "OTRO";
    const puesto = datos.puesto.trim();

    if (datos.id) {
      // Sin imagen nueva se conserva la que ya tenía.
      if (datos.imagen) {
        const error = validarImagenFirma(datos.imagen);
        if (error) return { ok: false, error };
        db.prepare("UPDATE firmas SET nombre=?, puesto=?, rol=?, imagen=? WHERE id=?").run(
          nombre,
          puesto,
          rol,
          datos.imagen,
          datos.id
        );
      } else {
        db.prepare("UPDATE firmas SET nombre=?, puesto=?, rol=? WHERE id=?").run(nombre, puesto, rol, datos.id);
      }
      revalidar();
      return { ok: true, id: datos.id };
    }

    const error = validarImagenFirma(datos.imagen);
    if (error) return { ok: false, error };

    const info = db
      .prepare("INSERT INTO firmas (nombre, puesto, rol, imagen) VALUES (?,?,?,?)")
      .run(nombre, puesto, rol, datos.imagen);
    revalidar();
    return { ok: true, id: Number(info.lastInsertRowid) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la firma." };
  }
}

export async function eliminarFirma(id: number): Promise<ResultadoAccion> {
  try {
    const firma = db.prepare("SELECT id FROM firmas WHERE id = ?").get(id);
    if (!firma) return { ok: false, error: "La firma ya no existe." };
    // Las responsivas ya firmadas guardan su propia copia, así que no se afectan.
    db.prepare("DELETE FROM firmas WHERE id = ?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar la firma." };
  }
}
