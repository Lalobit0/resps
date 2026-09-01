import { redirect } from "next/navigation";
import { haySoloCuentaInicial, usuarioActual, CLAVE_INICIAL, USUARIO_INICIAL } from "../../lib/auth";
import { getConfig } from "../../lib/db";
import FormaAcceso from "../../components/FormaAcceso";

export const dynamic = "force-dynamic";

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Quien ya entró no tiene nada que hacer aquí.
  if (await usuarioActual()) redirect("/");

  const sp = await searchParams;
  const volver = typeof sp.volver === "string" ? sp.volver : "/";
  const nombreApp = getConfig("app_nombre", "Control Sultana");
  const primeraVez = haySoloCuentaInicial();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sultana-logo-sidebar.png" alt="Sultana Packaging" className="mx-auto w-44" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{nombreApp}</p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-xl">
          <h1 className="text-lg font-bold text-ink">Entrar</h1>
          <p className="mt-1 text-sm text-soft">Usa la cuenta que te dio el administrador.</p>
          <FormaAcceso volver={volver} />
        </div>

        {primeraVez ? (
          <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Primer arranque</p>
            <p className="mt-1">
              Todavía no hay cuentas. Entra con <b>{USUARIO_INICIAL}</b> / <b>{CLAVE_INICIAL}</b>; el sistema te va a
              pedir una contraseña nueva antes de dejarte hacer cualquier cosa. Este aviso desaparece en cuanto la
              cambies.
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-center text-[11px] text-white/40">Uso interno · Sultana Packaging</p>
      </div>
    </div>
  );
}
