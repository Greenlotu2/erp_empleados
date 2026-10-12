import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../../../../lib/api-auth";
import {
  corsMovil,
  opcionesMovil,
  verificarMovil,
} from "../../../../../lib/movilAuth";
import {
  estaBloqueado,
  getIp,
  limpiarFallos,
  MENSAJE_BLOQUEO,
  registrarFallo,
} from "../../../../../lib/rateLimitLogin";

// Cambiar la contraseña propia desde la PWA. La contraseña vive en DOS lugares
// y ambos deben quedar iguales:
//  - Supabase Auth (empleados.user_id): login de la web /login.
//  - empleados_auth.password_hash (bcrypt): login de la extensión y de la app.
// Se cambia primero Supabase Auth (que aplica su propia política de
// contraseñas); si luego falla empleados_auth, se regresa Supabase Auth a la
// contraseña actual para no dejarlas desincronizadas. Los intentos con la
// contraseña actual equivocada cuentan para el mismo bloqueo que el login.

const MIN = 8;

const responder = (cuerpo: object, status: number) =>
  NextResponse.json(cuerpo, { status, headers: corsMovil });

export async function POST(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario } = auth;

  const b = await req.json().catch(() => ({}));
  const actual = String(b?.actual || "");
  const nueva = String(b?.nueva || "");

  if (!actual || !nueva) {
    return responder({ error: "Escribe tu contraseña actual y la nueva." }, 400);
  }
  if (nueva.length < MIN) {
    return responder({ error: `La nueva contraseña debe tener al menos ${MIN} caracteres.` }, 400);
  }
  if (nueva === actual) {
    return responder({ error: "La nueva contraseña debe ser distinta de la actual." }, 400);
  }

  try {
    const { data: emp } = await supabaseAdmin
      .from("empleados")
      .select("id, user_id, username")
      .eq("id", usuario.id)
      .single();
    const correo = String(emp?.username || usuario.id).toLowerCase();
    const ip = getIp(req);

    if (await estaBloqueado(ip, correo)) return responder({ error: MENSAJE_BLOQUEO }, 429);

    // 1) Verificar la contraseña actual (misma regla que /api/auth/login).
    const { data: cred } = await supabaseAdmin
      .from("empleados_auth")
      .select("password_hash, password")
      .eq("empleado_id", usuario.id)
      .maybeSingle();
    const correcta = cred?.password_hash
      ? await bcrypt.compare(actual, cred.password_hash)
      : Boolean(cred?.password) && cred?.password === actual;
    if (!correcta) {
      await registrarFallo(ip, correo);
      return responder({ error: "La contraseña actual no es correcta." }, 400);
    }
    await limpiarFallos(correo);

    // 2) Supabase Auth (login web).
    if (emp?.user_id) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.user_id, {
        password: nueva,
      });
      if (error) {
        return responder(
          { error: `No se pudo cambiar la contraseña: ${error.message}` },
          400,
        );
      }
    }

    // 3) empleados_auth (extensión y app). Si falla, se revierte el paso 2.
    const { error: errHash } = await supabaseAdmin.from("empleados_auth").upsert(
      {
        empleado_id: usuario.id,
        password_hash: await bcrypt.hash(nueva, 10),
        password: null,
      },
      { onConflict: "empleado_id" },
    );
    if (errHash) {
      if (emp?.user_id) {
        await supabaseAdmin.auth.admin.updateUserById(emp.user_id, { password: actual });
      }
      throw errHash;
    }

    return responder({ success: true }, 200);
  } catch (err: any) {
    return responder(
      { error: err.message || "No se pudo cambiar la contraseña." },
      500,
    );
  }
}

export const OPTIONS = opcionesMovil;
