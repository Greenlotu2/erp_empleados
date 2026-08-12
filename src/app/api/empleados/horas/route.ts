import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/api-auth';
import { verifyAuthToken } from '../../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function PATCH(req: NextRequest) {
  // 🔒 1. Verificar autenticación JWT
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json(
      { error: 'No autorizado / Token inválido' },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const { employeeId, horasAcumuladas, targetHours } = await req.json();

    if (!employeeId || horasAcumuladas === undefined) {
      return NextResponse.json(
        { error: 'ID de empleado y horas acumuladas son requeridos' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 🛡️ 2. Ownership check: Un empleado solo puede actualizar sus propias horas
    const isAdmin = user.rol?.toLowerCase() === 'administrador' || user.rol?.toLowerCase() === 'admin';
    if (!isAdmin && user.id !== employeeId) {
      return NextResponse.json(
        { error: 'No tienes permiso para actualizar este perfil' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 🔢 3. Formatear las horas a número decimal con 2 decimales
    const parsedHours = parseFloat(Number(horasAcumuladas).toFixed(2));

    // 4. Actualizar horas acumuladas en Supabase
    const { data: employee, error } = await supabaseAdmin
      .from('empleados')
      .update({
        horas_acumuladas: parsedHours,
        ...(targetHours ? { horas_totales_objetivo: targetHours } : {})
      })
      .eq('id', employeeId)
      .select('id, nombre, horas_acumuladas, horas_totales_objetivo')
      .single();

    if (error) throw error;

    return NextResponse.json(
      { success: true, employee },
      { status: 200, headers: corsHeaders }
    );

  } catch (err: any) {
    console.error('Error actualizando horas:', err);
    return NextResponse.json(
      { error: err.message || 'Error del servidor' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handler de Preflight CORS para peticiones desde la Extensión de Chrome
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}