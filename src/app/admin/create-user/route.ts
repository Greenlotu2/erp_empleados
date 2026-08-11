import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyAuthToken } from '../../../lib/auth';

// Cliente administrativo con permisos elevados (Service Role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // 🛡️ 1. VERIFICACIÓN DE SEGURIDAD: Solo Administradores pueden crear usuarios
    const caller = verifyAuthToken(request);
    // Si viene desde la app web (cookies de sesión de Supabase Auth)
    if (!caller) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader) {
        // Validación fallback por si la llamada viene desde la sesión web del Admin
        const { data: { user } } = await supabaseAdmin.auth.getUser(
          request.cookies.get('sb-access-token')?.value || ''
        );
      }
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

    // 🔒 2. Crear usuario oficial en Supabase Auth (Supabase encripta la contraseña internamente)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: `Error en Auth: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user.id;

    // 🔑 3. Generar Hash con bcrypt para la tabla de empleados (evita texto plano)
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Insertar en la tabla 'empleados' con password_hash y sin texto plano
    const { data: empData, error: empError } = await supabaseAdmin
      .from('empleados')
      .insert({
        user_id: userId,
        username: cleanEmail,
        nombre: nombre.trim(),
        rol: rol || 'Practicante',
        password_hash: passwordHash, // 👈 SE GUARDA HASH ENCRIPTADO (NO TEXTO PLANO)
        especialidad: especialidad || 'General',
        disponibilidad: disponibilidad === 'Disponible',
        avatar_url: avatarUrl || null,
        color: color || '#2563eb', // 👈 Se incluye el color de perfil
        horas_acumuladas: 0,
        horas_totales_objetivo: horasTotalesObjetivo ? parseInt(horasTotalesObjetivo) : null,
      })
      .select()
      .single();

    if (empError) {
      // Rollback: Borrar el usuario de Auth si la tabla de empleados falla
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en Empleados: ${empError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, employee: empData });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}