import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Manejo de Preflight para CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// 1. OBTENER TAREAS FILTRADAS POR EMPLEADO (UUID)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId');

    if (!empleadoId) {
      return NextResponse.json({ message: 'Falta el parámetro empleadoId' }, { status: 400, headers: corsHeaders });
    }

    const { data: tareas, error } = await supabase
      .from('tareas')
      .select('*')
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener tareas de Supabase:', error);
      return NextResponse.json({ message: 'Error en la base de datos' }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json(tareas, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500, headers: corsHeaders });
  }
}

// 2. ACTUALIZAR ESTADO DE UNA TAREA A COMPLETADO
export async function PATCH(request: Request) {
  try {
    const { id, estado } = await request.json();

    if (!id || !estado) {
      return NextResponse.json({ message: 'Faltan parámetros obligatorios (id o estado)' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabase
      .from('tareas')
      .update({ estado: estado })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error al actualizar tarea en Supabase:', error);
      return NextResponse.json({ message: 'Error al actualizar la tarea' }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ message: 'Tarea actualizada con éxito', data }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500, headers: corsHeaders });
  }
}