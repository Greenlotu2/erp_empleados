import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// 1. OBTENER LAS TAREAS DE LA BASE DE DATOS
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const empleadoId = searchParams.get('empleadoId');

  let query = supabase.from('tareas').select('*');

  // Si pasamos el ID del empleado logueado, filtramos solo sus tareas
  if (empleadoId) {
    query = query.eq('empleado_id', parseInt(empleadoId));
  }

  const { data: tareas, error } = await query.order('id', { ascending: true });

  if (error) {
    return NextResponse.json({ message: 'Error al traer tareas' }, { status: 500 });
  }

  return NextResponse.json(tareas, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    },
  });
}

// 2. ACTUALIZAR EL ESTADO DE UNA TAREA (Patch parcial por ID)
export async function PATCH(request: Request) {
  try {
    // Obtenemos el ID de la tarea desde la URL o el cuerpo de la petición
    // Para simplificar la URL del plugin, la pasaremos en el JSON del cuerpo
    const { id, estado } = await request.json();

    const { data, error } = await supabase
      .from('tareas')
      .update({ estado: estado })
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ message: 'Error al actualizar' }, { status: 400 });
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (err) {
    return NextResponse.json({ message: 'Error en la petición' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}