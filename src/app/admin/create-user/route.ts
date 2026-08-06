import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Cliente administrativo con permisos elevados
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Clave secreta del servidor
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, nombre, rol, especialidad, disponibilidad, horasTotalesObjetivo, avatarUrl } = body;

    // 1. Crear usuario en Auth (confirmado automáticamente y sin romper la sesión del Admin)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: `Error en Auth: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Insertar en la tabla de empleados vinculando el user_id
    const { data: empData, error: empError } = await supabaseAdmin
      .from('empleados')
      .insert({
        user_id: userId,
        username: email,
        nombre,
        rol,
        password,
        especialidad: especialidad || 'General',
        disponibilidad: disponibilidad === 'Disponible',
        avatar_url: avatarUrl || null,
        horas_acumuladas: 0,
        horas_totales_objetivo: horasTotalesObjetivo ? parseInt(horasTotalesObjetivo) : null,
      })
      .select()
      .single();

    if (empError) {
      // Si falla la tabla empleados, borramos el usuario creado en Auth para no dejar basura
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Error en Empleados: ${empError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, employee: empData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}