import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase'; // Asegúrate de usar tu alias o ruta relativa correcta hacia src/lib/supabase

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Campos vacíos' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // Consultar a Supabase buscando al empleado
    const { data: empleado, error } = await supabase
      .from('empleados')
      .select('*')
      .eq('username', username)
      .eq('password', password) // En producción recuerda encriptar/comparar con bcrypt o usar Supabase Auth
      .single();

    if (error || !empleado) {
      return NextResponse.json(
        { message: 'Usuario o contraseña incorrectos' },
        { 
          status: 401, 
          headers: { 'Access-Control-Allow-Origin': '*' } 
        }
      );
    }

    // Si todo coincide, devolvemos la info real guardando el ID del usuario
    return NextResponse.json(
      { 
        user: { 
          id: empleado.id,
          name: empleado.nombre, 
          role: empleado.rol 
        } 
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