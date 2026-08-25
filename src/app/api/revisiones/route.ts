import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/api-auth';
import { verifyAuthToken } from '../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 1. OBTENER HISTORIAL DE REVISIONES (GET)
export async function GET(request: NextRequest) {
  const user = verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId') || searchParams.get('empleado_id');

    let query = supabaseAdmin.from('revisiones').select('*, tareas(titulo), proyectos(nombre)');

    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    if (!isAdmin) {
      query = query.eq('empleado_id', user.id);
    } else if (empleadoId) {
      query = query.eq('empleado_id', empleadoId);
    }

    const { data: revisiones, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, revisiones: revisiones || [] }, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, revisiones: [] }, { status: 200, headers: corsHeaders });
  }
}

// 2. REGISTRAR REVISIÓN DESDE EXTENSIÓN O WEB (POST)
export async function POST(request: NextRequest) {
  const user = verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { taskId, taskTitle, employeeId, employeeName, comentarios } = body;

    if (!taskId || !taskTitle) {
      return NextResponse.json({ error: 'Datos de la tarea incompletos' }, { status: 400, headers: corsHeaders });
    }

    // Convertir taskId a número (coincide con BIGINT en Supabase)
    const numericTaskId = typeof taskId === 'number' ? taskId : parseInt(taskId, 10);
    const targetEmpId = employeeId || user.id;
    const targetEmpName = employeeName || user.email;

    // A) Obtener información de la tarea (incluye fecha límite para mostrarla en Revisiones)
    const { data: tarea } = await supabaseAdmin
      .from('tareas')
      .select('proyecto_id, fecha_limite')
      .eq('id', numericTaskId)
      .maybeSingle();

    // B) Insertar en la tabla revisiones (queda como bitácora de la entrega, ya no
    // representa una reunión pendiente de agendar — ese paso se eliminó del flujo).
    const { data: revision, error: revError } = await supabaseAdmin
      .from('revisiones')
      .insert({
        tarea_id: isNaN(numericTaskId) ? null : numericTaskId,
        empleado_id: targetEmpId,
        proyecto_id: tarea?.proyecto_id || null,
        titulo_tarea: taskTitle.trim(),
        comentarios: comentarios?.trim() || 'Tarea completada desde la extensión',
        estado: 'Completada'
      })
      .select()
      .single();

    if (revError) throw revError;

    // C) Crear la Notificación para activar la campanita 🔔 en AdminDashboard. El bell
    // no filtra por destinatario (lo ve cualquier admin/coordinador que abra el panel),
    // así que una sola fila es suficiente.
    await supabaseAdmin
      .from('notificaciones')
      .insert({
        empleado_id: targetEmpId,
        proyecto_id: tarea?.proyecto_id || null,
        tarea_id: isNaN(numericTaskId) ? null : numericTaskId,
        titulo_tarea: `✅ ${targetEmpName} completó la tarea: "${taskTitle}"`,
        estado: 'Pendiente'
      });

    // D) Completar la tarea directamente — ya no pasa por 'En Revisión' a la espera de
    // que un admin agende una reunión de revisión.
    if (!isNaN(numericTaskId)) {
      await supabaseAdmin
        .from('tareas')
        .update({ estado: 'Completada', porcentaje_avance: 100 })
        .eq('id', numericTaskId);

      // E) Reflejar la finalización en el calendario: cualquier evento vinculado a esta
      // tarea (el marcador automático de "Fecha Límite", o una revisión agendada
      // manualmente) pasa de pendiente a Completada sin intervención del admin.
      await supabaseAdmin
        .from('reuniones')
        .update({ estado: 'Completada' })
        .eq('tarea_id', numericTaskId)
        .neq('estado', 'Completada');
    }

    return NextResponse.json({ success: true, revision }, { status: 200, headers: corsHeaders });

  } catch (err: any) {
    console.error('Error al procesar la revisión:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}