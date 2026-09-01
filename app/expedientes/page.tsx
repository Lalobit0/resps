import { exigirPagina } from "../../lib/guardia";
import { puede } from "../../lib/auth";
import { db } from "../../lib/db";
import { resumenExpedientes } from "../../lib/expedientes";
import ExpedientesClient from "../../components/ExpedientesClient";
import { PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

/**
 * El listado de expedientes.
 *
 * No es un directorio de personal con archivos colgados: la pregunta que
 * contesta es "¿quién tiene problemas documentales hoy?". Por eso lo primero
 * que se ve de cada persona es su cumplimiento y qué le falta, no sus datos.
 */
export default async function PaginaExpedientes() {
  const u = await exigirPagina("exp.ver");

  const filas = resumenExpedientes();
  const reglas = (db.prepare("SELECT COUNT(*) AS c FROM matriz_reglas WHERE activo = 1").get() as { c: number }).c;

  return (
    <>
      <PageHeader eyebrow="Recursos Humanos" title="Expedientes digitales">
        <span className="text-sm text-soft">{filas.length} personas activas</span>
      </PageHeader>

      <ExpedientesClient
        filas={filas}
        sinMatriz={reglas === 0}
        puedeConfigurar={puede(u, "exp.configurar")}
      />
    </>
  );
}
