import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/api-auth'; // Ajusta la ruta relativa si es necesario
import { verifyAuthToken } from '../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(req: NextRequest) {
  // 🔒 Verificación de Token JWT — antes este endpoint no verificaba nada, así que
  // cualquiera podía leer las reuniones de cualquier empleado con solo saber su id.
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401, headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedEmpId = searchParams.get('employeeId') || searchParams.get('empleadoId');

    // 🛡️ Ownership check (mismo patrón que /api/tareas): un empleado normal solo
    // puede consultar sus propias reuniones, sin importar qué employeeId mande.
    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    const employeeId = isAdmin ? (requestedEmpId || user.id) : user.id;

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId es requerido' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 🎯 1. Buscar por empleado_id específico O por reuniones generales (empleado_id es null)
    // 🎯 2. Traer el nombre del proyecto asociado
    // 🎯 3. Ordenar por fecha_inicio para que aparezcan en orden cronológico
    const { data: reuniones, error } = await supabaseAdmin
      .from('reuniones')
      .select(`
        id,
        titulo,
        descripcion,
        fecha_inicio,
        fecha_fin,
        fecha,
        hora,
        link,
        estado,
        empleado_id,
        proyecto_id,
        proyectos (nombre)
      `)
      .or(`empleado_id.eq.${employeeId},empleado_id.is.null`)
      // Los marcadores automáticos de "Fecha Límite" (creados al asignar una tarea con
      // fecha límite) no son reuniones reales a las que el empleado deba unirse — ya ve
      // esa fecha en su pestaña de Tareas, así que se excluyen de este listado.
      .neq('estado', 'Fecha Límite')
      .order('fecha_inicio', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener reuniones:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    // 🎯 Formatear los datos con la estructura exacta que la extensión espera renderizar
    const reunionesFormateadas = (reuniones || []).map((m: any) => ({
      id: m.id,
      titulo: m.titulo || 'Reunión / Revisión',
      descripcion: m.descripcion || '',
      proyecto_nombre: m.proyectos?.nombre || 'General',
      fecha: m.fecha || (m.fecha_inicio ? m.fecha_inicio.split('T')[0] : ''),
      hora: m.hora || (m.fecha_inicio ? m.fecha_inicio.substring(11, 16) : ''),
      fecha_inicio: m.fecha_inicio,
      fecha_fin: m.fecha_fin,
      link: m.link || null,
      modalidad: m.link ? 'virtual' : 'presencial',
      estado: m.estado || 'Programada',
    }));

    return NextResponse.json(reunionesFormateadas, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error('❌ Error interno en GET /api/reuniones:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}