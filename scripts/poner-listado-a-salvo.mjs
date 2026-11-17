// Mueve el listado de telefonía a data/, que no se sube al repositorio.
//
// Se corre desde actualizar.bat ANTES del git pull: así el archivo ya está a
// salvo el día que se borre del repositorio y el pull lo quite de scripts/.
import path from "path";
import { fileURLToPath } from "url";
import { ponerListadoASalvo } from "../lib/listado-celulares.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { copiado, motivo } = ponerListadoASalvo(RAIZ);

if (copiado) {
  console.log("   El listado de telefonia se copio a data\\celulares-oficial.json");
  console.log("   Ahi trae contrasenas, y data\\ no se sube al repositorio.");
} else {
  console.log(`   Listado de telefonia: ${motivo}`);
}
