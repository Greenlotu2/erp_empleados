import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId') || searchParams.get('empleado_id');

    let query = supabaseServer.from('revisiones').select('*');

    if (empleadoId) {
      query = query.eq('empleado_id', empleadoId);
    }

    const { data: revisiones, error } = await query;

    if (error) {
      // Retorna arreglo vacío si la tabla no tiene datos aún para evitar romper el UI
      return NextResponse.json([], { status: 200, headers: corsHeaders });
    }

    return NextResponse.json(revisiones || [], { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json([], { status: 200, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}