import fs from "fs";
import path from "path";
import { db } from "./db";

/**
 * El listado de telefonía (scripts/celulares-oficial.json) manda sobre el
 * inventario: si un teléfono está ahí, tiene que existir en el sistema.
 * Aquí se compara lo uno contra lo otro para poder avisar en pantalla.
 */

export type CelularOficial = {
  linea?: string;
  num?: string;
  usuario?: string;
  area?: string;
  modelo?: string;
  serie?: string;
  imei: string;
  imei2?: string;
  cond?: string;
  pin?: string;
  icloud?: string;
  mac?: string;
  plan?: string;
  gb?: string;
  precio?: string;
};

export type RevisionCelulares = {
  total: number;
  faltan: CelularOficial[];
  sobran: { id: number; codigo: string; modelo: string; imei: string }[];
};

const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Listado oficial de telefonía. Si el archivo no existe, no hay nada que revisar. */
export function listaOficial(): CelularOficial[] {
  try {
    const ruta = path.join(process.cwd(), "scripts", "celulares-oficial.json");
    const { celulares } = JSON.parse(fs.readFileSync(ruta, "utf8")) as { celulares: CelularOficial[] };
    return (celulares ?? []).filter((c) => soloDigitos(c.imei).length >= 10);
  } catch {
    return [];
  }
}

/** Qué teléfonos del listado no están en el inventario y cuáles sobran. */
export function revisarCelulares(): RevisionCelulares {
  const oficiales = listaOficial();
  if (!oficiales.length) return { total: 0, faltan: [], sobran: [] };

  const enSistema = db
    .prepare("SELECT id, codigo, modelo, detalles FROM equipos WHERE tipo = 'CELULAR'")
    .all() as { id: number; codigo: string; modelo: string; detalles: string | null }[];

  const conImei = enSistema.map((e) => {
    let det: Record<string, unknown> = {};
    try {
      det = e.detalles ? (JSON.parse(e.detalles) as Record<string, unknown>) : {};
    } catch {
      det = {};
    }
    return { ...e, imei: soloDigitos(det.imei) };
  });

  const imeisSistema = new Set(conImei.map((e) => e.imei).filter(Boolean));
  const imeisOficial = new Set(oficiales.map((c) => soloDigitos(c.imei)));

  return {
    total: oficiales.length,
    faltan: oficiales.filter((c) => !imeisSistema.has(soloDigitos(c.imei))),
    sobran: conImei
      .filter((e) => !imeisOficial.has(e.imei))
      .map((e) => ({ id: e.id, codigo: e.codigo, modelo: e.modelo, imei: e.imei })),
  };
}
