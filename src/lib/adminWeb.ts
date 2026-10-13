import { supabaseAdmin } from "./api-auth";

// Identifica al empleado dueño de una sesión de Supabase Auth SOLO por
// `empleados.user_id` (el id de la sesión, que no se puede falsificar).
//
// Antes se buscaba con `.or(user_id.eq…,username.ilike.<correo>)`: en ilike
// `_` y `%` son comodines y `_` es válido en un correo, así que alguien
// registrado como `fulan_@dominio.com` podía "ser" `fulano@dominio.com` y
// heredar su rol de Administrador.

export interface EmpleadoSesion {
  id: string;
  nombre: string | null;
  rol: string | null;
  nivel: string | null;
  area: string[] | null;
}

export async function empleadoDeSesion(userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("empleados")
    .select("id, nombre, rol, nivel, area")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as EmpleadoSesion | null) ?? null;
}

// El panel web es solo para empleados con rol de Administrador.
export function esAdminWeb(emp: EmpleadoSesion | null) {
  const rol = (emp?.rol || "").toLowerCase().trim();
  return rol === "admin" || rol === "administrador";
}
