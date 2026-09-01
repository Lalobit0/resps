import Link from "next/link";
import { usuarioActual } from "../../lib/auth";
import { nombrePermiso } from "../../lib/permisos";
import { Card } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaSinPermiso({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const permiso = typeof sp.p === "string" ? sp.p : "";
  const u = await usuarioActual();

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <h1 className="text-xl font-bold text-ink">Esta parte no te toca</h1>
        <p className="mt-3 text-sm text-ink">
          Tu rol es <b>{u?.rol_nombre ?? "—"}</b> y esta pantalla pide el permiso{" "}
          <b>“{permiso ? nombrePermiso(permiso) : "que no tienes"}”</b>.
        </p>
        <p className="mt-3 text-sm text-soft">
          No es un error: el sistema está hecho para que cada quien vea solo lo que necesita para su trabajo. Si de
          verdad lo ocupas, pídeselo a quien administra los usuarios.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-md bg-kraft px-4 py-2 text-sm font-semibold text-white hover:bg-kraft-dark"
        >
          Volver al inicio
        </Link>
      </Card>
    </div>
  );
}
