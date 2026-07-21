import fs from "fs";
import path from "path";
import { BACKUP_DIR, DB_PATH } from "../../lib/db";
import { PageHeader } from "../../components/ui";
import RespaldosClient, { type Respaldo } from "../../components/RespaldosClient";

export const dynamic = "force-dynamic";

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PaginaRespaldos() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const respaldos: Respaldo[] = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => /^app-\d{8}-\d{6}\.db$/.test(n))
    .sort()
    .reverse()
    .map((nombre) => {
      const st = fs.statSync(path.join(BACKUP_DIR, nombre));
      return { nombre, tamano: tamanoLegible(st.size), fecha: st.mtime.toLocaleString("es-MX") };
    });

  const pendiente = fs.existsSync(`${DB_PATH}.restore`);

  return (
    <>
      <PageHeader eyebrow="Mantenimiento" title="Respaldos de la base de datos" />
      <p className="mb-5 max-w-2xl text-sm text-soft">
        Un respaldo es una copia de toda la información (empleados, inventario, responsivas). Crea uno seguido —sobre
        todo antes de una importación grande— y guárdalo también fuera de la laptop. Para restaurar, la app debe
        cerrarse y volver a abrirse.
      </p>
      <RespaldosClient respaldos={respaldos} pendiente={pendiente} />
    </>
  );
}
