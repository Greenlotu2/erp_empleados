import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// 🔑 Usar OBLIGATORIAMENTE Service Role Key para evitar bloqueos por RLS en el servidor
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 
const JWT_SECRET = process.env.JWT_SECRET || '';

if (!serviceRoleKey) {
  console.warn('⚠️ ATENCIÓN: SUPABASE_SERVICE_ROLE_KEY no está definida en las variables de entorno (.env.local)');
}

export const supabaseAdmin = createClient(
  supabaseUrl, 
  serviceRoleKey, 
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function verifyApiToken(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, empleado: null, error: 'Token de autorización ausente o inválido' };
  }

  const token = authHeader.split(' ')[1];

  // 1. Intento A: Verificar como JWT propio (generado por /api/auth/login)
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id) {
        const { data: empleado } = await supabaseAdmin
          .from('empleados')
          .select('id, nombre, rol, username, user_id, horas_acumuladas, horas_totales_objetivo')
          .eq('id', decoded.id)
          .maybeSingle();

        return { user: decoded, empleado, token, error: null };
      }
    } catch (jwtErr) {
      // Si falla como JWT propio, continúa al intento B con Supabase Auth
    }
  }

  // 2. Intento B: Verificar como AccessToken oficial de Supabase Auth
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { user: null, empleado: null, error: 'Sesión no válida o expirada' };
  }

  // Obtener empleado vinculado al usuario de Supabase Auth
  const { data: empleado } = await supabaseAdmin
    .from('empleados')
    .select('id, nombre, rol, username, user_id, horas_acumuladas, horas_totales_objetivo')
    .or(`user_id.eq.${user.id},username.ilike.${user.email}`)
    .maybeSingle();

  return { user, empleado, token, error: null };
}