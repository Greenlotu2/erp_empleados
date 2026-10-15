import { supabaseAdmin } from "./api-auth";
import { verifyAuthToken, type AuthenticatedUser } from "./auth";

// El JWT de la extensión dura 8 h y trae el rol con el que se inició sesión.
// Si en ese tiempo eliminan a la persona o le quitan el rol de administrador,
// el token seguiría siendo válido. Por eso, además de la firma, se consulta al
// empleado en la base: si ya no existe no hay sesión, y el rol que vale es el
// actual (no el que quedó grabado en el token).
export async function verificarTokenVigente(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const token = verifyAuthToken(req);
  if (!token?.id) return null;

  const { data: empleado, error } = await supabaseAdmin
    .from("empleados")
    .select("id, rol")
    .eq("id", token.id)
    .maybeSingle();
  if (error || !empleado) return null;

  return { ...token, rol: empleado.rol || "" };
}
