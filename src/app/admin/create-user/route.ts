import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyAuthToken } from '../../../lib/auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // 🔒 1. Verificación estricta de Token JWT de Administrador
    const caller = verifyAuthToken(request);
    
    // Si no hay token JWT válido en el header Bearer, denegar acceso
    if (!caller || (caller.rol.toLowerCase() !== 'administrador' && caller.rol.toLowerCase() !== 'admin')) {
      return NextResponse.json(
        { error: 'Acceso denegado: Se requieren permisos de Administrador' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      email, 
      password, 
      nombre, 
      rol, 
      especialidad, 
      disponibilidad, 
      horasTotalesObjetivo, 
      avatarUrl,
      color 
    } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Correo y contraseña son obligatorios' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Crear usuario oficial en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: `Error en Auth: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user.id;

    // 3. Hash de contraseña con bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Inserción en la tabla empleados
    const { data: empData, error: empError } = await supabaseAdmin
      .from('empleados')
      .insert({
        user_id: userId,
        username: cleanEmail,
        nombre: nombre.trim(),
        rol: rol || 'Practicante',
        password_hash: passwordHash,
        especialidad: especialidad || 'General',
        disponibilidad: disponibilidad === 'Disponible',
        avatar_url: avatarUrl || null,
        color: color || '#2563eb',
        horas_acumuladas: 0,
        horas_totales_objetivo: horasTotalesObjetivo ? parseInt(horasTotalesObjetivo) : null,
      })
      .select()
      .single();

    if (empError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en Empleados: ${empError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, employee: empData });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}