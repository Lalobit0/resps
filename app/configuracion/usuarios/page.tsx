import { redirect } from "next/navigation";
import { db } from "../../../lib/db";
import { puede, usuarioActual } from "../../../lib/auth";
import UsuariosClient, { type RolFila, type UsuarioFila } from "../../../components/UsuariosClient";
import { PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

export default async function PaginaUsuarios() {
  const yo = await usuarioActual();
  if (!puede(yo, "usuarios.administrar")) redirect("/");

  const usuarios = db
    .prepare(
      `SELECT u.id, u.usuario, u.nombre, u.correo, u.rol_id, u.activo, u.debe_cambiar, u.ultimo_acceso,
              r.nombre AS rol_nombre, r.todo,
              (SELECT COUNT(*) FROM sesiones s WHERE s.usuario_id = u.id AND s.expira > datetime('now','localtime')) AS sesiones
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       ORDER BY u.activo DESC, u.nombre ASC`
    )
    .all() as UsuarioFila[];

  const roles = db
    .prepare(
      `SELECT r.id, r.clave, r.nombre, r.descripcion, r.todo, r.sistema, r.activo,
              (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS personas
       FROM roles r ORDER BY r.todo DESC, r.sistema DESC, r.nombre ASC`
    )
    .all() as RolFila[];

  const permisosPorRol: Record<number, string[]> = {};
  for (const fila of db.prepare("SELECT rol_id, permiso FROM rol_permisos").all() as {
    rol_id: number;
    permiso: string;
  }[]) {
    (permisosPorRol[fila.rol_id] ??= []).push(fila.permiso);
  }

  const empleados = db
    .prepare("SELECT id, nombre, numero_empleado FROM empleados WHERE activo = 1 ORDER BY nombre ASC")
    .all() as { id: number; nombre: string; numero_empleado: string }[];

  return (
    <>
      <PageHeader eyebrow="Administración" title="Usuarios y roles">
        <span className="text-sm text-soft">
          {usuarios.filter((u) => u.activo).length} activos · {roles.length} roles
        </span>
      </PageHeader>

      <UsuariosClient
        usuarios={usuarios}
        roles={roles}
        permisosPorRol={permisosPorRol}
        empleados={empleados}
        miId={yo!.id}
      />
    </>
  );
}
