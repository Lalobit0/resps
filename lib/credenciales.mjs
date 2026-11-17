/**
 * Separar la cuenta de la contraseña del teléfono.
 *
 * En el listado de telefonía la columna "icloud" no trae lo que su nombre
 * dice: en unos renglones trae la contraseña sola ("Pechuga123$"), en otro
 * trae las dos cosas juntas ("importe434@gmail.com / Sult4na266$"), y en la
 * mayoría viene vacía. Guardarlo tal cual dejaba la contraseña metida en el
 * casillero del correo, donde nadie la busca y cualquiera la encuentra.
 *
 * La regla es simple: lo que tenga forma de correo es la cuenta; lo que
 * sobre es la contraseña. Si no hay correo, no hay cuenta —solo contraseña—,
 * porque una cuenta de iCloud es un correo.
 */

const CORREO = /[^\s/|,;]+@[^\s/|,;]+\.[^\s/|,;]+/;

/** Relleno que en la práctica significa "no hay dato". */
const vacio = (v) => !String(v ?? "").trim() || /^(na|n\/a|-{1,}|0|none|ninguno)$/i.test(String(v).trim());

export function partirCuenta(valor) {
  const txt = String(valor ?? "").trim();
  if (vacio(txt)) return { cuenta: "", password: "" };

  const m = txt.match(CORREO);
  if (!m) return { cuenta: "", password: txt };

  const resto = (txt.slice(0, m.index) + " " + txt.slice(m.index + m[0].length))
    // Los separadores con los que vienen pegadas: "correo / clave", "correo | clave".
    .replace(/[/|,;]+/g, " ")
    .trim();
  return { cuenta: m[0], password: resto };
}
