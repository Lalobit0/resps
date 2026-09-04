import { diasPara } from "./helpers";

/**
 * El motor del expediente digital.
 *
 * Aquí vive la única respuesta a "¿este requisito está cumplido?". Es a
 * propósito un solo lugar: si cada pantalla decidiera por su cuenta, el tablero
 * diría una cosa y el expediente otra, que es exactamente lo que el punto 59 de
 * la especificación pide evitar.
 *
 * Dos decisiones de diseño que conviene tener presentes al leer esto:
 *
 * 1. **La vigencia se calcula, no se guarda.** Si un proceso nocturno fuera
 *    quien marcara los vencidos, un día que no corriera el tablero mentiría.
 *    Aquí se compara contra la fecha de hoy cada vez que se pregunta.
 *
 * 2. **Los quince estados del expediente son en realidad tres cosas
 *    distintas** que se cruzan: en qué va la revisión del archivo, si el
 *    documento sigue vigente, y si el requisito aplica. Un documento puede
 *    estar validado *y* vencido al mismo tiempo. Se guardan por separado y lo
 *    que se pinta en pantalla es un estado efectivo derivado de los tres.
 */

// --------------------------------------------------------------------- tipos

export type VigenciaTipo = "SIN" | "FECHA" | "DIAS" | "MESES" | "ANIOS";

export type TipoDocumento = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: number | null;
  categoria: string | null;
  obligatorio: number;
  critico: number;
  permite_no_aplica: number;
  vigencia_tipo: VigenciaTipo;
  vigencia_valor: number | null;
  requiere_emision: number;
  requiere_vencimiento: number;
  requiere_renovacion: number;
  requiere_validacion: number;
  requiere_firma_empleado: number;
  requiere_firma_jefe: number;
  requiere_firma_rh: number;
  multiples_vigentes: number;
  conserva_versiones: number;
  visible_empleado: number;
  descargable_empleado: number;
  confidencialidad: string;
  responsable: string | null;
  dias_alerta: string;
  formatos: string;
  tam_max_mb: number;
  notas: string | null;
  orden: number;
  activo: number;
  /**
   * Documentos que valen uno por otro.
   *
   * Los que comparten grupo cubren el mismo hueco: para "identificación
   * oficial" da igual si trae INE, pasaporte, cédula profesional o cartilla
   * militar. Con uno basta, y el expediente cuenta el grupo como un solo
   * requisito en vez de cuatro.
   */
  grupo_equivalencia: string | null;
};

export type VersionDocumento = {
  id: number;
  documento_id: number;
  version: number;
  estado: string;
  vigente: number;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  folio: string | null;
  entidad_emisora: string | null;
  notas: string | null;
  origen: string;
  cargado_por: string | null;
  cargado_en: string;
  validado_por: string | null;
  validado_en: string | null;
  motivo_rechazo: string | null;
  comentario_rechazo: string | null;
  rechazado_por: string | null;
  rechazado_en: string | null;
  sustituida_en: string | null;
  motivo_sustitucion: string | null;
  firma_estado: string | null;
  archivos?: ArchivoDocumento[];
};

export type ArchivoDocumento = {
  id: number;
  version_id: number;
  nombre_original: string;
  ruta: string;
  mime: string | null;
  tamano: number | null;
  etiqueta: string | null;
  orden: number;
};

export type EstadoEfectivo =
  | "FALTANTE"
  | "NO_APLICA"
  | "CARGADO"
  | "EN_REVISION"
  | "PENDIENTE_FIRMA"
  | "VIGENTE"
  | "POR_VENCER"
  | "VENCIDO"
  | "RECHAZADO";

export type RequisitoVista = {
  id: number;
  expediente_id: number;
  doc_tipo_id: number;
  origen: string;
  obligatorio: number;
  no_aplica: number;
  no_aplica_motivo: string | null;
  no_aplica_usuario: string | null;
  no_aplica_fecha: string | null;
  tipo: TipoDocumento;
  documento_id: number | null;
  version: VersionDocumento | null;
  /** Las versiones anteriores, de la más nueva a la más vieja. */
  historial: VersionDocumento[];
  estado: EstadoEfectivo;
  vence: string | null;
  dias: number | null;
  /** Sirve para el porcentaje: cubierto = ya no hay nada que hacer con él. */
  cubierto: boolean;
  /** Grupo de documentos que valen uno por otro; null si va solo. */
  grupo: string | null;
  /**
   * Cuando otro documento del grupo ya resolvió el hueco, el nombre de ese
   * documento. Es lo que permite decir "no hace falta la INE, ya trae el
   * pasaporte" en vez de marcarla en rojo.
   */
  cubiertoPor: string | null;
};

