import { supabaseAdmin } from "./api-auth";

// Limitador de fuerza bruta compartido por las dos puertas de entrada:
// `/api/auth/login` (extensión, JWT propio) y `/api/auth/web-login` (dashboard,
// Supabase Auth). Los intentos fallidos se guardan en `login_intentos`, que solo
// el service role puede tocar.
//
// Se cuenta por IP y por correo: la IP frena a quien barre muchas cuentas desde
// un mismo lugar, el correo frena a quien ataca una cuenta desde varias IPs.

export const VENTANA_MIN = 15;
export const MAX_FALLOS = 10;

export function getIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

// true si esta IP o este correo ya superaron el máximo de fallos en la ventana.
export async function estaBloqueado(
  ip: string,
  email: string,
): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

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
      .eq("email", email)
      .eq("exito", false)
      .gt("ts", desde),
  ]);

  return (fallosIp ?? 0) >= MAX_FALLOS || (fallosEmail ?? 0) >= MAX_FALLOS;
}

export async function registrarFallo(ip: string, email: string) {
  await supabaseAdmin
    .from("login_intentos")
    .insert({ ip, email, exito: false });
}

// Tras un login correcto: limpiar los fallos de ese correo y, de vez en cuando,
// barrer lo viejo para que la tabla no crezca sin control.
export async function limpiarFallos(email: string) {
  await supabaseAdmin
    .from("login_intentos")
    .delete()
    .eq("email", email)
    .eq("exito", false);

  if (Math.random() < 0.05) {
    await supabaseAdmin
      .from("login_intentos")
      .delete()
      .lt("ts", new Date(Date.now() - 24 * 3600_000).toISOString());
  }
}

export const MENSAJE_BLOQUEO =
  "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.";
