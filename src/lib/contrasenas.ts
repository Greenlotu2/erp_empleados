import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./api-auth";

// La contraseña de un integrante vive en DOS lugares y ambos deben quedar iguales:
//  - Supabase Auth (empleados.user_id): login de la web /login.
//  - empleados_auth.password_hash (bcrypt): login de la extensión y de la app.
// La usan "Cambiar contraseña" (app móvil) y "Restablecer contraseña" (web).

export const MIN_CONTRASENA = 8;

// Primero Supabase Auth (aplica su propia política de contraseñas); luego el
// hash. Si el hash falla y se conoce la contraseña anterior (`revertirA`), se
// regresa Supabase Auth a ella para no dejar las dos desincronizadas.
export async function fijarContrasena(
  empleadoId: string,
  nueva: string,
  revertirA?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: emp } = await supabaseAdmin
    .from("empleados")
    .select("user_id")
    .eq("id", empleadoId)
    .maybeSingle();

  if (emp?.user_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.user_id, {
      password: nueva,
    });
    if (error) return { ok: false, error: `No se pudo cambiar la contraseña: ${error.message}` };
  }

  const { error: errHash } = await supabaseAdmin.from("empleados_auth").upsert(
    { empleado_id: empleadoId, password_hash: await bcrypt.hash(nueva, 10), password: null },
    { onConflict: "empleado_id" },
  );
  if (errHash) {
    if (emp?.user_id && revertirA) {
      await supabaseAdmin.auth.admin.updateUserById(emp.user_id, { password: revertirA });
    }
    return { ok: false, error: errHash.message };
  }
  return { ok: true };
}
