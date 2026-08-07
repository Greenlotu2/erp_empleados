import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// GET: Obtener tareas por empleado_id (pasado por query param o token)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleado_id');

    if (!empleadoId) {
      return NextResponse.json(
        { message: 'Se requiere empleado_id' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: tareas, error } = await supabase
      .from('tareas')
      .select(`
        id,
        titulo,
        descripcion,
        estado,
        prioridad,
        porcentaje_avance,
        proyectos (nombre)
      `)
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: 'Error al consultar tareas', error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ tareas }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH: Cambiar estado o avance de una tarea desde el plugin
export async function PATCH(request: Request) {
  try {
    const { tarea_id, estado, porcentaje_avance } = await request.json();

    if (!tarea_id) {
      return NextResponse.json(
        { message: 'Se requiere tarea_id' },
        { status: 400, headers: corsHeaders }
      );
    }

    const updates: Record<string, any> = {};
    if (estado !== undefined) updates.estado = estado;
    if (porcentaje_avance !== undefined) updates.porcentaje_avance = porcentaje_avance;

    const { data, error } = await supabase
      .from('tareas')
      .update(updates)
      .eq('id', tarea_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: 'Error actualizando tarea', error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ success: true, tarea: data }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}