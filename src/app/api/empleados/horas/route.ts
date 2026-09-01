import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import { verifyAuthToken } from "../../../../lib/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function GET(req: NextRequest) {
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado / Token inválido" },
      { status: 401, headers: corsHeaders },
    );
  }

  const employeeId = req.nextUrl.searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json(
      { error: "employeeId es requerido" },
      { status: 400, headers: corsHeaders },
    );
  }

  const isAdmin =
    user.rol?.toLowerCase() === "administrador" ||
    user.rol?.toLowerCase() === "admin";
  if (!isAdmin && user.id !== employeeId) {
    return NextResponse.json(
      { error: "No tienes permiso para consultar este perfil" },
      { status: 403, headers: corsHeaders },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empleados")
    .select("id, nombre, horas_acumuladas, horas_totales_objetivo")
    .eq("id", employeeId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    { employee: data },
    { status: 200, headers: corsHeaders },
  );
}

export async function PATCH(req: NextRequest) {
  // 🔒 1. Verificar autenticación JWT
  const user = verifyAuthToken(req);
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado / Token inválido" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const { employeeId, horasAcumuladas, deltaHoras, targetHours } =
      await req.json();

    if (
      !employeeId ||
      (horasAcumuladas === undefined && deltaHoras === undefined)
    ) {
      return NextResponse.json(
        { error: "Falta employeeId y horasAcumuladas o deltaHoras" },
        { status: 400, headers: corsHeaders },
      );
    }

    // 🛡️ 2. Ownership check: Un empleado solo puede actualizar sus propias horas
    const isAdmin =
      user.rol?.toLowerCase() === "administrador" ||
      user.rol?.toLowerCase() === "admin";
    if (!isAdmin && user.id !== employeeId) {
      return NextResponse.json(
        { error: "No tienes permiso para actualizar este perfil" },
        { status: 403, headers: corsHeaders },
      );
    }

    // 3. Aplicar el cambio de horas.
    //    - deltaHoras  -> incremento ATÓMICO en la base (sin carrera entre panel y background).
    //    - horasAcumuladas -> valor absoluto (compatibilidad; solo para correcciones puntuales).
    if (deltaHoras !== undefined) {
      const delta = Number(deltaHoras);
      if (!Number.isFinite(delta)) {
        return NextResponse.json(
          { error: "deltaHoras inválido" },
          { status: 400, headers: corsHeaders },
        );
      }
      const { data: nuevoTotal, error: rpcErr } = await supabaseAdmin.rpc(
        "incrementar_horas",
        { p_empleado_id: employeeId, p_delta: delta },
      );
      if (rpcErr) throw rpcErr;
      if (targetHours) {
        await supabaseAdmin
          .from("empleados")
          .update({ horas_totales_objetivo: targetHours })
          .eq("id", employeeId);
      }
      return NextResponse.json(
        { success: true, horas_acumuladas: nuevoTotal },
        { status: 200, headers: corsHeaders },
      );
    }

    const parsedHours = parseFloat(Number(horasAcumuladas).toFixed(2));
    const { data: employee, error } = await supabaseAdmin
      .from("empleados")
      .update({
        horas_acumuladas: parsedHours,
        ...(targetHours ? { horas_totales_objetivo: targetHours } : {}),
      })
      .eq("id", employeeId)
      .select("id, nombre, horas_acumuladas, horas_totales_objetivo")
      .single();

    if (error) throw error;

    return NextResponse.json(
      { success: true, employee },
      { status: 200, headers: corsHeaders },
    );
  } catch (err: any) {
    console.error("Error actualizando horas:", err);
    return NextResponse.json(
      { error: err.message || "Error del servidor" },
      { status: 500, headers: corsHeaders },
    );
  }
}

// Handler de Preflight CORS para peticiones desde la Extensión de Chrome
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
