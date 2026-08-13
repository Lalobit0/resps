"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tablas con columnas que se ajustan de ancho y encabezados que ordenan.
 *
 * El ancho se arrastra desde el borde derecho del título y se recuerda por
 * pantalla, así cada quien deja la tabla como la usa. Al pulsar un título se
 * ordena: en las columnas de pocos valores —estado, tipo— cada clic pone
 * delante el siguiente valor, que es como se revisa "primero los asignados,
 * ahora los disponibles"; en las demás alterna de la A a la Z y al revés.
 */

export type ColumnaTabla = {
  clave: string;
  etiqueta: string;
  /** Porcentaje inicial del ancho. Los de todas las columnas suman 100. */
  ancho: number;
  /** Se puede ordenar por ella. */
  ordenable?: boolean;
  /**
   * Columna de pocos valores: en vez de A-Z, cada clic sube al frente el
   * siguiente valor de esta lista.
   */
  valores?: string[];
  /** Alineación del contenido; solo cambia el título. */
  fin?: boolean;
};

export type Orden = {
  clave: string;
  /** Índice dentro de `valores` cuando la columna es de pocos valores. */
  paso: number;
  /** Para las demás: 1 de la A a la Z, -1 al revés. */
  dir: 1 | -1;
} | null;

/** Estado de anchos y orden de una tabla, recordado en el navegador. */
export function useTabla(clave: string, columnas: ColumnaTabla[]) {
  const [anchos, setAnchos] = useState<number[]>(() => columnas.map((c) => c.ancho));
  const [orden, setOrden] = useState<Orden>(null);
  const arrastre = useRef<{ i: number; x: number; a: number; b: number } | null>(null);

  // Los anchos guardados se leen ya montado, para no romper el render inicial.
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(`tabla:${clave}`);
      if (!crudo) return;
      const guardados = JSON.parse(crudo) as number[];
      if (Array.isArray(guardados) && guardados.length === columnas.length) setAnchos(guardados);
    } catch {
      // Un guardado ilegible no debe impedir usar la tabla.
    }
  }, [clave, columnas.length]);

  const guardar = useCallback(
    (nuevos: number[]) => {
      setAnchos(nuevos);
      try {
        localStorage.setItem(`tabla:${clave}`, JSON.stringify(nuevos));
      } catch {
        // Sin espacio para guardar, la tabla sigue funcionando igual.
      }
    },
    [clave]
  );

  /** Arrastrar el borde reparte el ancho entre esta columna y la siguiente. */
  const empezarArrastre = (i: number) => (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (i >= anchos.length - 1) return;
    arrastre.current = { i, x: ev.clientX, a: anchos[i], b: anchos[i + 1] };

    const mover = (e: MouseEvent) => {
      const d = arrastre.current;
      if (!d) return;
      const tabla = document.querySelector(`[data-tabla="${clave}"]`) as HTMLElement | null;
      const total = tabla?.offsetWidth || 1000;
      const delta = ((e.clientX - d.x) / total) * 100;
      // Ninguna columna baja de 4%: por debajo ya no se lee el título.
      const a = Math.max(4, Math.min(d.a + d.b - 4, d.a + delta));
      const b = d.a + d.b - a;
      setAnchos((prev) => prev.map((v, j) => (j === d.i ? a : j === d.i + 1 ? b : v)));
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      arrastre.current = null;
      setAnchos((prev) => {
        try {
          localStorage.setItem(`tabla:${clave}`, JSON.stringify(prev));
        } catch {
          // idem
        }
        return prev;
      });
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  };

  const alternarOrden = (c: ColumnaTabla) => {
    if (c.ordenable === false) return;
    setOrden((prev) => {
      if (prev?.clave !== c.clave) return { clave: c.clave, paso: 0, dir: 1 };
      if (c.valores?.length) {
        // Recorre los valores y, al terminar la vuelta, quita el orden.
        const siguiente = prev.paso + 1;
        return siguiente >= c.valores.length ? null : { clave: c.clave, paso: siguiente, dir: 1 };
      }
      return prev.dir === 1 ? { clave: c.clave, paso: 0, dir: -1 } : null;
    });
  };

  const reiniciarAnchos = () => guardar(columnas.map((c) => c.ancho));

  return { anchos, orden, empezarArrastre, alternarOrden, reiniciarAnchos };
}

/**
 * Ordena las filas con lo que diga el encabezado. `valorDe` saca de cada fila
 * el texto por el que se compara en esa columna.
 */
export function ordenarFilas<T>(
  filas: T[],
  orden: Orden,
  columnas: ColumnaTabla[],
  valorDe: (fila: T, clave: string) => string | number | null
): T[] {
  if (!orden) return filas;
  const col = columnas.find((c) => c.clave === orden.clave);
  if (!col) return filas;

  const copia = [...filas];
  if (col.valores?.length) {
    const alFrente = col.valores[orden.paso];
    // Los que tienen ese valor suben; los demás conservan su orden.
    return copia.sort((a, b) => {
      const va = String(valorDe(a, col.clave) ?? "").toUpperCase();
      const vb = String(valorDe(b, col.clave) ?? "").toUpperCase();
      const pa = va === alFrente.toUpperCase() ? 0 : 1;
      const pb = vb === alFrente.toUpperCase() ? 0 : 1;
      return pa - pb || va.localeCompare(vb);
    });
  }

  return copia.sort((a, b) => {
    const va = valorDe(a, col.clave);
    const vb = valorDe(b, col.clave);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * orden.dir;
    return String(va ?? "").localeCompare(String(vb ?? ""), "es", { numeric: true }) * orden.dir;
  });
}

/** Encabezado con su tirador de ancho y su indicador de orden. */
export function EncabezadoTabla({
  columnas,
  anchos,
  orden,
  onOrdenar,
  onArrastrar,
}: {
  columnas: ColumnaTabla[];
  anchos: number[];
  orden: Orden;
  onOrdenar: (c: ColumnaTabla) => void;
  onArrastrar: (i: number) => (ev: React.MouseEvent) => void;
}) {
  return (
    <>
      <colgroup>
        {columnas.map((c, i) => (
          <col key={c.clave} style={{ width: `${anchos[i]}%` }} />
        ))}
      </colgroup>
      <thead className="border-b border-line bg-paper/70">
        <tr>
          {columnas.map((c, i) => {
            const activa = orden?.clave === c.clave;
            const marca = !activa
              ? ""
              : c.valores?.length
                ? ` · ${c.valores[orden.paso]}`
                : orden.dir === 1
                  ? " ↑"
                  : " ↓";
            return (
              <th
                key={c.clave}
                className={`relative select-none px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide ${
                  activa ? "text-kraft-dark" : "text-soft"
                } ${c.ordenable === false ? "" : "cursor-pointer hover:text-ink"}`}
                onClick={() => onOrdenar(c)}
                title={c.ordenable === false ? undefined : "Ordenar por esta columna"}
              >
                <span className="truncate">
                  {c.etiqueta}
                  {marca}
                </span>
                {i < columnas.length - 1 ? (
                  <span
                    onMouseDown={onArrastrar(i)}
                    onClick={(ev) => ev.stopPropagation()}
                    title="Arrastra para cambiar el ancho"
                    className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-kraft/30"
                  />
                ) : null}
              </th>
            );
          })}
        </tr>
      </thead>
    </>
  );
}
