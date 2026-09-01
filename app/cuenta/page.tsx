import { redirect } from "next/navigation";
import { usuarioActual } from "../../lib/auth";
import { db } from "../../lib/db";
import { nombrePermiso } from "../../lib/permisos";
import CambiarClave from "../../components/CambiarClave";
import { Card, PageHeader } from "../../components/ui";
import { fechaCorta } from "../../lib/helpers";

export const dynamic = "force-dynamic";

export default async function PaginaCuenta() {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");

  const permisos = u.todo
    ? ["Todos los permisos del sistema"]
    : [...u.permisos].map(nombrePermiso).sort((a, b) => a.localeCompare(b));

  const sesiones = db
    .prepare("SELECT creada, expira, ip FROM sesiones WHERE usuario_id = ? ORDER BY creada DESC")
    .all(u.id) as { creada: string; expira: string; ip: string | null }[];

  return (
    <>
      <PageHeader eyebrow="Mi cuenta" title={u.nombre} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Cambiar mi contraseña</h2>
          <div className="mt-4">
            <CambiarClave />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Quién soy en el sistema</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-soft">Usuario</dt>
              <dd className="font-medium text-ink">{u.usuario}</dd>
              <dt className="text-soft">Rol</dt>
              <dd className="font-medium text-ink">{u.rol_nombre}</dd>
              <dt className="text-soft">Correo</dt>
              <dd className="text-ink">{u.correo || "—"}</dd>
            </dl>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-soft">Lo que puedo hacer</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {permisos.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-emerald-600">
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wide text-soft">Sesiones abiertas</h2>
            <p className="mt-1 text-xs text-soft">
              Si ves una que no reconoces, cambia tu contraseña: hacerlo cierra todas las demás.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {sesiones.map((s) => (
                <li key={s.creada + (s.ip ?? "")} className="flex justify-between gap-3">
                  <span className="text-ink">Desde {s.ip || "esta computadora"}</span>
                  <span className="text-soft">{fechaCorta(s.creada.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
