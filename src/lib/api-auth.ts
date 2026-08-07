import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

export async function verifyApiToken(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Token de autorización ausente o inválido' };
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: 'Sesión no válida o expirada' };
  }

  // Obtener ID de empleado vinculado al usuario
  const { data: empleado } = await supabaseAdmin
    .from('empleados')
    .select('id, nombre, rol')
    .or(`username.ilike.${user.email},id.eq.${user.id}`)
    .maybeSingle();

  return { user, empleado, token };
}