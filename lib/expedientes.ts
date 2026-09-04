import { db } from "./db";
import { hoyISO } from "./helpers";
import {
  calcularCumplimiento,
  esCubierto,
  estadoEfectivo,
  resolverEquivalencias,
  type Cumplimiento,
  type ArchivoDocumento,
  type EstadoEfectivo,
  type RequisitoVista,
  type TipoDocumento,
  type MovimientoExpediente,
  type ReglaMatriz,
  type VersionDocumento,
} from "./expedientes-comun";

/**
 * Las consultas del expediente.
 *
 * La parte que decide estados y porcentajes vive en `expedientes-comun.ts`,
 * sin tocar la base: así las pantallas la pueden usar sin arrastrar el motor de
 * SQLite al navegador. Aquí queda lo que sí necesita leer y escribir.
 */

// Lo de `expedientes-comun` se vuelve a exportar desde aquí para que el resto
// del sistema tenga un solo lugar del que importar.
export * from "./expedientes-comun";

// ------------------------------------------------------------------- consultas

const SELECT_TIPO = `
  SELECT t.*, c.nombre AS categoria
  FROM doc_tipos t LEFT JOIN doc_categorias c ON c.id = t.categoria_id
`;

export function tiposDocumento(soloActivos = true): TipoDocumento[] {
  return db
    .prepare(`${SELECT_TIPO} ${soloActivos ? "WHERE t.activo = 1" : ""} ORDER BY c.orden, t.orden, t.nombre`)
    .all() as TipoDocumento[];
}

export function tipoDocumento(id: number): TipoDocumento | null {
  return (db.prepare(`${SELECT_TIPO} WHERE t.id = ?`).get(id) as TipoDocumento | undefined) ?? null;
}

export function categorias(): { id: number; nombre: string; descripcion: string | null; orden: number; activo: number }[] {
  return db.prepare("SELECT * FROM doc_categorias ORDER BY orden, nombre").all() as {
    id: number;
    nombre: string;
    descripcion: string | null;
    orden: number;
    activo: number;
  }[];
}

// ------------------------------------------------------------------ la matriz

export type ReglaEnLista = ReglaMatriz & {
  tipo_nombre: string;
  tipo_codigo: string;
  tipo_grupo: string | null;
  /** Solo en las reglas de una persona: de quién es y qué hace. */
  persona: string | null;
  persona_puesto: string | null;
  persona_departamento: string | null;
};

export function reglasMatriz(): ReglaEnLista[] {
  // Una regla dirigida a una persona guarda su número; el nombre y el puesto
  // se traen aquí para que la pantalla no diga "EMPLEADO: 1239" a secas.
  return db
    .prepare(
      `SELECT m.*, t.nombre AS tipo_nombre, t.codigo AS tipo_codigo, t.grupo_equivalencia AS tipo_grupo,
              em.nombre AS persona, em.puesto AS persona_puesto, em.departamento AS persona_departamento
       FROM matriz_reglas m
       JOIN doc_tipos t ON t.id = m.doc_tipo_id
       LEFT JOIN empleados em ON m.campo = 'EMPLEADO' AND em.numero_empleado = m.valor
       ORDER BY CASE m.campo WHEN 'TODOS' THEN 0 ELSE 1 END, m.campo, m.valor, t.nombre`
    )
    .all() as ReglaEnLista[];
}

const normaliza = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

export type EmpleadoParaMatriz = {
  id: number;
  numero_empleado: string | null;
  departamento: string | null;
  area: string | null;
  puesto: string | null;
  clase: string | null;
};

/**
 * Qué documentos le tocan a esta persona.
 *
 * Las reglas se suman, nunca se pisan: si la regla general pide INE a todos y
 * la de Producción pide certificado médico, quien esté en Producción necesita
 * los dos. Cuando dos reglas alcanzan al mismo documento y una lo marca
 * obligatorio, gana obligatorio.
 */
export function requisitosSegunMatriz(emp: EmpleadoParaMatriz): Map<number, { obligatorio: number }> {
  const reglas = db
    .prepare(
      `SELECT m.doc_tipo_id, m.campo, m.valor, m.obligatorio, t.obligatorio AS tipo_obligatorio
       FROM matriz_reglas m JOIN doc_tipos t ON t.id = m.doc_tipo_id
       WHERE m.activo = 1 AND t.activo = 1`
    )
    .all() as { doc_tipo_id: number; campo: string; valor: string | null; obligatorio: number | null; tipo_obligatorio: number }[];

  const valorDe: Record<string, string> = {
    DEPARTAMENTO: normaliza(emp.departamento),
    AREA: normaliza(emp.area),
    PUESTO: normaliza(emp.puesto),
    CLASE: normaliza(emp.clase),
    // La regla se guarda con el número de empleado, no con el id: así se
    // entiende de un vistazo y sigue diciendo lo mismo si la base se rehace.
    EMPLEADO: normaliza(emp.numero_empleado),
  };

  const salida = new Map<number, { obligatorio: number }>();
  for (const r of reglas) {
    const aplica = r.campo === "TODOS" || valorDe[r.campo] === normaliza(r.valor);
    if (!aplica) continue;
    const obligatorio = r.obligatorio === null ? r.tipo_obligatorio : r.obligatorio;
    const previo = salida.get(r.doc_tipo_id);
    salida.set(r.doc_tipo_id, { obligatorio: Math.max(previo?.obligatorio ?? 0, obligatorio) });
  }

  return conEquivalentes(salida);
}

