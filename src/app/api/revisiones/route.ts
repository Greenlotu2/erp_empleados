import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';
import { verifyAuthToken } from '../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 1. OBTENER REVISIONES (GET)
export async function GET(request: NextRequest) {
  // 🔒 Verificar Autenticación JWT
  const user = verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId') || searchParams.get('empleado_id');

    let query = supabaseServer.from('revisiones').select('*');

    // Si no es admin, restringe la búsqueda a su propio ID
    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    if (!isAdmin) {
      query = query.eq('empleado_id', user.id);
    } else if (empleadoId) {
      query = query.eq('empleado_id', empleadoId);
    }

    const { data: revisiones, error } = await query;

    if (error) {
      return NextResponse.json([], { status: 200, headers: corsHeaders });
    }

    return NextResponse.json(revisiones || [], { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json([], { status: 200, headers: corsHeaders });
  }
}

// 2. CREAR SOLICITUD DE REVISIÓN DESDE LA EXTENSIÓN (POST)
export async function POST(request: NextRequest) {
  // 🔒 Verificar Autenticación JWT
  const user = verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { taskId, taskTitle, employeeId, employeeName } = body;

    if (!taskId || !taskTitle) {
      return NextResponse.json({ error: 'Datos de la tarea incompletos' }, { status: 400, headers: corsHeaders });
    }

    // A) Obtener el proyecto de la tarea
    const { data: tarea } = await supabaseServer
      .from('tareas')
      .select('proyecto_id')
      .eq('id', taskId)
      .maybeSingle();

    // B) Crear la Notificación para el Admin (activa la campanita 🔔)
    const targetEmpId = employeeId || user.id;
    const targetEmpName = employeeName || user.email;

    const { data: notificacion, error: notifErr } = await supabaseServer
      .from('notificaciones')
      .insert({
        empleado_id: targetEmpId,
        proyecto_id: tarea?.proyecto_id || null,
        titulo_tarea: `🚀 ${targetEmpName} solicitó revisión: "${taskTitle}"`,
        estado: 'Pendiente'
      })
      .select()
      .single();

    if (notifErr) throw notifErr;

    // C) Actualizar el estado de la tarea a "En Revisión"
    await supabaseServer
      .from('tareas')
      .update({ estado: 'En Revisión' })
      .eq('id', taskId);

    return NextResponse.json({ success: true, notificacion }, { status: 200, headers: corsHeaders });

  } catch (err: any) {
    console.error('Error procesando revisión:', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500, headers: corsHeaders });
  }
}

// 3. RESPUESTA PREFLIGHT CORS (OPTIONS)
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}