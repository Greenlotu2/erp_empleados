import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/api-auth";
import {
  corsMovil,
  opcionesMovil,
  verificarMovil,
} from "../../../../../lib/movilAuth";

// Foto de perfil. Bucket PÚBLICO `avatares` (ver SQL de la migración): la web
// muestra avatar_url tal cual en <img>, así que necesita una URL estable. El
// nombre del archivo lleva el id del empleado + marca de tiempo (no adivinable
// sin conocer el id). La app ya manda la imagen recortada/reducida.

const BUCKET = "avatares";
const MAX_BYTES = 2 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const responder = (cuerpo: object, status: number) =>
  NextResponse.json(cuerpo, { status, headers: corsMovil });

// Borra del bucket la foto anterior si era nuestra (no toca URLs externas).
async function borrarAnterior(url: string | null) {
  const marca = `/object/public/${BUCKET}/`;
  const i = url ? url.indexOf(marca) : -1;
  if (url && i !== -1) {
    await supabaseAdmin.storage.from(BUCKET).remove([url.slice(i + marca.length)]);
  }
}

export async function POST(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario } = auth;

  const b = await req.json().catch(() => ({}));
  const ext = TIPOS[b?.tipo];
  if (!ext || typeof b?.base64 !== "string") {
    return responder({ error: "La foto debe ser JPG, PNG o WebP." }, 400);
  }
  const buffer = Buffer.from(b.base64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return responder({ error: "La foto pesa más de 2 MB." }, 400);
  }

  try {
    const { data: actual } = await supabaseAdmin
      .from("empleados")
      .select("avatar_url")
      .eq("id", usuario.id)
      .single();

    const ruta = `${usuario.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(ruta, buffer, { contentType: b.tipo, upsert: false });
    if (upErr) throw upErr;

    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
    const { error } = await supabaseAdmin
      .from("empleados")
      .update({ avatar_url: url })
      .eq("id", usuario.id);
    if (error) throw error;

    await borrarAnterior(actual?.avatar_url ?? null);
    return responder({ avatar_url: url }, 200);
  } catch (err: any) {
    return responder({ error: err.message || "No se pudo subir la foto." }, 500);
  }
}

export async function DELETE(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario } = auth;

  try {
    const { data: actual } = await supabaseAdmin
      .from("empleados")
      .select("avatar_url")
      .eq("id", usuario.id)
      .single();
    const { error } = await supabaseAdmin
      .from("empleados")
      .update({ avatar_url: null })
      .eq("id", usuario.id);
    if (error) throw error;
    await borrarAnterior(actual?.avatar_url ?? null);
    return responder({ avatar_url: null }, 200);
  } catch (err: any) {
    return responder({ error: err.message || "No se pudo quitar la foto." }, 500);
  }
}

export const OPTIONS = opcionesMovil;