/**
 * Los documentos que valen por los que sí pide la matriz.
 *
 * Si la matriz pide INE, el pasaporte y las demás identificaciones oficiales
 * entran también al expediente, pero como alternativa: no suman al total —el
 * grupo cuenta como un solo requisito— y están ahí para poder cargarlas cuando
 * la persona trae una en lugar de la otra. Sin esto habría que agregarlas a
 * mano cada vez que alguien no tiene INE.
 */
function conEquivalentes(pedidos: Map<number, { obligatorio: number }>): Map<number, { obligatorio: number }> {
  if (pedidos.size === 0) return pedidos;

  const marcas = [...pedidos.keys()].map(() => "?").join(",");
  const grupos = (
    db
      .prepare(
        `SELECT DISTINCT grupo_equivalencia AS g FROM doc_tipos
         WHERE id IN (${marcas}) AND grupo_equivalencia IS NOT NULL AND TRIM(grupo_equivalencia) != ''`
      )
      .all(...pedidos.keys()) as { g: string }[]
  ).map((r) => r.g);
  if (!grupos.length) return pedidos;

  const hermanos = db
    .prepare(
      `SELECT id FROM doc_tipos
       WHERE activo = 1 AND grupo_equivalencia IN (${grupos.map(() => "?").join(",")})`
    )
    .all(...grupos) as { id: number }[];

  for (const h of hermanos) {
    if (!pedidos.has(h.id)) pedidos.set(h.id, { obligatorio: 0 });
  }
  return pedidos;
}

// --------------------------------------------------------------- el expediente

/** El expediente de una persona, creándolo si es la primera vez que se abre. */
export function asegurarExpediente(empleadoId: number): number {
  const ya = db.prepare("SELECT id FROM expedientes WHERE empleado_id = ?").get(empleadoId) as
    | { id: number }
    | undefined;
  if (ya) return ya.id;
  const res = db.prepare("INSERT INTO expedientes (empleado_id) VALUES (?)").run(empleadoId);
  return Number(res.lastInsertRowid);
}

export type ResultadoSincronizacion = { agregados: number; yaNoAplican: number; retirados: number };

/**
 * Pone al día la lista de requisitos contra la matriz.
 *
 * Se corre al dar de alta a alguien y cada vez que cambia de puesto, área o
 * departamento (punto 58). Nunca borra documentos: si un requisito deja de
 * tocarle pero ya tenía papeles cargados, el renglón se queda como opcional
 * para que el histórico siga completo — solo se retira si estaba vacío.
 */
export function sincronizarRequisitos(empleadoId: number): ResultadoSincronizacion {
  const emp = db
    .prepare("SELECT id, numero_empleado, departamento, area, puesto, clase FROM empleados WHERE id = ?")
    .get(empleadoId) as EmpleadoParaMatriz | undefined;
  if (!emp) return { agregados: 0, yaNoAplican: 0, retirados: 0 };

  const expedienteId = asegurarExpediente(empleadoId);
  const debidos = requisitosSegunMatriz(emp);

  const actuales = db
    .prepare(
      `SELECT r.id, r.doc_tipo_id, r.origen, r.obligatorio,
              (SELECT COUNT(*) FROM documentos d WHERE d.requisito_id = r.id) AS docs
       FROM expediente_requisitos r WHERE r.expediente_id = ?`
    )
    .all(expedienteId) as { id: number; doc_tipo_id: number; origen: string; obligatorio: number; docs: number }[];
  const porTipo = new Map(actuales.map((a) => [a.doc_tipo_id, a]));

  let agregados = 0;
  let yaNoAplican = 0;
  let retirados = 0;

  const insertar = db.prepare(
    "INSERT OR IGNORE INTO expediente_requisitos (expediente_id, doc_tipo_id, origen, obligatorio) VALUES (?, ?, 'MATRIZ', ?)"
  );
  for (const [tipoId, { obligatorio }] of debidos) {
    const ya = porTipo.get(tipoId);
    if (!ya) {
      insertar.run(expedienteId, tipoId, obligatorio);
      agregados++;
    } else if (ya.origen === "MATRIZ" && ya.obligatorio !== obligatorio) {
      db.prepare("UPDATE expediente_requisitos SET obligatorio = ? WHERE id = ?").run(obligatorio, ya.id);
    }
  }

  // Los que la matriz ya no pide. Los puestos a mano no se tocan: alguien los
  // agregó a propósito.
  for (const a of actuales) {
    if (debidos.has(a.doc_tipo_id) || a.origen !== "MATRIZ") continue;
    if (a.docs > 0) {
      if (a.obligatorio) {
        db.prepare("UPDATE expediente_requisitos SET obligatorio = 0 WHERE id = ?").run(a.id);
        yaNoAplican++;
      }
    } else {
      db.prepare("DELETE FROM expediente_requisitos WHERE id = ?").run(a.id);
      retirados++;
    }
  }

  db.prepare("UPDATE expedientes SET revisado_en = datetime('now','localtime') WHERE id = ?").run(expedienteId);
  return { agregados, yaNoAplican, retirados };
}

