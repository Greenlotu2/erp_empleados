import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/api-auth';
import { verifyAuthToken } from '../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 1. OBTENER TAREAS (GET)
export async function GET(req: NextRequest) {
  // 🔒 Verificación de Token JWT
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get('employeeId') || searchParams.get('empleadoId');

    let query = supabaseAdmin
      .from('tareas')
      .select('*, proyectos(nombre)');

    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';

    // Si no es admin, solo puede consultar sus tareas o colaboraciones
    if (!isAdmin) {
      query = query.or(`empleado_id.eq.${user.id},colaboradores_ids.cs.{${user.id}}`);
    } else if (requestedEmpId) {
      query = query.or(`empleado_id.eq.${requestedEmpId},colaboradores_ids.cs.{${requestedEmpId}}`);
    }

    const { data: tareas, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, tareas: tareas || [] }, { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar tareas' }, { status: 500, headers: corsHeaders });
  }
}

// 2. ACTUALIZAR ESTADO DE TAREA (PATCH)
export async function PATCH(req: NextRequest) {
  // 🔒 Verificación de Token JWT
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { taskId, estado, porcentajeAvance } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'ID de la tarea requerido' }, { status: 400, headers: corsHeaders });
    }

    // A) Consultar la tarea para verificar ownership
    const { data: tarea, error: fetchErr } = await supabaseAdmin
      .from('tareas')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (fetchErr || !tarea) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404, headers: corsHeaders });
    }

    // B) Validar permisos (Ownership Check)
    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    const isOwner = tarea.empleado_id === user.id;
    const isCollaborator = Array.isArray(tarea.colaboradores_ids) && tarea.colaboradores_ids.includes(user.id);

    if (!isAdmin && !isOwner && !isCollaborator) {
      return NextResponse.json({ error: 'No tienes permisos para modificar esta tarea' }, { status: 403, headers: corsHeaders });
    }

    // C) Construir payload de actualización
    const updatePayload: any = {};
    if (estado !== undefined) updatePayload.estado = estado;
    if (porcentajeAvance !== undefined) updatePayload.porcentaje_avance = porcentajeAvance;

    const { data: updatedTask, error: updateErr } = await supabaseAdmin
      .from('tareas')
      .update(updatePayload)
      .eq('id', taskId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, tarea: updatedTask }, { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar tarea' }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}