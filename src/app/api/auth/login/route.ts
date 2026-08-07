import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.username || !body.password) {
      return NextResponse.json(
        { message: 'Faltan campos (username o password)' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { username, password } = body;

    // 1. Autenticar en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: username,
      password: password,
    });

    if (authError || !authData.user || !authData.session) {
      console.warn('⚠️ Error de autenticación Supabase:', authError?.message);
      return NextResponse.json(
        { message: 'Usuario o contraseña incorrectos' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. Traer perfil de la tabla empleados
    const { data: empleado, error: empleadoError } = await supabase
      .from('empleados')
      .select('*')
      .or(`user_id.eq.${authData.user.id},email.eq.${username}`)
      .maybeSingle();

    if (empleadoError) {
      console.error('❌ Error consultando tabla empleados:', empleadoError.message);
      return NextResponse.json(
        { message: 'Error consultando base de datos', details: empleadoError.message },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!empleado) {
      return NextResponse.json(
        { message: 'Usuario autenticado pero sin registro en la tabla empleados' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        user: {
          id: empleado.id,
          name: empleado.nombre,
          role: empleado.rol,
          email: authData.user.email,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('🔥 Error 500 no controlado en /api/auth/login:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}