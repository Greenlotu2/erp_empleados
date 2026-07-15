import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { message: 'Campos vacíos' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // 1. Autenticar contra Supabase Auth (username debe ser el email registrado en Auth)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: username,
      password: password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { message: 'Usuario o contraseña incorrectos' },
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // 2. Traer el perfil del empleado vinculado a ese user_id
    const { data: empleado, error: empleadoError } = await supabase
      .from('empleados')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();

    if (empleadoError || !empleado) {
      return NextResponse.json(
        { message: 'Empleado no encontrado en la tabla de perfiles' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return NextResponse.json(
      {
        user: {
          id: empleado.id,
          name: empleado.nombre,
          role: empleado.rol,
        },
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}