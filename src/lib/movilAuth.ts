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
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

  if (usuario.nivel === "Gerencia") {
    return { ok: true, usuario, equipoIds: null };
  }

  let equipoIds: string[] = [usuario.id];
  if (usuario.area.length > 0) {
    const { data: companeros } = await supabaseAdmin
      .from("empleados")
      .select("id")
      .overlaps("area", usuario.area);
    equipoIds = Array.from(
      new Set([usuario.id, ...(companeros || []).map((c) => c.id)]),
    );
  }

  return { ok: true, usuario, equipoIds };
}

export function opcionesMovil() {
  return new NextResponse(null, { status: 200, headers: corsMovil });
}