/**
 * Pone al día los expedientes de toda la plantilla.
 *
 * Hace falta antes de cualquier pantalla que enseñe cumplimiento de varias
 * personas a la vez: si los requisitos solo se crearan al abrir cada expediente,
 * el tablero diría que todo el mundo está al 100% nada más porque a nadie se le
 * ha pedido nada todavía, que es justo la clase de mentira que este módulo
 * existe para evitar.
 *
 * Es idempotente y va en una sola transacción: la segunda vez no escribe nada.
 */
export function sincronizarTodos(): void {
  const hayReglas = (db.prepare("SELECT COUNT(*) AS c FROM matriz_reglas WHERE activo = 1").get() as { c: number }).c;
  if (!hayReglas) return;

  const empleados = db.prepare("SELECT id FROM empleados WHERE activo = 1").all() as { id: number }[];
  db.transaction(() => {
    for (const e of empleados) sincronizarRequisitos(e.id);
  })();
}

function versionesDe(documentoIds: number[]): Map<number, VersionDocumento[]> {
  const salida = new Map<number, VersionDocumento[]>();
  if (!documentoIds.length) return salida;
  const marcas = documentoIds.map(() => "?").join(",");
  const versiones = db
    .prepare(`SELECT * FROM doc_versiones WHERE documento_id IN (${marcas}) ORDER BY documento_id, version DESC`)
    .all(...documentoIds) as VersionDocumento[];

  const ids = versiones.map((v) => v.id);
  const archivos = ids.length
    ? (db
        .prepare(`SELECT * FROM doc_archivos WHERE version_id IN (${ids.map(() => "?").join(",")}) ORDER BY orden, id`)
        .all(...ids) as ArchivoDocumento[])
    : [];
  const porVersion = new Map<number, ArchivoDocumento[]>();
  for (const a of archivos) {
    const lista = porVersion.get(a.version_id) ?? [];
    lista.push(a);
    porVersion.set(a.version_id, lista);
  }

  for (const v of versiones) {
    v.archivos = porVersion.get(v.id) ?? [];
    const lista = salida.get(v.documento_id) ?? [];
    lista.push(v);
    salida.set(v.documento_id, lista);
  }
  return salida;
}

/** El expediente completo de una persona, listo para pintarse. */
/**
 * El catálogo entero como diccionario, para no volver a pedirlo por cada
 * empleado cuando se está armando el tablero de toda la plantilla.
 */
function mapaDeTipos(): Map<number, TipoDocumento> {
  return new Map(tiposDocumento(false).map((t) => [t.id, t]));
}

