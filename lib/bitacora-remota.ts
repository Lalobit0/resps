import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { db, getConfig } from "./db";
import { ETIQ_SISTEMAS } from "./constants";

/**
 * Hojas del formato FSI-04 (bitácora de conexión remota) con los datos que ya
 * están en el sistema: quién es el usuario y qué máquina tiene. Lo demás —la
 * fecha real, las casillas, los hallazgos y la firma— se llena a mano al hacer
 * la revisión, que es lo único que da fe de que ocurrió.
 */

const W = 612; // Carta
const H = 792;
const M = 40;
const ANCHO = W - 2 * M;

const NAVY = rgb(0, 0.216, 0.392);
const RED = rgb(0.918, 0, 0.161);
const INK = rgb(0.12, 0.12, 0.13);
const GRIS = rgb(0.42, 0.42, 0.45);
const LINEA = rgb(0.72, 0.74, 0.78);
const RELLENO = rgb(0.93, 0.95, 0.97);

/** Los nueve puntos que revisa el formato. */
export const PUNTOS_REVISION = [
  "Equipo bloqueado",
  "Internet",
  "Páginas de trabajo",
  "Carpetas",
  "Carpetas de depto.",
  "Accesos",
  "Contraseñas",
  "Software",
  "Teams",
];

export type FilaBitacora = {
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  area: string | null;
  correo: string | null;
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  nombre_computadora: string | null;
};

/** Empleados activos con equipo de cómputo entregado: los que se revisan. */
export function empleadosParaBitacora(filtros: { departamento?: string; empleadoId?: number }): FilaBitacora[] {
  const cond: string[] = ["em.activo = 1", "e.tipo = 'COMPUTO'", "e.estado = 'ASIGNADO'"];
  const val: (string | number)[] = [];
  if (filtros.departamento) {
    cond.push("em.departamento = ?");
    val.push(filtros.departamento);
  }
  if (filtros.empleadoId) {
    cond.push("em.id = ?");
    val.push(filtros.empleadoId);
  }
  return db
    .prepare(
      `SELECT em.numero_empleado, em.nombre, em.puesto, em.departamento, em.area, em.correo,
              e.codigo, e.marca, e.modelo, e.numero_serie,
              json_extract(e.detalles, '$.nombre_computadora') AS nombre_computadora
       FROM empleados em
       JOIN equipos e ON e.asignado_a = em.id
       WHERE ${cond.join(" AND ")}
       ORDER BY em.departamento ASC, COALESCE(em.area,'') ASC, em.nombre ASC`
    )
    .all(...val) as FilaBitacora[];
}

function limpiar(t: string): string {
  return (t || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function cargarLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "sultana-logo.png"));
  } catch {
    return null;
  }
}

