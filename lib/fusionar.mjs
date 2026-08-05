/**
 * Fusión de registros duplicados del inventario.
 *
 * Cuando el mismo aparato quedó capturado dos o tres veces (por importar el
 * Excel varias veces, o por cargar responsivas escaneadas), no basta con dar de
 * baja el sobrante: el registro sigue en la tabla y el sistema lo sigue viendo
 * como dato repetido. Aquí los registros se FUSIONAN: el más completo se queda
 * con toda la información y con el historial, y los demás desaparecen.
 *
 * Lo usan por igual la pantalla de inventario (botón "Unir duplicados") y los
 * scripts de mantenimiento, para que ambos hagan exactamente lo mismo.
 */

const N = (s) => (s ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
const dig = (s) => (s ?? "").toString().replace(/\D/g, "");
const lleno = (v) => v !== null && v !== undefined && String(v).trim() !== "";

export function leerDetalles(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Cuánta información trae el registro: en un empate se conserva el más completo. */
function riqueza(e) {
  const det = Object.values(e.det).filter(lleno).length;
  const base = ["numero_serie", "marca", "modelo", "specs", "fecha_compra", "costo", "notas"].filter((k) => lleno(e[k])).length;
  return det + base;
}

/**
 * Agrupa los registros que son el mismo aparato físico.
 *
 * Se unen por número de serie y por IMEI. Dos registros con IMEI distintos
 * NUNCA se unen aunque compartan "serie": en los Motorola esa serie es el
 * código de modelo (PBBJ0029MX) y la traen varios equipos diferentes.
 */
export function gruposDuplicados(equipos) {
  const padre = new Map(equipos.map((e) => [e.id, e.id]));
  const raiz = (id) => {
    while (padre.get(id) !== id) {
      padre.set(id, padre.get(padre.get(id)));
      id = padre.get(id);
    }
    return id;
  };
  const unir = (a, b) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(rb, ra);
  };

  const porClave = new Map();
  const agrega = (clave, e) => {
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(e);
  };
  for (const e of equipos) {
    if (e.numero_serie && N(e.numero_serie).length > 2) agrega(`S${N(e.numero_serie)}`, e);
    for (const clave of ["imei", "imei2"]) {
      const imei = dig(e.det[clave]);
      if (imei.length >= 10) agrega(`I${imei}`, e);
    }
  }

  const avisos = [];
  for (const [clave, lista] of porClave) {
    if (lista.length < 2) continue;
    const imeis = new Set(lista.map((e) => dig(e.det.imei)).filter((x) => x.length >= 10));
    if (clave.startsWith("S") && imeis.size > 1) {
      avisos.push(
        `${clave.slice(1)} la comparten ${lista.length} equipos con IMEI distintos (${lista.map((e) => e.codigo).join(", ")}): ` +
          `es código de modelo, no número de serie. No se tocan.`
      );
      continue;
    }
    for (let i = 1; i < lista.length; i += 1) unir(lista[0].id, lista[i].id);
  }

  const porRaiz = new Map();
  for (const e of equipos) {
    const r = raiz(e.id);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r).push(e);
  }
  const grupos = [...porRaiz.values()].filter((g) => g.length > 1);
  return { grupos, avisos };
}

/** Lee el inventario con lo necesario para decidir cuál registro se queda. */
export function equiposParaFusionar(db) {
  return db
    .prepare("SELECT * FROM equipos")
    .all()
    .map((e) => ({ ...e, det: leerDetalles(e.detalles) }));
}

/**
 * Orden de preferencia: el registro que se queda con todo va primero.
 * Se prefiere el que está en uso y, en igualdad, el registro original (el más
 * antiguo), para no perder el código con el que ya se conoce el equipo. Las
 * responsivas del sobrante se le pasan, así que no hay riesgo de perderlas.
 */
function ordenarGrupo(lista) {
  const puntos = (e) => (e.estado !== "BAJA" ? 4 : 0) + (e.asignado_a ? 2 : 0);
  return [...lista].sort((a, b) => puntos(b) - puntos(a) || riqueza(b) - riqueza(a) || a.id - b.id);
}

