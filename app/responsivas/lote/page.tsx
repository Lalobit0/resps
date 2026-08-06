import Link from "next/link";
import { db } from "../../../lib/db";
import type { Empleado } from "../../../lib/types";
import CargaMasivaClient from "../../../components/CargaMasivaClient";
import { PageHeader, btnGhost } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaCargaMasiva() {
  const empleados = db.prepare("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC").all() as Empleado[];

  return (
    <>
      <PageHeader eyebrow="Responsivas" title="Carga masiva de responsivas">
        <Link href="/responsivas/cargar" className={btnGhost}>
          Cargar una sola
        </Link>
      </PageHeader>
      <CargaMasivaClient empleados={empleados} />
    </>
  );
}