/** Arma el PDF con una hoja por empleado (o varias, si se piden copias). */
export async function hojasBitacoraRemota(filas: FilaBitacora[], copias = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("FSI-04 Bitácora de conexión remota");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = cargarLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  const empresa = getConfig("empresa");
  const direccion = getConfig("direccion");
  const etiquetaFirma = getConfig("firma_sistemas", ETIQ_SISTEMAS);

  const hoja = (f: FilaBitacora) => {
    const page: PDFPage = doc.addPage([W, H]);
    let y = H - M;

    const texto = (s: string, x: number, yy: number, size: number, ft: PDFFont = font, color = INK) =>
      page.drawText(limpiar(s), { x, y: yy, size, font: ft, color });

    // ---- Encabezado ----
    const logoW = 130;
    const logoH = logo ? (logo.height / logo.width) * logoW : 0;
    if (logo) page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
    const idForm = "FSI-04 Rev.00";
    texto(idForm, W - M - font.widthOfTextAtSize(idForm, 9), y - 10, 9, font, GRIS);
    const titulo = "BITACORA CONEXION REMOTA";
    texto(titulo, W - M - bold.widthOfTextAtSize(titulo, 12), y - 26, 12, bold, NAVY);
    y -= Math.max(logoH, 34) + 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: RED });
    y -= 16;

    /** Título de sección en barra. */
    const seccion = (t: string) => {
      page.drawRectangle({ x: M, y: y - 15, width: ANCHO, height: 15, color: NAVY });
      texto(t, M + 6, y - 11, 8.5, bold, rgb(1, 1, 1));
      y -= 15;
    };

    /**
     * Renglón de campos. Los que traen valor salen impresos; los que no, con la
     * línea en blanco para escribir a mano.
     */
    const renglon = (campos: { etiqueta: string; valor?: string | null; ancho: number }[]) => {
      const alto = 26;
      let x = M;
      for (const c of campos) {
        const w = ANCHO * c.ancho;
        page.drawRectangle({ x, y: y - alto, width: w, height: alto, borderColor: LINEA, borderWidth: 0.7 });
        texto(c.etiqueta, x + 5, y - 9, 6.5, bold, GRIS);
        const v = (c.valor ?? "").trim();
        if (v) {
          // Se encoge si no cabe, antes que salirse de la celda.
          let size = 8.5;
          while (size > 5.5 && font.widthOfTextAtSize(limpiar(v), size) > w - 10) size -= 0.5;
          texto(v, x + 5, y - 20, size, font);
        } else {
          page.drawLine({ start: { x: x + 5, y: y - 21 }, end: { x: x + w - 5, y: y - 21 }, thickness: 0.5, color: LINEA });
        }
        x += w;
      }
      y -= alto;
    };

    // ---- Datos del usuario ----
    seccion("DATOS DEL USUARIO");
    renglon([
      { etiqueta: "Nombre", valor: f.nombre, ancho: 0.62 },
      { etiqueta: "Num. de empleado", valor: f.numero_empleado, ancho: 0.38 },
    ]);
    renglon([
      { etiqueta: "Area de trabajo", valor: [f.departamento, f.area].filter(Boolean).join(" / "), ancho: 0.38 },
      { etiqueta: "Cargo", valor: f.puesto, ancho: 0.32 },
      { etiqueta: "Correo", valor: f.correo, ancho: 0.3 },
    ]);

    // ---- Datos del equipo ----
    y -= 8;
    seccion("DATOS DEL EQUIPO");
    renglon([
      { etiqueta: "Marca y Modelo", valor: `${f.marca ?? ""} ${f.modelo ?? ""}`.trim(), ancho: 0.4 },
      { etiqueta: "Identificador del Equipo", valor: f.nombre_computadora || f.codigo, ancho: 0.3 },
      { etiqueta: "Serie", valor: f.numero_serie, ancho: 0.3 },
    ]);
    renglon([
      { etiqueta: "Fecha", ancho: 0.34 },
      { etiqueta: "Tipo de Revision", ancho: 0.66 },
    ]);

    // ---- Puntos de revisión ----
    y -= 8;
    seccion("PUNTOS DE REVISION REMOTA  —  marcar las revisiones");
    const filaAlto = 18;
    const colW = ANCHO / 2;
    const casillaW = 24;
    for (let i = 0; i < PUNTOS_REVISION.length; i += 2) {
      for (const [j, punto] of [PUNTOS_REVISION[i], PUNTOS_REVISION[i + 1]].entries()) {
        if (!punto) continue;
        const x = M + j * colW;
        page.drawRectangle({ x, y: y - filaAlto, width: colW, height: filaAlto, borderColor: LINEA, borderWidth: 0.7 });
        texto(punto, x + 6, y - 12.5, 8, font);
        // Dos casillas por punto, como en el formato: sí y no.
        for (const [k, cual] of ["Si", "No"].entries()) {
          const cx = x + colW - casillaW * 2 - 8 + k * casillaW;
          page.drawRectangle({ x: cx, y: y - 14, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
          texto(cual, cx + 11, y - 12.5, 6.5, font, GRIS);
        }
      }
      y -= filaAlto;
    }

    // ---- Resultado ----
    y -= 8;
    seccion("RESULTADO");
    const marcarSiNo = (etiqueta: string, x: number, w: number) => {
      page.drawRectangle({ x, y: y - 24, width: w, height: 24, borderColor: LINEA, borderWidth: 0.7 });
      texto(etiqueta, x + 5, y - 9, 6.5, bold, GRIS);
      for (const [k, cual] of ["Si", "No"].entries()) {
        const cx = x + w - 62 + k * 30;
        page.drawRectangle({ x: cx, y: y - 20, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
        texto(cual, cx + 11, y - 18.5, 7, font, GRIS);
      }
    };
    marcarSiNo("Revision Remota", M, ANCHO * 0.34);
    marcarSiNo("Uso indebido", M + ANCHO * 0.34, ANCHO * 0.33);
    page.drawRectangle({ x: M + ANCHO * 0.67, y: y - 24, width: ANCHO * 0.33, height: 24, borderColor: LINEA, borderWidth: 0.7 });
    texto("Evidencia", M + ANCHO * 0.67 + 5, y - 9, 6.5, bold, GRIS);
    page.drawLine({
      start: { x: M + ANCHO * 0.67 + 5, y: y - 19 },
      end: { x: W - M - 5, y: y - 19 },
      thickness: 0.5,
      color: LINEA,
    });
    y -= 24;

    // ---- Comentarios y observaciones ----
    const bloqueTexto = (etiqueta: string, alto: number) => {
      y -= 8;
      page.drawRectangle({ x: M, y: y - alto, width: ANCHO, height: alto, borderColor: LINEA, borderWidth: 0.7, color: RELLENO });
      texto(etiqueta, M + 5, y - 10, 7, bold, GRIS);
      for (let l = 1; l * 14 < alto - 12; l += 1) {
        page.drawLine({ start: { x: M + 6, y: y - 12 - l * 14 }, end: { x: W - M - 6, y: y - 12 - l * 14 }, thickness: 0.4, color: LINEA });
      }
      y -= alto;
    };
    bloqueTexto("Comentarios:", 82);
    bloqueTexto("Observaciones:", 82);

    // ---- Quien revisa ----
    y -= 8;
    seccion("DATOS DE QUIEN REVISA");
    renglon([
      { etiqueta: "Nombre", ancho: 0.4 },
      { etiqueta: "Puesto", ancho: 0.35 },
      { etiqueta: "Fecha de Revision", ancho: 0.25 },
    ]);

    // ---- Firma ----
    y -= 34;
    const anchoFirma = 240;
    const xFirma = (W - anchoFirma) / 2;
    page.drawLine({ start: { x: xFirma, y }, end: { x: xFirma + anchoFirma, y }, thickness: 0.9, color: INK });
    const pie = `Nombre y firma del ${etiquetaFirma}`;
    texto(pie, (W - font.widthOfTextAtSize(limpiar(pie), 8)) / 2, y - 11, 8, font);

    // ---- Pie de página ----
    page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.8, color: LINEA });
    const emp = limpiar(empresa).toUpperCase();
    texto(emp, (W - bold.widthOfTextAtSize(emp, 8)) / 2, 34, 8, bold, NAVY);
    const dir = limpiar(direccion);
    texto(dir, Math.max(M, (W - font.widthOfTextAtSize(dir, 6.5)) / 2), 24, 6.5, font, GRIS);
    texto(idForm, M, 14, 6.5, font, GRIS);
  };

  for (const f of filas) {
    for (let c = 0; c < Math.max(1, copias); c += 1) hoja(f);
  }

  return doc.save();
}
