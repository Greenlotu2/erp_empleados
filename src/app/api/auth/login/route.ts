import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import bcrypt from "bcryptjs";
import { generateToken } from "../../../../lib/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// --- Rate limiting contra fuerza bruta -------------------------------------
// Registra los intentos fallidos en `login_intentos` y bloquea (429) cuando
// una IP o un correo acumulan demasiados en la ventana de tiempo.
const VENTANA_MIN = 15;
const MAX_FALLOS = 10;

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // La extensión envía { email, password }, este fallback acepta ambos
    const emailInput = body.email || body.username;
    const passwordInput = body.password;

    if (!emailInput || !passwordInput) {
      return NextResponse.json(
        { error: "Correo/Usuario y contraseña requeridos" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cleanEmail = emailInput.trim().toLowerCase();
    const ip = getIp(req);
    const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

    // Registrar un intento fallido (IP + correo).
    const registrarFallo = () =>
      supabaseAdmin
        .from("login_intentos")
        .insert({ ip, email: cleanEmail, exito: false });

    // ¿Demasiados fallos recientes de esta IP o de este correo?
    const [{ count: fallosIp }, { count: fallosEmail }] = await Promise.all([
      supabaseAdmin
        .from("login_intentos")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("exito", false)
        .gt("ts", desde),
      supabaseAdmin
        .from("login_intentos")
        .select("id", { count: "exact", head: true })
        .eq("email", cleanEmail)
        .eq("exito", false)
        .gt("ts", desde),
    ]);

    if ((fallosIp ?? 0) >= MAX_FALLOS || (fallosEmail ?? 0) >= MAX_FALLOS) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.",
        },
        { status: 429, headers: corsHeaders },
      );
    }

    // 1. Buscar primero en la columna 'username' (donde se guarda el correo/usuario)
    let { data: empleado } = await supabaseAdmin
      .from("empleados")
      .select("*")
      .ilike("username", cleanEmail)
      .maybeSingle();

    // 2. Si no se encontró en 'username', intentar por la columna 'email' de forma segura
    if (!empleado) {
      try {
        const { data: empByEmail } = await supabaseAdmin
          .from("empleados")
          .select("*")
          .ilike("email", cleanEmail)
          .maybeSingle();

        if (empByEmail) {
          empleado = empByEmail;
        }
      } catch (e) {
        // Ignorar si la columna 'email' no existe en la base de datos
      }
    }

    if (!empleado) {
      await registrarFallo();
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401, headers: corsHeaders },
      );
    }

    // 3. Traer las credenciales desde la tabla aislada `empleados_auth`
    //    (la tabla `empleados` ya no guarda contraseñas).
    const { data: cred } = await supabaseAdmin
      .from("empleados_auth")
      .select("password_hash, password")
      .eq("empleado_id", empleado.id)
      .maybeSingle();

    let isPasswordValid = false;
    let needsPasswordMigration = false;

    if (cred?.password_hash) {
      isPasswordValid = await bcrypt.compare(passwordInput, cred.password_hash);
    } else if (cred?.password) {
      isPasswordValid = cred.password === passwordInput;
      if (isPasswordValid) {
        needsPasswordMigration = true;
      }
    }

    if (!isPasswordValid) {
      await registrarFallo();
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401, headers: corsHeaders },
      );
    }

    // Login correcto: limpiar los fallos de este correo y, de vez en cuando,
    // barrer registros viejos para que la tabla no crezca.
    await supabaseAdmin
      .from("login_intentos")
      .delete()
      .eq("email", cleanEmail)
      .eq("exito", false);
    if (Math.random() < 0.05) {
      await supabaseAdmin
        .from("login_intentos")
        .delete()
        .lt("ts", new Date(Date.now() - 24 * 3600_000).toISOString());
    }

    // 🔄 4. MIGRACIÓN AL VUELO: si autenticó por texto plano, hashea y borra el texto plano
    if (needsPasswordMigration) {
      const newHash = await bcrypt.hash(passwordInput, 10);
      await supabaseAdmin
        .from("empleados_auth")
        .upsert(
          { empleado_id: empleado.id, password_hash: newHash, password: null },
          { onConflict: "empleado_id" },
        );
    }

    // 🔑 5. Generar Token JWT firmado
    const token = generateToken({
      id: empleado.id,
      email: empleado.username || empleado.email || cleanEmail,
      rol: empleado.rol || "Practicante",
    });

    return NextResponse.json(
      {
        success: true,
        token,
        employee: {
          id: empleado.id,
          nombre: empleado.nombre,
          email: empleado.username || empleado.email || cleanEmail,
          rol: empleado.rol,
          horas_acumuladas: empleado.horas_acumuladas || 0,
          horas_totales_objetivo: empleado.horas_totales_objetivo,
          puntos_recompensa: empleado.puntos_recompensa || 0,
        },
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error interno del servidor", details: err.message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