/**
 * Fusiona un grupo de registros duplicados en uno solo.
 * Devuelve el texto de lo que se hizo (o de lo que se haría, si aplicar = false).
 */
function fusionarGrupo(db, lista, aplicar) {
  const [conservar, ...sobrantes] = ordenarGrupo(lista);
  const hechos = [];
  const idsEliminados = sobrantes.map((s) => s.id);

  const base = { ...conservar };
  const det = { ...conservar.det };

  for (const sobra of sobrantes) {
    // La información que le falte al registro que se queda se toma del sobrante.
    for (const campo of ["numero_serie", "marca", "modelo", "specs", "fecha_compra", "costo", "notas", "categoria"]) {
      if (!lleno(base[campo]) && lleno(sobra[campo])) base[campo] = sobra[campo];
    }
    for (const [k, v] of Object.entries(sobra.det)) {
      if (!lleno(det[k]) && lleno(v)) det[k] = v;
    }
    if (!base.asignado_a && sobra.asignado_a) {
      base.asignado_a = sobra.asignado_a;
      if (base.estado !== "BAJA") base.estado = "ASIGNADO";
    }

    const historial =
      db.prepare("SELECT COUNT(*) AS c FROM responsiva_items WHERE equipo_id = ?").get(sobra.id).c +
      db.prepare("SELECT COUNT(*) AS c FROM mantenimientos WHERE equipo_id = ?").get(sobra.id).c;
    hechos.push(
      `${sobra.codigo} (${[sobra.marca, sobra.modelo].filter(Boolean).join(" ") || "sin modelo"}) se une a ${conservar.codigo}` +
        (historial ? ` y le pasa ${historial} registro(s) de historial` : "")
    );

    if (!aplicar) continue;

    // El historial pasa al registro que se queda. Si la misma responsiva ya lo
    // mencionaba, el renglón repetido se elimina en vez de duplicarse.
    db.prepare(
      `DELETE FROM responsiva_items WHERE equipo_id = ?
         AND responsiva_id IN (SELECT responsiva_id FROM responsiva_items WHERE equipo_id = ?)`
    ).run(sobra.id, conservar.id);
    db.prepare("UPDATE responsiva_items SET equipo_id = ? WHERE equipo_id = ?").run(conservar.id, sobra.id);
    db.prepare("UPDATE mantenimientos SET equipo_id = ? WHERE equipo_id = ?").run(conservar.id, sobra.id);
    db.prepare("DELETE FROM equipos WHERE id = ?").run(sobra.id);
  }

  if (aplicar) {
    db.prepare(
      `UPDATE equipos SET numero_serie=?, marca=?, modelo=?, specs=?, fecha_compra=?, costo=?, notas=?,
         categoria=?, detalles=?, estado=?, asignado_a=? WHERE id=?`
    ).run(
      base.numero_serie ?? null,
      base.marca ?? "",
      base.modelo ?? "",
      base.specs ?? null,
      base.fecha_compra ?? null,
      base.costo ?? null,
      base.notas ?? null,
      base.categoria ?? "",
      JSON.stringify(det),
      base.estado,
      base.asignado_a ?? null,
      conservar.id
    );
  }

  return { conservado: conservar.id, hechos, idsEliminados };
}

/**
 * Une todos los duplicados del inventario.
 *   fusionarInventario(db)                  -> aplica
 *   fusionarInventario(db, { aplicar:false }) -> solo dice qué haría
 */
export function fusionarInventario(db, { aplicar = true } = {}) {
  const equipos = equiposParaFusionar(db);
  const { grupos, avisos } = gruposDuplicados(equipos);
  const unidos = [];
  const eliminados = [];
  const correr = () => {
    for (const grupo of grupos) {
      const r = fusionarGrupo(db, grupo, aplicar);
      unidos.push(...r.hechos);
      eliminados.push(...r.idsEliminados);
    }
  };
  if (aplicar) db.transaction(correr)();
  else correr();
  return { grupos: grupos.length, equipos: unidos.length, unidos, eliminados, avisos };
}
