// Cliente único de Supabase (navegador) compartido por TODA la app — tanto para
// leer/escribir datos como para la sesión de autenticación.
//
// Usa `createBrowserClient` de @supabase/ssr (no `createClient` de @supabase/supabase-js)
// porque la sesión real de login se guarda en cookies — así la lee también el
// middleware del lado servidor (`src/middleware.ts`). Antes este archivo usaba
// `createClient` con `persistSession` en localStorage, un almacén de sesión
// SEPARADO del de las cookies: quedaba desincronizado de la sesión real de login,
// lo cual llegó a causar bugs reales (ej. RLS de Storage rechazando subidas de
// usuarios que sí tenían sesión iniciada, porque este cliente los trataba como
// anónimos).
//
// Antes, además, varios archivos que necesitaban la sesión (Sidebar, currentAdmin,
// login) creaban CADA UNO su propio `createBrowserClient(...)` por separado, y
// Supabase advertía en consola "Multiple GoTrueClient instances detected... may
// produce undefined behavior when used concurrently". Con un único cliente
// exportado desde aquí (patrón Singleton + `globalThis` para sobrevivir el Fast
// Refresh de Next.js en dev, que si no re-ejecuta este módulo y crea otro cliente
// más) queda una sola instancia real en todo el navegador.
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const globalForSupabase = globalThis as unknown as {
  supabase?: ReturnType<typeof createBrowserClient>;
};

export const supabase =
  globalForSupabase.supabase || createBrowserClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;
