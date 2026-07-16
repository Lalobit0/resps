"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { PREFIJO_CATEGORIA } from "../../lib/constants";
import type { Equipo, ResultadoAccion } from "../../lib/types";

function revalidar() {
  revalidatePath("/inventario");
  revalidatePath("/");
  revalidatePath("/responsivas/nueva");
  revalidatePath("/mantenimientos");
}

function generarCodigo(categoria: string): string {
  const prefijo = PREFIJO_CATEGORIA[categoria] ?? "EQP";
  let n = (db.prepare("SELECT COUNT(*) AS c FROM equipos WHERE categoria = ?").get(categoria) as { c: number }).c + 1;
  let codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  while (db.prepare("SELECT 1 FROM equipos WHERE codigo = ?").get(codigo)) {
    n += 1;
    codigo = `SP-${prefijo}-${String(n).padStart(3, "0")}`;
  }
  return codigo;
}

export async function guardarEquipo(datos: {
  id?: number;
  codigo: string;
  categoria: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  specs: string;
  fecha_compra: string;
  costo: string;
  estado: string;
  notas: string;
}): Promise<ResultadoAccion> {
  try {
    if (!datos.categoria || !datos.marca.trim() || !datos.modelo.trim()) {
      return { ok: false, error: "Categoría, marca y modelo son obligatorios." };
    }

    const costo = datos.costo.trim() ? Number(datos.costo) : null;
    if (costo !== null && Number.isNaN(costo)) return { ok: false, error: "El costo debe ser un número." };

    let codigo = datos.codigo.trim().toUpperCase();

    if (datos.id) {
      const actual = db.prepare("SELECT * FROM equipos WHERE id = ?").get(datos.id) as Equipo | undefined;
      if (!actual) return { ok: false, error: "El equipo ya no existe." };
      if (!codigo) codigo = actual.codigo;

      // El estado ASIGNADO se controla desde responsivas, no manualmente
      if (actual.estado === "ASIGNADO" && datos.estado !== "ASIGNADO") {
        return { ok: false, error: "Este equipo está asignado. Registra primero la devolución para cambiar su estado." };
      }
      if (actual.estado !== "ASIGNADO" && datos.estado === "ASIGNADO") {
        return { ok: false, error: "Para asignar un equipo genera una responsiva desde 'Nueva responsiva'." };
      }

      const duplicado = db.prepare("SELECT id FROM equipos WHERE codigo = ? AND id != ?").get(codigo, datos.id);
      if (duplicado) return { ok: false, error: `Ya existe un equipo con el código ${codigo}.` };

      db.prepare(
        `UPDATE equipos SET codigo=?, categoria=?, marca=?, modelo=?, numero_serie=?, specs=?, fecha_compra=?, costo=?, estado=?, notas=?,
         asignado_a = CASE WHEN ? = 'ASIGNADO' THEN asignado_a ELSE NULL END
         WHERE id=?`
      ).run(
        codigo,
        datos.categoria,
        datos.marca.trim(),
        datos.modelo.trim(),
        datos.numero_serie.trim() || null,
        datos.specs.trim() || null,
        datos.fecha_compra || null,
        costo,
        datos.estado,
        datos.notas.trim() || null,
        datos.estado,
        datos.id
      );
    } else {
      if (!codigo) codigo = generarCodigo(datos.categoria);
      const duplicado = db.prepare("SELECT id FROM equipos WHERE codigo = ?").get(codigo);
      if (duplicado) return { ok: false, error: `Ya existe un equipo con el código ${codigo}.` };
      const estado = datos.estado === "ASIGNADO" ? "DISPONIBLE" : datos.estado || "DISPONIBLE";
      db.prepare(
        "INSERT INTO equipos (codigo, categoria, marca, modelo, numero_serie, specs, fecha_compra, costo, estado, notas) VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).run(
        codigo,
        datos.categoria,
        datos.marca.trim(),
        datos.modelo.trim(),
        datos.numero_serie.trim() || null,
        datos.specs.trim() || null,
        datos.fecha_compra || null,
        costo,
        estado,
        datos.notas.trim() || null
      );
    }
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el equipo." };
  }
}

export async function eliminarEquipo(id: number): Promise<ResultadoAccion> {
  try {
    const equipo = db.prepare("SELECT estado FROM equipos WHERE id=?").get(id) as { estado: string } | undefined;
    if (!equipo) return { ok: false, error: "El equipo ya no existe." };
    if (equipo.estado === "ASIGNADO") {
      return { ok: false, error: "El equipo está asignado. Registra la devolución antes de eliminarlo." };
    }
    const enResponsivas = db.prepare("SELECT COUNT(*) AS c FROM responsiva_items WHERE equipo_id=?").get(id) as { c: number };
    const enMant = db.prepare("SELECT COUNT(*) AS c FROM mantenimientos WHERE equipo_id=?").get(id) as { c: number };
    if (enResponsivas.c > 0 || enMant.c > 0) {
      return { ok: false, error: "El equipo tiene historial de responsivas o mantenimientos. Cámbialo a estado 'Baja' en lugar de eliminarlo." };
    }
    db.prepare("DELETE FROM equipos WHERE id=?").run(id);
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el equipo." };
  }
}
