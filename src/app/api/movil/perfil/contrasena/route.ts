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
import { fijarContrasena, MIN_CONTRASENA } from "../../../../../lib/contrasenas";

// Cambiar la contraseña propia desde la PWA. Se guarda en los dos lugares donde
// vive (ver lib/contrasenas.ts) y, si algo falla, vuelve a la actual. Los
// intentos con la contraseña actual equivocada cuentan para el mismo bloqueo
// que el login.

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
  if (nueva.length < MIN_CONTRASENA) {
    return responder({ error: `La nueva contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.` }, 400);
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

    // 2) Guardar en los dos lugares (web y extensión/app); revierte si falla.
    const r = await fijarContrasena(usuario.id, nueva, actual);
    if (!r.ok) return responder({ error: r.error }, 400);

    return responder({ success: true }, 200);
  } catch (err: any) {
    return responder(
      { error: err.message || "No se pudo cambiar la contraseña." },
      500,
    );
  }
}

export const OPTIONS = opcionesMovil;
