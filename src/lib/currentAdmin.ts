// Detecta el id (en la tabla `empleados`) del administrador con sesión iniciada.
//
// OJO: usa `createBrowserClient` de @supabase/ssr (mismo cliente que login/page.tsx
// y Sidebar.tsx) en vez del singleton de `lib/supabaseClient.ts`, porque ese
// singleton guarda la sesión en localStorage mientras que el login guarda la sesión
// real en cookies (vía @supabase/ssr) — son dos sesiones separadas que no se
// sincronizan entre sí. Usar el singleton aquí devolvía la sesión vieja/cacheada en
// localStorage en vez de quién había iniciado sesión realmente.
import { createBrowserClient } from '@supabase/ssr';
import { supabase } from './supabaseClient';

export async function getCurrentAdminId(): Promise<string | null> {
  const authClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;

  const { data: empleado } = await supabase
    .from('empleados')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return (empleado as any)?.id || null;
}