export function requisitosDe(empleadoId: number, tiposPrecargados?: Map<number, TipoDocumento>): RequisitoVista[] {
  const expediente = db.prepare("SELECT id FROM expedientes WHERE empleado_id = ?").get(empleadoId) as
    | { id: number }
    | undefined;
  if (!expediente) return [];

  const filas = db
    .prepare(
      `SELECT r.*, d.id AS documento_id
       FROM expediente_requisitos r
       LEFT JOIN documentos d ON d.requisito_id = r.id AND d.situacion = 'ACTIVO'
       WHERE r.expediente_id = ?`
    )
    .all(expediente.id) as (RequisitoVista & { documento_id: number | null })[];

  const tipos = tiposPrecargados ?? mapaDeTipos();
  const docIds = filas.map((f) => f.documento_id).filter((d): d is number => !!d);
  const versiones = versionesDe(docIds);

  // Un requisito con "varios vigentes" puede traer más de un documento: se
  // pinta como un renglón por documento salvo el primero, que lleva el estado.
  const vistas: RequisitoVista[] = [];
  const yaVisto = new Set<number>();
  for (const f of filas) {
    if (yaVisto.has(f.id) && f.documento_id === null) continue;
    const tipo = tipos.get(f.doc_tipo_id);
    if (!tipo) continue;

    const lista = f.documento_id ? versiones.get(f.documento_id) ?? [] : [];
    const version = lista.find((v) => v.vigente === 1) ?? lista[0] ?? null;
    const { estado, vence, dias } = estadoEfectivo(f, tipo, version);

    // Con varios documentos por requisito gana el mejor estado: si una de las
    // constancias está vigente, el requisito está cubierto.
    const previo = vistas.find((v) => v.id === f.id);
    const cubierto = esCubierto(estado);
    if (previo) {
      if (cubierto && !previo.cubierto) {
        previo.estado = estado;
        previo.vence = vence;
        previo.dias = dias;
        previo.cubierto = true;
        previo.version = version;
        previo.documento_id = f.documento_id;
      }
      previo.historial = [...previo.historial, ...lista];
      continue;
    }

    yaVisto.add(f.id);
    vistas.push({
      ...f,
      tipo,
      documento_id: f.documento_id,
      version,
      historial: lista,
      estado,
      vence,
      dias,
      cubierto,
      grupo: tipo.grupo_equivalencia,
      cubiertoPor: null,
    });
  }

  // Con uno del grupo basta: si ya trae pasaporte, la INE deja de hacer falta.
  resolverEquivalencias(vistas);

  const orden: EstadoEfectivo[] = [
    "VENCIDO",
    "RECHAZADO",
    "FALTANTE",
    "POR_VENCER",
    "CARGADO",
    "EN_REVISION",
    "PENDIENTE_FIRMA",
    "VIGENTE",
    "NO_APLICA",
  ];
  vistas.sort(
    (a, b) =>
      Number(b.obligatorio) - Number(a.obligatorio) ||
      Number(b.tipo.critico) - Number(a.tipo.critico) ||
      orden.indexOf(a.estado) - orden.indexOf(b.estado) ||
      (a.tipo.categoria ?? "").localeCompare(b.tipo.categoria ?? "") ||
      a.tipo.nombre.localeCompare(b.tipo.nombre)
  );
  return vistas;
}

// ------------------------------------------------------------------ el listado

export type ResumenExpediente = {
  empleado_id: number;
  numero_empleado: string;
  nombre: string;
  puesto: string;
  departamento: string;
  area: string | null;
  activo: number;
  estatus: string | null;
  expediente_id: number | null;
  cumplimiento: Cumplimiento;
};

/**
 * El cumplimiento de toda la plantilla.
 *
 * Se arma en memoria a propósito: el estado de un requisito depende de la fecha
 * de hoy y de la configuración del tipo, y eso no se puede resolver bien en
 * SQL sin duplicar las reglas. Con 126 empleados y una decena de documentos
 * cada uno son unos cuantos miles de renglones: sobra.
 */
export function resumenExpedientes(opciones?: { incluirBajas?: boolean }): ResumenExpediente[] {
  // Antes de contar, que la lista de requisitos de cada quien esté al día.
  sincronizarTodos();

  const empleados = db
    .prepare(
      `SELECT id, numero_empleado, nombre, puesto, departamento, area, activo, estatus
       FROM empleados ${opciones?.incluirBajas ? "" : "WHERE activo = 1"}
       ORDER BY nombre`
    )
    .all() as {
    id: number;
    numero_empleado: string;
    nombre: string;
    puesto: string;
    departamento: string;
    area: string | null;
    activo: number;
    estatus: string | null;
  }[];

  const expedientes = new Map(
    (db.prepare("SELECT id, empleado_id FROM expedientes").all() as { id: number; empleado_id: number }[]).map((e) => [
      e.empleado_id,
      e.id,
    ])
  );

  // El catálogo se lee una sola vez para toda la plantilla, no una por persona.
  const tipos = mapaDeTipos();
  return empleados.map(({ id, ...e }) => ({
    ...e,
    empleado_id: id,
    expediente_id: expedientes.get(id) ?? null,
    cumplimiento: calcularCumplimiento(requisitosDe(id, tipos)),
  }));
}

/** Deja constancia de lo que pasó en el expediente, para el timeline y la auditoría. */
export function anotarExpediente(
  expedienteId: number,
  accion: string,
  detalle: string,
  usuario: string | null,
  documentoId?: number | null,
  docTipoId?: number | null
) {
  db.prepare(
    "INSERT INTO exp_historial (expediente_id, documento_id, doc_tipo_id, accion, detalle, usuario) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(expedienteId, documentoId ?? null, docTipoId ?? null, accion, detalle, usuario);
}

export function historialDeExpediente(expedienteId: number, limite = 200): MovimientoExpediente[] {
  return db
    .prepare("SELECT * FROM exp_historial WHERE expediente_id = ? ORDER BY fecha DESC, id DESC LIMIT ?")
    .all(expedienteId, limite) as MovimientoExpediente[];
}

export { hoyISO };
