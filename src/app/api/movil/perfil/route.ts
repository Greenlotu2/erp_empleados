import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import {
  corsMovil,
  opcionesMovil,
  verificarMovil,
} from "../../../../lib/movilAuth";

// Perfil propio en la PWA. Los DATOS PERSONALES los edita la propia persona;
// los de la EMPRESA (rol, nivel, área, especialidad, usuario) solo se leen
// aquí — los cambia el administrador desde la web.

const CAMPOS =
  "id, nombre, username, rol, nivel, area, especialidad, color, avatar_url, celular, fecha_nacimiento, correo_personal, emergencia_nombre, emergencia_telefono";

const responder = (cuerpo: object, status: number) =>
  NextResponse.json(cuerpo, { status, headers: corsMovil });

export async function GET(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario, equipoIds } = auth;

  try {
    const [perfil, equipo, propias] = await Promise.all([
      supabaseAdmin.from("empleados").select(CAMPOS).eq("id", usuario.id).single(),
      equipoIds
        ? Promise.resolve({ count: equipoIds.length - 1 })
        : supabaseAdmin.from("empleados").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("tareas")
        .select("id", { count: "exact", head: true })
        .eq("empleado_id", usuario.id)
        .neq("estado", "Completada"),
    ]);
    if (perfil.error) throw perfil.error;

    return responder(
      {
        perfil: perfil.data,
        // Gerencia: todos menos él; coordinador: su(s) área(s) menos él.
        personasACargo: Math.max(0, (equipo.count ?? 1) - (equipoIds ? 0 : 1)),
        tareasPropias: propias.count ?? 0,
      },
      200,
    );
  } catch (err: any) {
    return responder({ error: err.message || "No se pudo cargar tu perfil" }, 500);
  }
}

const limpiar = (v: unknown, max: number) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const soloTelefono = (v: unknown) => {
  const s = limpiar(v, 25);
  if (!s) return null;
  return /^[+\d][\d\s()-]{6,}$/.test(s) ? s : undefined; // undefined = inválido
};

export async function PATCH(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario } = auth;

  const b = await req.json().catch(() => ({}));

  const nombre = limpiar(b?.nombre, 120);
  const celular = soloTelefono(b?.celular);
  const emergenciaTel = soloTelefono(b?.emergencia_telefono);
  const correo = limpiar(b?.correo_personal, 120);
  const nacimiento = limpiar(b?.fecha_nacimiento, 10);
  const color = limpiar(b?.color, 7);

  if (!nombre) return responder({ error: "El nombre no puede quedar vacío." }, 400);
  if (celular === undefined) return responder({ error: "Revisa el número de celular." }, 400);
  if (emergenciaTel === undefined) {
    return responder({ error: "Revisa el teléfono del contacto de emergencia." }, 400);
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return responder({ error: "Revisa el correo personal." }, 400);
  }
  if (nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) {
    return responder({ error: "Revisa la fecha de nacimiento." }, 400);
  }
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return responder({ error: "Color no válido." }, 400);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("empleados")
      .update({
        nombre,
        celular,
        fecha_nacimiento: nacimiento,
        correo_personal: correo,
        emergencia_nombre: limpiar(b?.emergencia_nombre, 120),
        emergencia_telefono: emergenciaTel,
        ...(color ? { color } : {}),
      })
      .eq("id", usuario.id)
      .select(CAMPOS)
      .single();
    if (error) throw error;
    return responder({ perfil: data }, 200);
  } catch (err: any) {
    return responder({ error: err.message || "No se pudieron guardar los cambios" }, 500);
  }
}

export const OPTIONS = opcionesMovil;
