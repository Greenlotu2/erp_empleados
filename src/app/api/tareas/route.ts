import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId') || searchParams.get('empleado_id');

    let query = supabaseServer.from('tareas').select('*');

    if (empleadoId) {
      query = query.eq('empleado_id', empleadoId);
    }

    const { data: tareas, error } = await query;

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json(tareas || [], { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, estado } = body;

    const updateData: any = { estado };
    if (estado === 'Completado') {
      updateData.fecha_completado = new Date().toISOString();
    } else {
      updateData.fecha_completado = null;
    }

    const { data, error } = await supabaseServer
      .from('tareas')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json(data, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}