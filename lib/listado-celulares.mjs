import fs from "fs";
import path from "path";

/**
 * Dónde vive el listado de telefonía.
 *
 * Ese archivo trae contraseñas de las cuentas de los teléfonos, así que su
 * lugar es `data/`, que no se sube al repositorio. Estuvo en `scripts/`, que
 * sí se sube, y ahí sigue en instalaciones que todavía no lo mueven: por eso
 * se busca primero en el lugar bueno y se acepta el viejo mientras tanto.
 *
 * Se devuelve también de dónde salió, para poder avisar en pantalla cuando
 * todavía está en el que se sube.
 */

const NOMBRE = "celulares-oficial.json";

export function rutaListadoCelulares(raiz = process.cwd()) {
  const buena = path.join(raiz, "data", NOMBRE);
  if (fs.existsSync(buena)) return { ruta: buena, enRepositorio: false };

  const vieja = path.join(raiz, "scripts", NOMBRE);
  if (fs.existsSync(vieja)) return { ruta: vieja, enRepositorio: true };

  return { ruta: null, enRepositorio: false };
}

/**
 * Copia el listado de `scripts/` a `data/` si todavía no está ahí.
 *
 * Se llama antes de bajar una actualización: así el archivo ya está a salvo
 * cuando el día que se borre del repositorio, el `git pull` lo quite de
 * `scripts/`. Devuelve si lo movió, para poder decirlo.
 */
export function ponerListadoASalvo(raiz = process.cwd()) {
  const buena = path.join(raiz, "data", NOMBRE);
  if (fs.existsSync(buena)) return { copiado: false, motivo: "ya estaba en data/" };

  const vieja = path.join(raiz, "scripts", NOMBRE);
  if (!fs.existsSync(vieja)) return { copiado: false, motivo: "no hay listado que copiar" };

  fs.mkdirSync(path.dirname(buena), { recursive: true });
  fs.copyFileSync(vieja, buena);
  return { copiado: true, motivo: `copiado a data/${NOMBRE}` };
}
