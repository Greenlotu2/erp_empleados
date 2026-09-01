import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/api-auth';
import { verifyAuthToken } from '../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Puntos y nivel de recompensa de un empleado — la extensión los muestra en su
// propia pestaña "Recompensas". Los puntos en sí se otorgan por un trigger de
// Supabase (fn_otorgar_puntos_tarea_completada) cuando una tarea pasa a
// "Completada"; este endpoint solo lee el total y el historial.
export async function GET(req: NextRequest) {
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get('employeeId') || searchParams.get('empleadoId');
    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    const targetEmpId = !isAdmin ? user.id : (requestedEmpId || user.id);

    const { data: empleado, error: empErr } = await supabaseAdmin
      .from('empleados')
      .select('puntos_recompensa')
      .eq('id', targetEmpId)
      .maybeSingle();

    if (empErr) throw empErr;

    const { data: historial, error: histErr } = await supabaseAdmin
      .from('recompensa_historial')
      .select('id, puntos, motivo, created_at')
      .eq('empleado_id', targetEmpId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (histErr) throw histErr;

    return NextResponse.json({
      success: true,
      puntosRecompensa: (empleado as any)?.puntos_recompensa || 0,
      historial: historial || [],
    }, { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar recompensas' }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
