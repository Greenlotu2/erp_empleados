// Antes creaba su propio `createBrowserClient(...)` por separado — mismo problema
// de "Multiple GoTrueClient instances" documentado en `supabaseClient.ts`. Ahora
// solo reexporta el cliente único compartido por toda la app.
export { supabase } from './supabaseClient';
