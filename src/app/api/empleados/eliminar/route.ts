import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthToken } from "../../../../lib/auth";
import { empleadoDeSesion, esAdminWeb } from "../../../../lib/adminWeb";
import { DOC_BUCKET, rutaEnBucket } from "../../../../lib/rutaBucket";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AVATARES = "avatares";

// Rutas de los archivos que son del empleado: documentos (INE, contratos…),
// su foto y las evidencias/adjuntos de sus tareas. Hay que juntarlas ANTES de
// borrar las filas, porque las filas son las que guardan la ruta.
async function archivosDelEmpleado(empleadoId: string, avatarUrl: string | null) {
  const docs = new Set<string>();

  const { data: tareasPropias } = await supabaseAdmin
    .from("tareas")
    .select("id")
    .eq("empleado_id", empleadoId);
  const idsTareas = (tareasPropias || []).map((t: any) => t.id);

  const consultas = await Promise.all([
    supabaseAdmin.from("documentos_legales").select("archivo_path").eq("empleado_id", empleadoId),
    supabaseAdmin.from("revisiones").select("evidencia_url").eq("empleado_id", empleadoId),
    supabaseAdmin.from("notificaciones").select("evidencia_url").eq("empleado_id", empleadoId),
    idsTareas.length
      ? supabaseAdmin.from("tarea_minutas").select("adjunto_url").in("tarea_id", idsTareas)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  for (const { data } of consultas) {
    for (const fila of (data || []) as any[]) {
      const ruta = rutaEnBucket(fila.archivo_path ?? fila.evidencia_url ?? fila.adjunto_url);
      if (ruta && !/^https?:/i.test(ruta)) docs.add(ruta);
    }
  }

  // Carpeta de evidencias de cada tarea suya (evidencias/<idTarea>/...).
  for (const id of idsTareas) {
    const { data } = await supabaseAdmin.storage.from(DOC_BUCKET).list(`evidencias/${id}`, { limit: 1000 });
    for (const f of data || []) if (f.id) docs.add(`evidencias/${id}/${f.name}`);
  }

  // Fotos de perfil: carpeta <empleadoId>/ en el bucket público.
  const avatares = new Set<string>();
  const { data: fotos } = await supabaseAdmin.storage.from(AVATARES).list(empleadoId, { limit: 1000 });
  for (const f of fotos || []) if (f.id) avatares.add(`${empleadoId}/${f.name}`);
  const marca = `/object/public/${AVATARES}/`;
  if (avatarUrl && avatarUrl.includes(marca)) {
    avatares.add(decodeURIComponent(avatarUrl.slice(avatarUrl.indexOf(marca) + marca.length).split("?")[0]));
  }

  return { docs: Array.from(docs), avatares: Array.from(avatares) };
}

// Quita al empleado de las listas de colaboradores (columna uuid[]); si no,
// su id se queda en tareas y avisos de otras personas.
async function quitarDeColaboradores(empleadoId: string) {
  for (const tabla of ["tareas", "notificaciones"]) {
    const { data } = await supabaseAdmin
      .from(tabla)
      .select("id, colaboradores_ids")
      .contains("colaboradores_ids", [empleadoId]);
    for (const fila of (data || []) as any[]) {
      const resto = (fila.colaboradores_ids as string[]).filter((c) => c !== empleadoId);
      await supabaseAdmin
        .from(tabla)
        .update({ colaboradores_ids: resto.length ? resto : null })
        .eq("id", fila.id);
    }
  }
}

// Comprueba que quien llama sea administrador (por JWT propio o por sesión SSR).
async function esAdmin(request: NextRequest): Promise<boolean> {
  const jwtCaller = verifyAuthToken(request);
  const rolJwt = jwtCaller?.rol?.toLowerCase();
  if (rolJwt === "administrador" || rolJwt === "admin") return true;

  const supabaseSsr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabaseSsr.auth.getUser();
  if (!user) return false;

  // Solo por user_id (ver lib/adminWeb.ts).
  return esAdminWeb(await empleadoDeSesion(user.id));
}

export async function POST(request: NextRequest) {
  try {
    if (!(await esAdmin(request))) {
      return NextResponse.json(
        { error: "Acceso denegado: se requieren permisos de Administrador" },
        { status: 403 },
      );
    }

    const { empleadoId } = await request.json();
    if (!empleadoId) {
      return NextResponse.json({ error: "Falta empleadoId" }, { status: 400 });
    }

    const { data: empleado, error: findErr } = await supabaseAdmin
      .from("empleados")
      .select("id, nombre, username, user_id, avatar_url")
      .eq("id", empleadoId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!empleado) {
      return NextResponse.json(
        { error: "El integrante no existe" },
        { status: 404 },
      );
    }

    // 0. Archivos a borrar del Storage (se juntan antes de borrar las filas).
    const archivos = await archivosDelEmpleado(empleadoId, empleado.avatar_url);

    // 1. Referencias de AUTORÍA -> se conservan las filas, solo se limpia el vínculo.
    //    (Redundante si las FK ya tienen ON DELETE SET NULL, pero deja la ruta
    //     funcionando aunque el SQL no se haya corrido todavía.)
    await Promise.all([
      supabaseAdmin
        .from("tareas")
        .update({ asignada_por: null })
        .eq("asignada_por", empleadoId),
      supabaseAdmin
        .from("reuniones")
        .update({ creado_por: null })
        .eq("creado_por", empleadoId),
      supabaseAdmin
        .from("tarea_minutas")
        .update({ autor_id: null })
        .eq("autor_id", empleadoId),
      quitarDeColaboradores(empleadoId),
    ]);

    // 2. Datos PROPIOS del empleado -> se borran (idem: redundante con ON DELETE CASCADE).
    const tablasHijas = [
      "raya_detalle",
      "raya_plantilla",
      "revisiones",
      "notificaciones",
      "recompensa_historial",
      "reuniones",
      "documentos_legales",
      "contratos",
      "tareas",
    ];
    for (const t of tablasHijas) {
      const { error } = await supabaseAdmin
        .from(t)
        .delete()
        .eq("empleado_id", empleadoId);
      if (error) {
        console.error(`Error limpiando ${t}:`, error.message);
        return NextResponse.json(
          { error: `No se pudo limpiar ${t}: ${error.message}` },
          { status: 500 },
        );
      }
    }

    // 3. El empleado.
    const { error: delErr } = await supabaseAdmin
      .from("empleados")
      .delete()
      .eq("id", empleadoId);
    if (delErr) {
      return NextResponse.json(
        { error: `No se pudo eliminar al integrante: ${delErr.message}` },
        { status: 500 },
      );
    }

    // 4. Cuenta de Supabase Auth (si tiene) — sin esto quedaba un usuario huérfano
    //    que aún podía iniciar sesión.
    const pendientes: string[] = [];
    if (empleado.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(
        empleado.user_id,
      );
      if (authErr) {
        console.error("No se pudo borrar la cuenta de Auth:", authErr.message);
        pendientes.push("su cuenta de acceso");
      }
    }

    // 4.5 Archivos (INE, contratos, evidencias, foto). Antes se quedaban en el
    //     Storage aunque la persona ya no existiera.
    if (archivos.docs.length) {
      const { error } = await supabaseAdmin.storage.from(DOC_BUCKET).remove(archivos.docs);
      if (error) {
        console.error("No se pudieron borrar sus documentos:", error.message);
        pendientes.push("sus documentos");
      }
    }
    if (archivos.avatares.length) {
      const { error } = await supabaseAdmin.storage.from(AVATARES).remove(archivos.avatares);
      if (error) console.error("No se pudo borrar su foto:", error.message);
    }

    // 5. Intentos de login registrados por su correo (no tiene FK).
    if (empleado.username) {
      await supabaseAdmin
        .from("login_intentos")
        .delete()
        .eq("email", empleado.username.toLowerCase());
    }

    return NextResponse.json({
      success: true,
      aviso: pendientes.length
        ? `Se eliminó al integrante, pero no se pudo borrar ${pendientes.join(" ni ")}. Avísale a soporte.`
        : null,
    });
  } catch (err: any) {
    console.error("Error eliminando integrante:", err);
    return NextResponse.json(
      { error: err.message || "Error del servidor" },
      { status: 500 },
    );
  }
}
