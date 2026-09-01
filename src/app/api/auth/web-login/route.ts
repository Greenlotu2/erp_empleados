import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import {
  getIp,
  estaBloqueado,
  registrarFallo,
  limpiarFallos,
  MENSAJE_BLOQUEO,
} from "../../../../lib/rateLimitLogin";

// Login del dashboard web. Antes el navegador llamaba directo a
// `supabase.auth.signInWithPassword`, así que no había forma de limitar los
// intentos: el rate limit de Supabase Auth no frena el grant de contraseña
// (probado: 27 intentos seguidos sin un solo 429). Pasando por esta ruta se
// aplica el mismo limitador que ya protege a la extensión.
//
// La sesión se sigue guardando en cookies (mismo mecanismo de @supabase/ssr que
// lee `proxy.ts`), solo que las escribe el servidor en vez del navegador.

export async function POST(req: NextRequest) {
  try {
    const { userInput, password } = await req.json();

    if (!userInput || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña requeridos" },
        { status: 400 },
      );
    }

    const cleanInput = String(userInput).trim().toLowerCase();
    const ip = getIp(req);

    if (await estaBloqueado(ip, cleanInput)) {
      return NextResponse.json({ error: MENSAJE_BLOQUEO }, { status: 429 });
    }

    // Resolver usuario -> correo real (algunos entran con el username corto).
    let targetEmail = cleanInput;
    const { data: resuelto } = await supabaseAdmin.rpc("resolver_email_login", {
      p_input: cleanInput,
    });
    if (typeof resuelto === "string" && resuelto.includes("@")) {
      targetEmail = resuelto;
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

    if (authError || !authData.user) {
      await registrarFallo(ip, cleanInput);
      const msg = (authError?.message || "").toLowerCase();
      if (authError?.status === 429 || msg.includes("rate limit")) {
        return NextResponse.json({ error: MENSAJE_BLOQUEO }, { status: 429 });
      }
      if (msg.includes("not confirmed")) {
        return NextResponse.json(
          {
            error:
              "La cuenta aún no está confirmada. Contacta al administrador.",
          },
          { status: 401 },
        );
      }
      return NextResponse.json(
        {
          error:
            "Credenciales inválidas. Revisa tu usuario/correo y contraseña.",
        },
        { status: 401 },
      );
    }

    // Solo administradores usan el dashboard web.
    const { data: empleado } = await supabaseAdmin
      .from("empleados")
      .select("rol")
      .or(`user_id.eq.${authData.user.id},username.ilike.${targetEmail}`)
      .maybeSingle();

    const rol = (empleado?.rol || "").toLowerCase().trim();
    if (rol !== "admin" && rol !== "administrador") {
      // Credenciales correctas pero sin permiso: cerrar la sesión recién abierta
      // para no dejar cookies válidas. No cuenta como intento fallido.
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "Acceso denegado: esta plataforma web es exclusiva para Administradores.",
        },
        { status: 403 },
      );
    }

    await limpiarFallos(cleanInput);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error en web-login:", err);
    return NextResponse.json(
      { error: "Error del servidor al iniciar sesión" },
      { status: 500 },
    );
  }
}
