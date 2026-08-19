"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ResponsivaLista } from "../lib/types";
import { CLASES_CARTA, ETIQUETA_CLASE } from "../lib/constants";
import { fechaCorta } from "../lib/helpers";
import { Badge, Card, btnGhost } from "./ui";
import { EncabezadoTabla, ordenarFilas, useTabla, type ColumnaTabla } from "./tabla";
import EliminarResponsivaBtn from "./EliminarResponsivaBtn";
import SubirFirmadaBtn from "./SubirFirmadaBtn";
import { EditarClaseBtn } from "./ClaseResponsiva";
import CorregirResponsivaBtn from "./CorregirResponsivaBtn";
import VerPdfBtn from "./VerPdfBtn";
import RegenerarResponsivaBtn from "./RegenerarResponsivaBtn";

/**
 * Listado de cartas responsivas.
 *
 * Las columnas se ajustan de ancho y los títulos hacen algo al pulsarlos: las
 * de pocos valores —tipo, carta, estado, firma— filtran la lista, y las demás
 * la ordenan. El filtro que pone el título es el mismo de los desplegables de
 * arriba, así que los dos se ven siempre igual.
 */

const COLUMNAS: ColumnaTabla[] = [
  { clave: "folio", etiqueta: "Folio", ancho: 9 },
  { clave: "tipo", etiqueta: "Tipo", ancho: 8, filtra: true },
  { clave: "carta", etiqueta: "Carta", ancho: 8, filtra: true },
  { clave: "numero", etiqueta: "No.", ancho: 4 },
  { clave: "empleado", etiqueta: "Empleado", ancho: 14 },
  { clave: "equipos", etiqueta: "Equipos", ancho: 8 },
  { clave: "fecha", etiqueta: "Fecha", ancho: 7 },
  { clave: "estado", etiqueta: "Estado", ancho: 7, filtra: true },
  { clave: "firma", etiqueta: "Firma", ancho: 7, filtra: true },
  { clave: "acciones", etiqueta: "Acciones", ancho: 28, ordenable: false },
];

/** Qué valores recorre cada título que filtra, y con qué nombre se ven. */
const CICLOS: Record<string, { param: string; opciones: { valor: string; etiqueta: string }[] }> = {
  tipo: {
    param: "tipo",
    opciones: [
      { valor: "ASIGNACION", etiqueta: "Asignación" },
      { valor: "DEVOLUCION", etiqueta: "Devolución" },
    ],
  },
  carta: {
    param: "clase",
    opciones: CLASES_CARTA.map((c) => ({ valor: c, etiqueta: ETIQUETA_CLASE[c] ?? c })),
  },
  estado: {
    param: "estado",
    opciones: [
      { valor: "VIGENTE", etiqueta: "Vigente" },
      { valor: "CERRADA", etiqueta: "Cerrada" },
    ],
  },
  firma: {
    param: "firma",
    opciones: [
      { valor: "sin", etiqueta: "Sin firmar" },
      { valor: "con", etiqueta: "Firmadas" },
    ],
  },
};

const tdc = "px-2 py-2 text-sm text-ink align-top";

/** La carta se firma en papel: falta mientras no se suba el escaneo. */
const faltaFirma = (r: ResponsivaLista) => r.origen !== "CARGADA" && !r.pdf_firmado;

