import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthToken } from "../../../../lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Comprueba que quien llama sea administrador (por JWT propio o por sesión SSR).
async function esAdmin(request: NextRequest): Promise<boolean> {
  const jwtCaller = verifyAuthToken(request);
  const rolJwt = jwtCaller?.rol?.toLowerCase();
  if (rolJwt === "administrador" || rolJwt === "admin") return true;

  const supabaseSsr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabaseSsr.auth.getUser();
  if (!user) return false;

  const { data: emp } = await supabaseAdmin
    .from("empleados")
    .select("rol")
    .or(`user_id.eq.${user.id},username.ilike.${user.email}`)
    .maybeSingle();

  const rol = emp?.rol?.toLowerCase();
  return rol === "admin" || rol === "administrador";
}

export async function POST(request: NextRequest) {
  try {
    if (!(await esAdmin(request))) {
      return NextResponse.json(
        { error: "Acceso denegado: se requieren permisos de Administrador" },
        { status: 403 },
      );
    }

    const { empleadoId } = await request.json();
    if (!empleadoId) {
      return NextResponse.json({ error: "Falta empleadoId" }, { status: 400 });
    }

    const { data: empleado, error: findErr } = await supabaseAdmin
      .from("empleados")
      .select("id, nombre, username, user_id")
      .eq("id", empleadoId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!empleado) {
      return NextResponse.json(
        { error: "El integrante no existe" },
        { status: 404 },
      );
    }

    // 1. Referencias de AUTORÍA -> se conservan las filas, solo se limpia el vínculo.
    //    (Redundante si las FK ya tienen ON DELETE SET NULL, pero deja la ruta
    //     funcionando aunque el SQL no se haya corrido todavía.)
    await Promise.all([
      supabaseAdmin
        .from("tareas")
        .update({ asignada_por: null })
        .eq("asignada_por", empleadoId),
      supabaseAdmin
        .from("reuniones")
        .update({ creado_por: null })
        .eq("creado_por", empleadoId),
      supabaseAdmin
        .from("tarea_minutas")
        .update({ autor_id: null })
        .eq("autor_id", empleadoId),
    ]);

    // 2. Datos PROPIOS del empleado -> se borran (idem: redundante con ON DELETE CASCADE).
    const tablasHijas = [
      "raya_detalle",
      "raya_plantilla",
      "revisiones",
      "notificaciones",
      "recompensa_historial",
      "reuniones",
      "documentos_legales",
      "contratos",
      "tareas",
    ];
    for (const t of tablasHijas) {
      const { error } = await supabaseAdmin
        .from(t)
        .delete()
        .eq("empleado_id", empleadoId);
      if (error) {
        console.error(`Error limpiando ${t}:`, error.message);
        return NextResponse.json(
          { error: `No se pudo limpiar ${t}: ${error.message}` },
          { status: 500 },
        );
      }
    }

    // 3. El empleado.
    const { error: delErr } = await supabaseAdmin
      .from("empleados")
      .delete()
      .eq("id", empleadoId);
    if (delErr) {
      return NextResponse.json(
        { error: `No se pudo eliminar al integrante: ${delErr.message}` },
        { status: 500 },
      );
    }

    // 4. Cuenta de Supabase Auth (si tiene) — sin esto quedaba un usuario huérfano
    //    que aún podía iniciar sesión.
    if (empleado.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(
        empleado.user_id,
      );
      if (authErr) {
        console.error("No se pudo borrar la cuenta de Auth:", authErr.message);
      }
    }

    // 5. Intentos de login registrados por su correo (no tiene FK).
    if (empleado.username) {
      await supabaseAdmin
        .from("login_intentos")
        .delete()
        .eq("email", empleado.username.toLowerCase());
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error eliminando integrante:", err);
    return NextResponse.json(
      { error: err.message || "Error del servidor" },
      { status: 500 },
    );
  }
}
