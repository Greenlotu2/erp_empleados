import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import {
  corsMovil,
  opcionesMovil,
  verificarMovil,
} from "../../../../lib/movilAuth";
import { REUNION_ACTIVA } from "../../../../lib/cronAuth";

// Avisos de la PWA, siempre dentro del alcance del usuario:
//  - porRevisar: tareas "En Revisión" (mismo criterio que la pantalla Tareas),
//    con la fecha del envío más reciente.
//  - porVencer: tareas sin completar vencidas o que vencen en ≤ 2 días.
//  - nuevas: tareas asignadas en los últimos 3 días que siguen sin completarse.
//  - reuniones: reuniones programadas de los próximos 7 días.
//  - recientes: aprobaciones/correcciones de los últimos 3 días.
// No hay estado de "leído": cada sección desaparece sola al atenderse.

const DIA = 24 * 3600 * 1000;

// "YYYY-MM-DD" en hora de México (UTC-6 fijo) a `dias` de hoy.
function fechaMx(dias = 0) {
  return new Date(Date.now() - 6 * 3600 * 1000 + dias * DIA)
    .toISOString()
    .slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario, equipoIds } = auth;

  // Filtra una consulta a las personas del alcance (Gerencia: sin filtro).
  const enEquipo = (q: any, col: string) => (equipoIds ? q.in(col, equipoIds) : q);

  try {
    const ahora = new Date();
    const [enRevision, tareas, reuniones, decididas, personas, nuevas]: { data: any[] | null }[] = await Promise.all([
      enEquipo(
        supabaseAdmin
          .from("tareas")
          .select("id, titulo, empleado_id")
          .eq("estado", "En Revisión"),
        "empleado_id",
      ),
      enEquipo(
        supabaseAdmin
          .from("tareas")
          .select("id, titulo, estado, fecha_limite, porcentaje_avance, empleado_id")
          .not("fecha_limite", "is", null)
          .lte("fecha_limite", fechaMx(2))
          .not("estado", "in", '("Completada","En Revisión")'),
        "empleado_id",
      ),
      supabaseAdmin
        .from("reuniones")
        .select("id, titulo, fecha_inicio, link, lugar, empleado_id, creado_por, tarea_id")
        .in("estado", REUNION_ACTIVA)
        .gte("fecha_inicio", ahora.toISOString())
        .lte("fecha_inicio", new Date(ahora.getTime() + 7 * DIA).toISOString())
        .order("fecha_inicio"),
      enEquipo(
        supabaseAdmin
          .from("tareas")
          .select("id, titulo, empleado_id, revision_resultado, revision_comentario, revision_por, revision_fecha")
          .gte("revision_fecha", new Date(ahora.getTime() - 3 * DIA).toISOString())
          .order("revision_fecha", { ascending: false }),
        "empleado_id",
      ),
      enEquipo(
        supabaseAdmin.from("empleados").select("id, nombre, color, avatar_url"),
        "id",
      ),
      enEquipo(
        supabaseAdmin
          .from("tareas")
          .select("id, titulo, empleado_id, fecha_limite, created_at")
          .gte("created_at", new Date(ahora.getTime() - 3 * DIA).toISOString())
          .neq("estado", "Completada")
          .order("created_at", { ascending: false }),
        "empleado_id",
      ),
    ]);

    // Fecha del envío a revisión más reciente de cada tarea en revisión.
    const envio: Record<number, string> = {};
    const idsRevision = (enRevision.data || []).map((t) => t.id);
    if (idsRevision.length > 0) {
      const { data } = await supabaseAdmin
        .from("revisiones")
        .select("tarea_id, fecha_solicitud")
        .in("tarea_id", idsRevision);
      (data || []).forEach((r) => {
        if (!envio[r.tarea_id] || r.fecha_solicitud > envio[r.tarea_id]) {
          envio[r.tarea_id] = r.fecha_solicitud;
        }
      });
    }

    // Una reunión con varios participantes son varias filas: se agrupa por
    // título + hora y se queda si participa alguien del equipo (o la creó él).
    const visibles = new Set(equipoIds || []);
    const reunionesUnicas = new Map<string, any>();
    (reuniones.data || []).forEach((r) => {
      // Sin participante = reunión de todo el equipo: la ven todos.
      const propia =
        !equipoIds || !r.empleado_id || visibles.has(r.empleado_id) || r.creado_por === usuario.id;
      if (!propia) return;
      const clave = `${r.titulo}|${r.fecha_inicio}`;
      const previa = reunionesUnicas.get(clave);
      const nuevo = previa || { ...r, participantes: new Set<string>() };
      if (r.empleado_id) nuevo.participantes.add(r.empleado_id);
      reunionesUnicas.set(clave, nuevo);
    });

    return NextResponse.json(
      {
        hoy: fechaMx(0),
        personas: personas.data || [],
        porRevisar: (enRevision.data || [])
          .map((t) => ({
            tareaId: t.id,
            empleadoId: t.empleado_id,
            fecha: envio[t.id] || null,
            titulo: t.titulo,
          }))
          .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")),
        nuevas: (nuevas.data || [])
          // Las que ya salen en "Por vencer" no se repiten.
          .filter((t) => !(tareas.data || []).some((v) => v.id === t.id))
          .map((t) => ({
            tareaId: t.id,
            empleadoId: t.empleado_id,
            titulo: t.titulo,
            fechaLimite: t.fecha_limite,
            creada: t.created_at,
          })),
        porVencer: (tareas.data || [])
          .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
          .map((t) => ({
            tareaId: t.id,
            empleadoId: t.empleado_id,
            titulo: t.titulo,
            fechaLimite: t.fecha_limite,
            avance: t.porcentaje_avance ?? 0,
          })),
        reuniones: Array.from(reunionesUnicas.values()).map((r) => ({
          id: r.id,
          titulo: r.titulo,
          fecha: r.fecha_inicio,
          link: r.link,
          lugar: r.lugar,
          tareaId: r.tarea_id,
          participantes: Array.from(r.participantes),
        })),
        recientes: (decididas.data || [])
          .filter((t) => t.revision_resultado)
          .map((t) => ({
            tareaId: t.id,
            empleadoId: t.empleado_id,
            titulo: t.titulo,
            aprobada: t.revision_resultado === "Aprobado",
            comentario: t.revision_comentario,
            por: t.revision_por,
            fecha: t.revision_fecha,
          })),
      },
      { status: 200, headers: corsMovil },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "No se pudieron cargar los avisos" },
      { status: 500, headers: corsMovil },
    );
  }
}

export const OPTIONS = opcionesMovil;
