// Cliente único de Supabase (browser) compartido por toda la app.
//
// Antes, cada página/componente creaba su propio `createClient(...)`, y varios de
// ellos podían estar montados a la vez en la misma pantalla (ej. /admin/revisiones
// monta la página + CalendarioRevisiones + KpisPanel, cada uno con su propio cliente).
// Como todos usan la misma clave de sesión en localStorage, Supabase advertía
// "Multiple GoTrueClient instances detected... may produce undefined behavior when
// used concurrently" — y ese comportamiento indefinido se manifestaba como
// peticiones (ej. el .update() al arrastrar un evento) que nunca llegaban a hacer
// fetch, sin error ni éxito, aparentemente colgadas esperando el lock de auth de
// otra instancia. Un único cliente compartido elimina la condición de carrera.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Patrón Singleton para sobrevivir al Fast Refresh de Next.js en dev: sin esto,
// cada vez que Fast Refresh re-ejecuta este módulo se crea OTRO GoTrueClient más,
// agravando la advertencia de "Multiple GoTrueClient instances".
const globalForSupabase = globalThis as unknown as { supabase?: SupabaseClient };

export const supabase: SupabaseClient =
  globalForSupabase.supabase ||
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;
