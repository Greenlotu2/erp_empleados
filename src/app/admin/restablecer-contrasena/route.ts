import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/api-auth";
import { fijarContrasena, MIN_CONTRASENA } from "../../../lib/contrasenas";
import { idsEquipo } from "../../../lib/movilAuth";
import { limpiarFallos } from "../../../lib/rateLimitLogin";

// Restablecer la contraseña de un integrante desde el Panel Principal (web),
// p. ej. cuando un trabajador la olvida. Quién puede:
//  - Gerencia: a cualquiera.
//  - Coordinador: solo a personas de su(s) área(s) (mismo alcance que la app).
//  - Trabajador: nadie.
// Solo con la sesión web (cookies de Supabase Auth). No pide la contraseña
// anterior; la nueva se guarda en los dos lugares (ver lib/contrasenas.ts) y
// se limpian los intentos fallidos para desbloquear a la persona.

const json = (cuerpo: object, status: number) => NextResponse.json(cuerpo, { status });

export async function POST(req: NextRequest) {
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll() {} } },
  );
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);

  const { data: quien } = await supabaseAdmin
    .from("empleados")
    .select("id, nivel, area")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quien || (quien.nivel !== "Gerencia" && quien.nivel !== "Coordinador")) {
    return json({ error: "Solo Gerencia y Coordinadores pueden restablecer contraseñas." }, 403);
  }

  const b = await req.json().catch(() => ({}));
  const empleadoId = String(b?.empleadoId || "");
  const nueva = String(b?.nueva || "");
  if (!empleadoId) return json({ error: "Falta el integrante." }, 400);
  if (nueva.length < MIN_CONTRASENA) {
    return json({ error: `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.` }, 400);
  }

  const equipo = await idsEquipo(quien);
  if (equipo && !equipo.includes(empleadoId)) {
    return json({ error: "Solo puedes restablecer contraseñas de personas de tu área." }, 403);
  }

  const { data: objetivo } = await supabaseAdmin
    .from("empleados")
    .select("id, username")
    .eq("id", empleadoId)
    .maybeSingle();
  if (!objetivo) return json({ error: "No encontramos a ese integrante." }, 404);

  try {
    const r = await fijarContrasena(empleadoId, nueva);
    if (!r.ok) return json({ error: r.error }, 400);
    if (objetivo.username) await limpiarFallos(String(objetivo.username).toLowerCase());
    return json({ success: true }, 200);
  } catch (err: any) {
    return json({ error: err.message || "No se pudo restablecer la contraseña." }, 500);
  }
}