// --------------------------------------------------------- estados y vigencia

export const ETIQUETA_ESTADO_DOC: Record<EstadoEfectivo, string> = {
  FALTANTE: "Faltante",
  NO_APLICA: "No aplica",
  CARGADO: "Cargado, sin revisar",
  EN_REVISION: "En revisión",
  PENDIENTE_FIRMA: "Falta firma",
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  VENCIDO: "Vencido",
  RECHAZADO: "Rechazado",
};

/**
 * El semáforo del punto 24. El color nunca va solo: siempre lo acompaña el
 * texto del estado, porque no todo el mundo distingue el verde del rojo.
 */
export const TONO_ESTADO_DOC: Record<EstadoEfectivo, "verde" | "ambar" | "rojo" | "gris" | "petrol"> = {
  FALTANTE: "rojo",
  NO_APLICA: "gris",
  CARGADO: "ambar",
  EN_REVISION: "ambar",
  PENDIENTE_FIRMA: "ambar",
  VIGENTE: "verde",
  POR_VENCER: "ambar",
  VENCIDO: "rojo",
  RECHAZADO: "rojo",
};

/** Los estados que cuentan como resuelto para el porcentaje de cumplimiento. */
const CUBIERTOS: EstadoEfectivo[] = ["VIGENTE", "POR_VENCER", "NO_APLICA"];

/** Si con este estado ya no hay nada que hacer con el requisito. */
export function esCubierto(estado: EstadoEfectivo): boolean {
  return CUBIERTOS.includes(estado);
}

/**
 * Por qué se devuelve un documento. Rechazar sin decir por qué obliga a la
 * persona a adivinar, así que el motivo es obligatorio y sale de esta lista.
 */
export const MOTIVOS_RECHAZO = [
  "No se alcanza a leer",
  "Está incompleto",
  "Ya está vencido",
  "La información no coincide",
  "No es el archivo que pedimos",
  "Le falta una página",
  "Le falta la firma",
  "El nombre no coincide con el del empleado",
  "No corresponde a este tipo de documento",
  "Otro",
] as const;

export const NIVELES_CONFIDENCIALIDAD = [
  { clave: "GENERAL", etiqueta: "General de RH", ayuda: "Lo puede ver cualquiera que tenga acceso a expedientes." },
  { clave: "RESTRINGIDO", etiqueta: "Restringido", ayuda: "Solo quien tenga el permiso de documentos confidenciales." },
  { clave: "CONFIDENCIAL", etiqueta: "Confidencial", ayuda: "Datos sensibles: médicos, bancarios, disciplinarios." },
  { clave: "ALTO", etiqueta: "Altamente confidencial", ayuda: "Legal o de dirección. El acceso queda registrado siempre." },
] as const;

/** Los que quedan detrás del permiso de confidenciales. */
export function esConfidencial(tipo: { confidencialidad: string }): boolean {
  return tipo.confidencialidad !== "GENERAL";
}

/** Suma meses respetando fin de mes: 31 de enero + 1 mes = 28/29 de febrero. */
function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const base = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

/**
 * Cuándo se vence esta versión.
 *
 * La fecha capturada a mano manda siempre: si el documento trae impresa su
 * fecha, esa es la buena. Solo cuando no hay se calcula desde la emisión con el
 * plazo del tipo.
 */
export function vencimientoDe(tipo: TipoDocumento, v: VersionDocumento | null): string | null {
  if (!v) return null;
  if (v.fecha_vencimiento) return v.fecha_vencimiento;
  if (!v.fecha_emision) return null;
  const n = tipo.vigencia_valor ?? 0;
  if (n <= 0) return null;
  switch (tipo.vigencia_tipo) {
    case "DIAS":
      return sumarDias(v.fecha_emision, n);
    case "MESES":
      return sumarMeses(v.fecha_emision, n);
    case "ANIOS":
      return sumarMeses(v.fecha_emision, n * 12);
    default:
      return null;
  }
}

