import { NextResponse } from "next/server";
import { supabaseAdmin } from "./api-auth";
import { verifyAuthToken } from "./auth";

// Autorización de la API de la PWA móvil (/api/movil/*). La app es solo para
// Gerencia y Coordinadores; el alcance de lo que ve cada uno se decide aquí,
// en el servidor, nunca en el navegador:
//  - Gerencia: todo el equipo.
//  - Coordinador: las personas que comparten al menos un área con él
//    (`empleados.area` es text[]), más él mismo.

export const NIVELES_MOVIL = ["Gerencia", "Coordinador"];

export const corsMovil = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export interface UsuarioMovil {
  id: string;
  nombre: string;
  nivel: string;
  area: string[];
}

export type ResultadoMovil =
  | { ok: true; usuario: UsuarioMovil; equipoIds: string[] | null }
  | { ok: false; respuesta: NextResponse };

const rechazar = (error: string, status: number): ResultadoMovil => ({
  ok: false,
  respuesta: NextResponse.json({ error }, { status, headers: corsMovil }),
});

// `equipoIds` = ids de empleados que este usuario puede ver; `null` = todos.
export async function verificarMovil(req: Request): Promise<ResultadoMovil> {
  const token = verifyAuthToken(req);
  if (!token) return rechazar("Sesión no válida o expirada", 401);

  const { data: emp } = await supabaseAdmin
    .from("empleados")
    .select("id, nombre, nivel, area")
    .eq("id", token.id)
    .maybeSingle();

  if (!emp) return rechazar("Sesión no válida o expirada", 401);
  if (!NIVELES_MOVIL.includes(emp.nivel)) {
    return rechazar("La app móvil es solo para coordinadores y gerencia.", 403);
  }

  const usuario: UsuarioMovil = {
    id: emp.id,
    nombre: emp.nombre,
    nivel: emp.nivel,
    area: emp.area || [],
  };

  return { ok: true, usuario, equipoIds: await idsEquipo(usuario) };
}

// Ids de empleados que puede ver alguien de Gerencia/Coordinación; null = todos.
// Lo usan la API de la app y los avisos programados (resumen diario, etc.).
export async function idsEquipo(u: {
  id: string;
  nivel: string;
  area: string[] | null;
}): Promise<string[] | null> {
  if (u.nivel === "Gerencia") return null;
  if (!u.area || u.area.length === 0) return [u.id];
  const { data: companeros } = await supabaseAdmin
    .from("empleados")
    .select("id")
    .overlaps("area", u.area);
  return Array.from(new Set([u.id, ...(companeros || []).map((c) => c.id)]));
}

export function opcionesMovil() {
  return new NextResponse(null, { status: 200, headers: corsMovil });
}
