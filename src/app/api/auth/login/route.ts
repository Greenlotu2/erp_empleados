import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../../lib/supabaseServer';

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
        { message: 'Ingresa usuario y contraseñaaaaaa' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { username, password } = body;

    // Buscar directamente por la columna username y password
    const { data: empleado, error } = await supabaseServer
      .from('empleados')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (error) {
      console.error('❌ Error Supabase:', error.message);
      return NextResponse.json(
        { message: 'Error consultando base de datos', details: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!empleado) {
      return NextResponse.json(
        { message: 'Usuario o contraseña incorrectos' },
        { status: 401, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        access_token: empleado.id,
        user: {
          id: empleado.id,
          name: empleado.nombre || empleado.username,
          role: empleado.rol || 'Empleado',
          email: empleado.username,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('🔥 Error en Login API:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}