/** Con cuántos días de anticipación empieza a avisar este tipo de documento. */
export function umbralAviso(tipo: TipoDocumento): number {
  const dias = (tipo.dias_alerta || "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isFinite(d) && d > 0);
  return dias.length ? Math.max(...dias) : 30;
}

/** Los avisos configurados de un tipo, de mayor a menor. */
export function escalonesAviso(tipo: TipoDocumento): number[] {
  return (tipo.dias_alerta || "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => b - a);
}

/**
 * El estado que se pinta. Cruza los tres ejes en el orden en que importan:
 * primero si el requisito aplica, luego en qué va la revisión, y hasta el final
 * la vigencia — porque un documento rechazado no tiene caso mirarle la fecha.
 */
export function estadoEfectivo(
  req: { no_aplica: number },
  tipo: TipoDocumento,
  v: VersionDocumento | null
): { estado: EstadoEfectivo; vence: string | null; dias: number | null } {
  if (req.no_aplica) return { estado: "NO_APLICA", vence: null, dias: null };
  if (!v) return { estado: "FALTANTE", vence: null, dias: null };

  if (v.estado === "RECHAZADO") return { estado: "RECHAZADO", vence: null, dias: null };
  if (tipo.requiere_validacion && v.estado !== "VALIDADO") {
    return { estado: v.estado === "EN_REVISION" ? "EN_REVISION" : "CARGADO", vence: null, dias: null };
  }

  const pideFirma = tipo.requiere_firma_empleado || tipo.requiere_firma_jefe || tipo.requiere_firma_rh;
  if (pideFirma && v.firma_estado !== "FIRMADO") {
    return { estado: "PENDIENTE_FIRMA", vence: null, dias: null };
  }

  const vence = vencimientoDe(tipo, v);
  if (!vence) return { estado: "VIGENTE", vence: null, dias: null };

  const dias = diasPara(vence);
  if (dias < 0) return { estado: "VENCIDO", vence, dias };
  if (dias <= umbralAviso(tipo)) return { estado: "POR_VENCER", vence, dias };
  return { estado: "VIGENTE", vence, dias };
}

// ---------------------------------------------------------------- cumplimiento

export type Cumplimiento = {
  /** Obligatorios que le tocan a esta persona (los "no aplica" siguen contando aquí). */
  obligatorios: number;
  obligatoriosCubiertos: number;
  /** El número que se enseña en grande. */
  porcentaje: number;
  total: number;
  totalCubiertos: number;
  porcentajeTotal: number;
  faltantes: number;
  vencidos: number;
  porVencer: number;
  porValidar: number;
  rechazados: number;
  porFirmar: number;
  noAplica: number;
  criticosPendientes: number;
  nivel: "COMPLETO" | "INCOMPLETO" | "CRITICO";
};

/**
 * Qué tan cerca está un requisito de quedar resuelto.
 *
 * Sirve para elegir quién representa a un grupo de equivalentes cuando ninguno
 * está cubierto todavía: si de las cuatro identificaciones una ya está cargada
 * esperando revisión, el grupo entero se reporta como "por validar" y no como
 * "faltante", porque eso es lo que RH tiene que atender.
 */
const AVANCE: Record<EstadoEfectivo, number> = {
  NO_APLICA: 8,
  VIGENTE: 7,
  POR_VENCER: 6,
  PENDIENTE_FIRMA: 5,
  EN_REVISION: 4,
  CARGADO: 3,
  VENCIDO: 2,
  RECHAZADO: 1,
  FALTANTE: 0,
};

/**
 * Marca los equivalentes que ya no hacen falta.
 *
 * Se corre después de calcular el estado de cada requisito: si alguien del
 * grupo "identificación oficial" ya tiene su documento en regla, a los demás
 * del grupo se les anota con qué quedaron cubiertos, en vez de dejarlos en
 * rojo pidiendo algo que la persona no necesita entregar.
 */
export function resolverEquivalencias(reqs: RequisitoVista[]): RequisitoVista[] {
  const grupos = new Map<string, RequisitoVista[]>();
  for (const r of reqs) {
    if (!r.grupo) continue;
    grupos.set(r.grupo, [...(grupos.get(r.grupo) ?? []), r]);
  }

  for (const miembros of grupos.values()) {
    const cubre = miembros.find((m) => m.cubierto);
    if (!cubre) continue;
    for (const m of miembros) {
      if (m === cubre || m.cubierto) continue;
      m.cubierto = true;
      m.cubiertoPor = cubre.tipo.nombre;
    }
  }
  return reqs;
}

/**
 * Las unidades que de verdad se cuentan.
 *
 * Un requisito suelto es una unidad. Un grupo de equivalentes también es UNA
 * unidad, por más documentos que tenga dentro: pedir cuatro identificaciones y
 * contarlas por separado haría que quien trae pasaporte apareciera al 25% de
 * su identificación, cuando en realidad ya la cumplió.
 */
function unidades(reqs: RequisitoVista[]) {
  const sueltos = reqs.filter((r) => !r.grupo);
  const porGrupo = new Map<string, RequisitoVista[]>();
  for (const r of reqs) {
    if (!r.grupo) continue;
    porGrupo.set(r.grupo, [...(porGrupo.get(r.grupo) ?? []), r]);
  }

  const deSueltos = sueltos.map((r) => ({
    obligatorio: !!r.obligatorio,
    critico: !!r.tipo.critico,
    cubierto: r.cubierto,
    estado: r.estado,
  }));

  const deGrupos = [...porGrupo.values()].map((miembros) => {
    // Quien lo cubre de verdad es el que trae su propio documento; los demás
    // solo llevan la anotación de con qué quedaron cubiertos.
    const cubre = miembros.find((m) => m.cubierto && !m.cubiertoPor);
    const representante = cubre ?? [...miembros].sort((a, b) => AVANCE[b.estado] - AVANCE[a.estado])[0];
    return {
      obligatorio: miembros.some((m) => m.obligatorio),
      critico: miembros.some((m) => m.obligatorio && m.tipo.critico),
      cubierto: !!cubre,
      estado: representante.estado,
    };
  });

  return [...deSueltos, ...deGrupos];
}

export function calcularCumplimiento(reqs: RequisitoVista[]): Cumplimiento {
  const us = unidades(reqs);
  const obligatorios = us.filter((u) => u.obligatorio);
  const obligatoriosCubiertos = obligatorios.filter((u) => u.cubierto).length;
  const totalCubiertos = us.filter((u) => u.cubierto).length;
  // Solo cuentan los problemas de lo que sigue pendiente: si el grupo ya quedó
  // cubierto con otro documento, el que falta dentro del grupo no es un pendiente.
  const cuenta = (e: EstadoEfectivo) => us.filter((u) => !u.cubierto && u.estado === e).length;

  const criticosPendientes = obligatorios.filter((u) => u.critico && !u.cubierto).length;
  const porcentaje = obligatorios.length ? Math.round((obligatoriosCubiertos / obligatorios.length) * 100) : 100;

  return {
    obligatorios: obligatorios.length,
    obligatoriosCubiertos,
    porcentaje,
    total: us.length,
    totalCubiertos,
    porcentajeTotal: us.length ? Math.round((totalCubiertos / us.length) * 100) : 100,
    faltantes: cuenta("FALTANTE"),
    vencidos: cuenta("VENCIDO"),
    // "Por vencer" es la excepción: el requisito está cubierto hoy, pero es
    // justo lo que hay que renovar antes de que deje de estarlo.
    porVencer: us.filter((u) => u.estado === "POR_VENCER").length,
    porValidar: cuenta("CARGADO") + cuenta("EN_REVISION"),
    rechazados: cuenta("RECHAZADO"),
    porFirmar: cuenta("PENDIENTE_FIRMA"),
    // Los "no aplica" sí están cubiertos, pero se enseñan aparte para que se
    // vea cuántas excepciones lleva el expediente.
    noAplica: us.filter((u) => u.estado === "NO_APLICA").length,
    criticosPendientes,
    nivel: criticosPendientes > 0 ? "CRITICO" : porcentaje >= 100 ? "COMPLETO" : "INCOMPLETO",
  };
}

/** Un renglón del historial del expediente: lo que se enseña en el timeline. */
export type MovimientoExpediente = {
  id: number;
  expediente_id: number;
  documento_id: number | null;
  doc_tipo_id: number | null;
  accion: string;
  detalle: string | null;
  usuario: string | null;
  fecha: string;
};

// ------------------------------------------------------------------ la matriz

export type ReglaMatriz = {
  id: number;
  doc_tipo_id: number;
  campo: "TODOS" | "DEPARTAMENTO" | "AREA" | "PUESTO" | "CLASE" | "EMPLEADO";
  /** El grupo al que aplica; con EMPLEADO, el número de la persona. */
  valor: string | null;
  obligatorio: number | null;
  nota: string | null;
  activo: number;
};

export const CAMPOS_MATRIZ = [
  { clave: "TODOS", etiqueta: "Todo el personal" },
  { clave: "DEPARTAMENTO", etiqueta: "Departamento" },
  { clave: "AREA", etiqueta: "Área" },
  { clave: "PUESTO", etiqueta: "Puesto" },
  { clave: "CLASE", etiqueta: "Clase de empleado" },
  // Para lo que no cabe en un grupo: al chofer que sí maneja el tractocamión
  // se le pide la licencia federal, aunque su puesto diga lo mismo que el de
  // los demás choferes.
  { clave: "EMPLEADO", etiqueta: "Personas en particular" },
] as const;

export const CAMPOS_MATRIZ_VALIDOS = CAMPOS_MATRIZ.map((c) => c.clave) as readonly string[];
