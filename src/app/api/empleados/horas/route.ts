import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/api-auth';
import { verifyAuthToken } from '../../../../lib/auth';

export async function PATCH(req: NextRequest) {
  // 🔒 1. Verificar autenticación JWT
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado / Token inválido' }, { status: 401 });
  }

  try {
    const { employeeId, horasAcumuladas, targetHours } = await req.json();

    // 🛡️ 2. Ownership check: Un empleado solo puede actualizar sus propias horas
    const isAdmin = user.rol.toLowerCase() === 'administrador' || user.rol.toLowerCase() === 'admin';
    if (!isAdmin && user.id !== employeeId) {
      return NextResponse.json({ error: 'No tienes permiso para actualizar este perfil' }, { status: 403 });
    }

    // 3. Actualizar horas acumuladas en Supabase
    const { data: employee, error } = await supabaseAdmin
      .from('empleados')
      .update({
        horas_acumuladas: horasAcumuladas,
        horas_totales_objetivo: targetHours
      })
      .eq('id', employeeId)
      .select('id, nombre, horas_acumuladas, horas_totales_objetivo')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, employee });

  } catch (err: any) {
    console.error('Error actualizando horas:', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}