// Detecta el id (en la tabla `empleados`) del administrador con sesión iniciada.
//
// Antes este archivo creaba su propio `createBrowserClient` (mismo patrón que
// login/page.tsx) porque el singleton de `lib/supabaseClient.ts` guardaba la
// sesión en localStorage mientras que el login la guardaba en cookies — dos
// sesiones separadas que no se sincronizaban entre sí. Ahora que el singleton usa
// `createBrowserClient` (cookies) también, ya es el mismo cliente/la misma sesión
// en todos lados, así que usa el singleton directamente para todo.
import { supabase } from "./supabaseClient";

export async function getCurrentAdminId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empleado } = await supabase
    .from("empleados")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (empleado as any)?.id || null;
}