export default function ResponsivasClient({ responsivas }: { responsivas: ResponsivaLista[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { anchos, orden, empezarArrastre, alternarOrden } = useTabla("responsivas", COLUMNAS);

  const valorColumna = (r: ResponsivaLista, clave: string): string | number | null => {
    switch (clave) {
      case "folio":
        return r.folio;
      case "numero":
        return Number(r.empleado_numero) || 0;
      case "empleado":
        return r.empleado_nombre;
      case "equipos":
        return r.equipos ?? "";
      case "fecha":
        return r.fecha;
      default:
        return "";
    }
  };

  const ordenadas = ordenarFilas(responsivas, orden, COLUMNAS, valorColumna);

  // El filtro puesto en cada columna, para pintarlo junto al título.
  const marcas: Record<string, string> = {};
  const titulos: Record<string, string> = {};
  for (const [clave, ciclo] of Object.entries(CICLOS)) {
    const actual = sp.get(ciclo.param) ?? "";
    const puesta = ciclo.opciones.find((o) => o.valor === actual);
    if (puesta) marcas[clave] = puesta.etiqueta;
    const i = ciclo.opciones.findIndex((o) => o.valor === actual);
    const siguiente = ciclo.opciones[i + 1];
    titulos[clave] = siguiente ? `Pulsa para ver solo: ${siguiente.etiqueta}` : "Pulsa para quitar este filtro";
  }

  /** Un clic en el título pasa al siguiente valor; al terminar, quita el filtro. */
  const filtrarPor = (clave: string) => {
    const ciclo = CICLOS[clave];
    if (!ciclo) return;
    const actual = sp.get(ciclo.param) ?? "";
    const i = ciclo.opciones.findIndex((o) => o.valor === actual);
    const siguiente = ciclo.opciones[i + 1]?.valor ?? "";
    const params = new URLSearchParams(sp.toString());
    if (siguiente) params.set(ciclo.param, siguiente);
    else params.delete(ciclo.param);
    const cadena = params.toString();
    router.push(cadena ? `/responsivas?${cadena}` : "/responsivas");
  };

  const alPulsar = (c: ColumnaTabla) => {
    if (c.filtra) filtrarPor(c.clave);
    else alternarOrden(c);
  };

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[1250px] table-fixed border-collapse" data-tabla="responsivas">
        <EncabezadoTabla
          columnas={COLUMNAS}
          anchos={anchos}
          orden={orden}
          onOrdenar={alPulsar}
          onArrastrar={empezarArrastre}
          marcas={marcas}
          titulos={titulos}
        />
        <tbody>
          {ordenadas.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-soft" colSpan={COLUMNAS.length}>
                Ningún documento cumple con estos filtros. Vuelve a pulsar el título de la columna o quita el filtro de
                arriba.
              </td>
            </tr>
          ) : null}
          {ordenadas.map((r) => (
            <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
              <td className={`${tdc} mono text-xs font-semibold`}>
                {r.folio}
                {(r.es_duplicado ?? 0) > 0 ? (
                  <div className="mt-1">
                    <Badge tono="rojo">Posible duplicado</Badge>
                  </div>
                ) : null}
              </td>
              <td className={tdc}>
                {r.tipo === "ASIGNACION" ? <Badge tono="petrol">Asignación</Badge> : <Badge tono="kraft">Devolución</Badge>}
              </td>
              <td className={`${tdc} text-xs`}>{ETIQUETA_CLASE[r.clase] ?? r.clase}</td>
              <td className={`${tdc} mono text-xs`}>{r.empleado_numero}</td>
              <td className={`${tdc} font-medium`}>
                <Link href={`/empleados/${r.empleado_id}`} className="text-ink hover:text-kraft hover:underline" title="Ver histórico">
                  {r.empleado_nombre}
                </Link>
              </td>
              <td className={`${tdc} mono text-xs`}>{r.equipos ?? "—"}</td>
              <td className={tdc}>{fechaCorta(r.fecha)}</td>
              <td className={tdc}>
                {r.tipo === "DEVOLUCION" ? (
                  <span className="text-soft">—</span>
                ) : r.estado === "VIGENTE" ? (
                  <Badge tono="verde">Vigente</Badge>
                ) : (
                  <Badge tono="gris">Cerrada</Badge>
                )}
              </td>
              <td className={tdc}>
                {faltaFirma(r) ? (
                  <Badge tono="rojo">Sin firmar</Badge>
                ) : (
                  <>
                    <Badge tono="verde">Firmada</Badge>
                    {r.origen === "CARGADA" ? <div className="mt-1 text-[11px] text-soft">escaneo cargado</div> : null}
                  </>
                )}
              </td>
              <td className={tdc}>
                <div className="flex flex-wrap gap-1.5">
                  {r.pdf_path || r.pdf_firmado ? (
                    <VerPdfBtn
                      id={r.id}
                      folio={r.folio}
                      className={btnGhost}
                      subtitulo={`${r.empleado_numero} ${r.empleado_nombre} · ${fechaCorta(r.fecha)}`}
                    />
                  ) : null}
                  {faltaFirma(r) ? (
                    <>
                      <a href={`/api/pdf/${r.id}?original=1`} target="_blank" className={btnGhost}>
                        Imprimir
                      </a>
                      <SubirFirmadaBtn responsivaId={r.id} folio={r.folio} className={btnGhost} />
                    </>
                  ) : null}
                  <EditarClaseBtn id={r.id} folio={r.folio} clase={r.clase} tipo={r.tipo} />
                  <CorregirResponsivaBtn id={r.id} folio={r.folio} tipo={r.tipo} />
                  <RegenerarResponsivaBtn id={r.id} folio={r.folio} origen={r.origen} firmada={!!r.pdf_firmado} />
                  {r.tipo === "ASIGNACION" && r.estado === "VIGENTE" && r.clase !== "WIFI" && r.clase !== "VALE" ? (
                    <Link href={`/responsivas/${r.id}/devolucion`} className={btnGhost}>
                      Registrar devolución
                    </Link>
                  ) : null}
                  <EliminarResponsivaBtn id={r.id} folio={r.folio} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
