/**
 * La matriz de gafetes de acceso, en lo que no toca la base.
 *
 * El control de accesos vive en la consola del lector de tarjetas, que no
 * habla con nadie. La matriz en Excel era la única constancia de a quién se
 * le dio qué puerta, y no se cruzaba ni con la plantilla ni con las bajas:
 * alguien se iba y su gafete seguía abriendo.
 */

export type Puerta = { id: number; numero: number; nombre: string; activo: number };

export type PerfilGafete = {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  activo: number;
  /** Números de las puertas que abre. */
  puertas: number[];
};

export type Gafete = {
  id: number;
  numero: string;
  empleado_id: number | null;
  estado: string;
  fecha_alta: string | null;
  fecha_baja: string | null;
  notas: string | null;
  /** Claves de los perfiles que se le dieron. */
  perfiles: string[];
  /** Números de las puertas que de verdad abre. */
  puertas: number[];
  // Del empleado, para no consultarlo aparte.
  numero_empleado: string | null;
  nombre: string | null;
  puesto: string | null;
  departamento: string | null;
  clase: string | null;
  empleado_activo: number | null;
};

export const ESTADOS_GAFETE = [
  { clave: "ACTIVO", etiqueta: "Activo", tono: "verde" },
  { clave: "POR_RECOGER", etiqueta: "Por recoger", tono: "ambar" },
  { clave: "RECOGIDO", etiqueta: "Recogido", tono: "gris" },
  { clave: "EXTRAVIADO", etiqueta: "Extraviado", tono: "rojo" },
  { clave: "CANCELADO", etiqueta: "Cancelado", tono: "gris" },
] as const;

export const ETIQUETA_ESTADO_GAFETE: Record<string, string> = Object.fromEntries(
  ESTADOS_GAFETE.map((e) => [e.clave, e.etiqueta])
);

export const TONO_ESTADO_GAFETE: Record<string, string> = Object.fromEntries(
  ESTADOS_GAFETE.map((e) => [e.clave, e.tono])
);

/** Un gafete cuenta como vivo mientras siga abriendo puertas. */
export const ESTADOS_VIVOS = ["ACTIVO", "POR_RECOGER", "EXTRAVIADO"];

/**
 * Las letras que menciona un perfil escrito a mano.
 *
 * En el formato la misma idea aparece de seis maneras —"C y D", "C,D y F",
 * "B,D Y F", "C, D y F"—, así que se leen las letras sueltas y se olvida cómo
 * venían separadas.
 */
export function clavesDePerfil(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const letras = texto
    .toUpperCase()
    .replace(/\bY\b/g, " ")
    .split(/[^A-Z]+/)
    .filter((t) => t.length === 1);
  return [...new Set(letras)];
}

/** Las puertas que abrirían los perfiles dados, sumadas. */
export function puertasDePerfiles(claves: string[], perfiles: PerfilGafete[]): number[] {
  const suma = new Set<number>();
  for (const c of claves) {
    const p = perfiles.find((x) => x.clave === c);
    for (const n of p?.puertas ?? []) suma.add(n);
  }
  return [...suma].sort((a, b) => a - b);
}

/**
 * Si lo que abre el gafete no es lo que dicen sus perfiles.
 *
 * Pasa en el formato de papel: hay gafetes con una puerta de más y otros con
 * una de menos que la que les tocaría. No es un error del sistema —alguien lo
 * decidió así—, pero conviene verlo para poder preguntar.
 */
export function difiereDelPerfil(g: { perfiles: string[]; puertas: number[] }, perfiles: PerfilGafete[]) {
  const esperadas = puertasDePerfiles(g.perfiles, perfiles);
  const tiene = new Set(g.puertas);
  const debe = new Set(esperadas);
  return {
    demas: [...tiene].filter((n) => !debe.has(n)).sort((a, b) => a - b),
    faltan: [...debe].filter((n) => !tiene.has(n)).sort((a, b) => a - b),
  };
}

/** Cómo se escribe un conjunto de perfiles, en el orden de siempre. */
export function textoPerfiles(claves: string[]): string {
  const orden = [...claves].sort();
  if (orden.length === 0) return "—";
  if (orden.length === 1) return orden[0];
  return `${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}`;
}
