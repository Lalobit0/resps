import { db } from "./db";
import { detectarDuplicados, type EquipoRevisable } from "./duplicados";
import { revisarCelulares } from "./celulares";
import { equiposPorLigar, paresPartidos, totalSinFirma, totalSinResponsiva } from "./pendientes";

/**
 * Todo lo que el sistema quiere avisar, en un solo lugar. Antes cada pantalla
 * abría su propia barra de color y entre tres o cuatro se comían la mitad de
 * la ventana; ahora viven en la campana y la pantalla queda para trabajar.
 */
export type Aviso = {
  clave: string;
  /** Cuántos casos: es el número que se ve en el globito. */
  total: number;
  titulo: string;
  detalle: string;
  /** A dónde lleva; la vista de destino abre su barra con el botón de la acción. */
  href: string;
  etiquetaAccion: string;
  tono: "ambar" | "sky" | "rojo";
};

export function recolectarAvisos(): Aviso[] {
  const avisos: Aviso[] = [];

  // 1. Teléfonos del listado de telefonía que no están en el inventario.
  try {
    const cel = revisarCelulares();
    if (cel.faltan.length) {
      avisos.push({
        clave: "celulares",
        total: cel.faltan.length,
        titulo: `${cel.faltan.length} teléfono(s) sin registrar`,
        detalle: `El listado de telefonía tiene ${cel.total} y al inventario le faltan ${cel.faltan.length}.`,
        href: "/inventario?faltancel=1",
        etiquetaAccion: "Agregarlos al inventario",
        tono: "ambar",
      });
    }
  } catch {
    // Sin listado de telefonía cargado no hay nada que avisar.
  }

  // 2. Equipos entregados sin su carta.
  const sinResp = totalSinResponsiva();
  if (sinResp) {
    avisos.push({
      clave: "sin-responsiva",
      total: sinResp,
      titulo: `${sinResp} equipo(s) sin carta responsiva`,
      detalle: "Están entregados pero no tienen carta. Se pueden generar todas juntas e imprimir el paquete.",
      href: "/responsivas/generar",
      etiquetaAccion: "Generar en lote",
      tono: "sky",
    });
  }

  // 3. Cartas generadas que siguen esperando su firma en papel.
  const sinFirma = totalSinFirma();
  if (sinFirma) {
    avisos.push({
      clave: "sin-firma",
      total: sinFirma,
      titulo: `${sinFirma} responsiva(s) sin firmar`,
      detalle: "Ya están generadas: imprímelas, recoge las firmas y sube el documento firmado.",
      href: "/responsivas?firma=sin",
      etiquetaAccion: "Ver las que faltan",
      tono: "ambar",
    });
  }

  // 4. La misma entrega partida en dos cartas: una con la firma, otra con el equipo.
  const partidas = paresPartidos();
  if (partidas.length) {
    avisos.push({
      clave: "partidas",
      total: partidas.length,
      titulo: `${partidas.length} carta(s) partidas en dos`,
      detalle: "El escaneo se guardó como carta aparte. Se pueden unir en una sola sin perder nada.",
      href: "/responsivas?partidas=1",
      etiquetaAccion: "Ver y unir",
      tono: "rojo",
    });
  }

  // 5. Equipos con carta vigente a los que les falta el empleado en el inventario.
  const porLigar = equiposPorLigar();
  if (porLigar.length) {
    avisos.push({
      clave: "por-ligar",
      total: porLigar.length,
      titulo: `${porLigar.length} equipo(s) por ligar a su empleado`,
      detalle: "Tienen carta responsiva vigente pero en el inventario aparecen sin dueño.",
      href: "/inventario?ligar=1",
      etiquetaAccion: "Ligarlos",
      tono: "sky",
    });
  }

  // 6. Datos repetidos en el inventario.
  const duplicados = detectarDuplicados(
    db.prepare("SELECT id, codigo, numero_serie, detalles FROM equipos").all() as EquipoRevisable[]
  );
  const totalDup = Object.keys(duplicados).length;
  if (totalDup) {
    avisos.push({
      clave: "duplicados",
      total: totalDup,
      titulo: `${totalDup} equipo(s) con datos repetidos`,
      detalle: "Casi siempre es el mismo aparato capturado dos veces. Se comparan uno junto al otro y se unen.",
      href: "/inventario/duplicados",
      etiquetaAccion: "Revisarlos y unirlos",
      tono: "ambar",
    });
  }

  return avisos;
}
