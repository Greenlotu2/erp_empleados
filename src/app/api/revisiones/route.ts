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
    const { taskId, taskTitle, employeeId, employeeName, comentarios, evidenciaBase64, evidenciaNombre, evidenciaTipo } = body;

    if (!taskId || !taskTitle) {
      return NextResponse.json({ error: 'Datos de la tarea incompletos' }, { status: 400, headers: corsHeaders });
    }

    // Convertir taskId a número (coincide con BIGINT en Supabase)
    const numericTaskId = typeof taskId === 'number' ? taskId : parseInt(taskId, 10);
    const targetEmpId = employeeId || user.id;
    const targetEmpName = employeeName || user.email;

    // 🛡️ Idempotencia: si la tarea YA está en 'En Revisión' es que un envío anterior
    // (ej. un doble clic en "Enviar a Revisión" antes de que la extensión alcance a
    // deshabilitar el botón) ya la puso ahí — no crear otra revisión/notificación
    // duplicada. Se usa `tareas.estado` (no `revisiones.estado`, que nunca se
    // actualiza tras aprobar/rechazar y siempre quedaría en "Pendiente") porque es
    // el único de los dos que sí se mantiene sincronizado con la decisión real del
    // admin — si se usara `revisiones.estado` esto bloquearía para siempre cualquier
    // reenvío legítimo de una tarea que ya se hubiera enviado alguna vez antes.
    if (!isNaN(numericTaskId)) {
      const { data: tareaActual } = await supabaseAdmin
        .from('tareas')
        .select('estado')
        .eq('id', numericTaskId)
        .maybeSingle();

      if ((tareaActual as any)?.estado?.toLowerCase().includes('revisi')) {
        return NextResponse.json(
          { success: true, alreadyPending: true },
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // A.1) Evidencia adjunta (opcional) — llega en base64 desde la extensión (no puede
    // mandar multipart/form-data a través del relay de chrome.runtime.sendMessage),
    // se sube aquí con el service role para no depender de políticas RLS de Storage.
    let evidenciaUrl: string | null = null;
    let evidenciaNombreFinal: string | null = null;

    if (evidenciaBase64 && evidenciaNombre) {
      try {
        const buffer = Buffer.from(evidenciaBase64, 'base64');
        const MAX_BYTES = 5 * 1024 * 1024; // 5MB
        if (buffer.length > MAX_BYTES) {
          return NextResponse.json({ error: 'El archivo de evidencia supera los 5MB' }, { status: 400, headers: corsHeaders });
        }

        const nombreSeguro = String(evidenciaNombre)
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `evidencias/${isNaN(numericTaskId) ? 'sin_id' : numericTaskId}/${Date.now()}_${nombreSeguro}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from('documentacion')
          .upload(path, buffer, { contentType: evidenciaTipo || 'application/octet-stream' });

        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage.from('documentacion').getPublicUrl(path);
          evidenciaUrl = urlData?.publicUrl || null;
          evidenciaNombreFinal = evidenciaNombre;
        } else {
          console.error('Error subiendo evidencia a Storage:', uploadErr);
        }
      } catch (evErr) {
        console.error('Error procesando evidencia adjunta:', evErr);
      }
    }

    // A) Obtener información de la tarea (incluye fecha límite para mostrarla en Revisiones)
    const { data: tarea } = await supabaseAdmin
      .from('tareas')
      .select('proyecto_id, fecha_limite')
      .eq('id', numericTaskId)
      .maybeSingle();

    // B) Insertar en la tabla revisiones — bitácora de la entrega, a la espera de
    // aprobación (ya no representa una reunión pendiente de agendar).
    const { data: revision, error: revError } = await supabaseAdmin
      .from('revisiones')
      .insert({
        tarea_id: isNaN(numericTaskId) ? null : numericTaskId,
        empleado_id: targetEmpId,
        proyecto_id: tarea?.proyecto_id || null,
        titulo_tarea: taskTitle.trim(),
        comentarios: comentarios?.trim() || 'Tarea enviada a revisión desde la extensión',
        estado: 'Pendiente',
        evidencia_url: evidenciaUrl,
        evidencia_nombre: evidenciaNombreFinal,
      })
      .select()
      .single();

    if (revError) throw revError;

    // C) Crear la Notificación para activar la campanita 🔔 en AdminDashboard. El bell
    // no filtra por destinatario (lo ve cualquier admin/coordinador que abra el panel),
    // así que una sola fila es suficiente. Aprobar/Rechazar (page.tsx) son los que
    // deciden si la tarea queda realmente Completada o regresa al empleado.
    await supabaseAdmin
      .from('notificaciones')
      .insert({
        empleado_id: targetEmpId,
        proyecto_id: tarea?.proyecto_id || null,
        tarea_id: isNaN(numericTaskId) ? null : numericTaskId,
        titulo_tarea: `🚀 ${targetEmpName} envió a revisión la tarea: "${taskTitle}"`,
        estado: 'Pendiente',
        evidencia_url: evidenciaUrl,
        evidencia_nombre: evidenciaNombreFinal,
      });

    // D) La tarea queda 'En Revisión' — completarla de verdad (con fecha_completado y
    // sincronización del calendario) es responsabilidad del Aprobar/Rechazar del admin.
    if (!isNaN(numericTaskId)) {
      await supabaseAdmin
        .from('tareas')
        .update({ estado: 'En Revisión' })
        .eq('id', numericTaskId);
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