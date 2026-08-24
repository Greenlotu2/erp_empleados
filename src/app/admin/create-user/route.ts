import { createServerClient } from '@supabase/ssr';
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
    let isAuthorized = false;

    // 1. Intento A: Verificar Token JWT en el encabezado Authorization (Bearer)
    const jwtCaller = verifyAuthToken(request);
    if (jwtCaller && (jwtCaller.rol.toLowerCase() === 'administrador' || jwtCaller.rol.toLowerCase() === 'admin')) {
      isAuthorized = true;
    }

    // 2. Intento B: Verificar Sesión de Supabase vía Cookies (Panel Web Next.js)
    if (!isAuthorized) {
      const supabaseSsr = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll() {},
          },
        }
      );

      const { data: { user } } = await supabaseSsr.auth.getUser();

      if (user) {
        // Consultar rol en la tabla empleados
        const { data: emp } = await supabaseAdmin
          .from('empleados')
          .select('rol')
          .or(`user_id.eq.${user.id},username.ilike.${user.email}`)
          .maybeSingle();

        const role = emp?.rol?.toLowerCase();
        if (role === 'admin' || role === 'administrador') {
          isAuthorized = true;
        }
      }
    }

    // Si ninguno de los dos métodos valida al Administrador, bloquear acceso
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Acceso denegado: Se requieren permisos de Administrador' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, nombre, rol, especialidad, disponibilidad, horasTotalesObjetivo, avatarUrl, color, nivel } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Correo y contraseña son obligatorios' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: `Error en Auth: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user.id;

    // Generar hash de la contraseña con bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertar en la tabla empleados
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
        nivel: nivel || 'Trabajador',
        horas_acumuladas: 0,
        horas_totales_objetivo: horasTotalesObjetivo ? parseInt(horasTotalesObjetivo) : null,
      })
      .select()
      .single();

    if (empError) {
      // Rollback: Borrar usuario de Auth si falla la tabla empleados
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en Empleados: ${empError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, employee: empData });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}