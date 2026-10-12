import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import { esCronAutorizado, REUNION_ACTIVA } from "../../../../lib/cronAuth";
import { enviarPush, primeraVez, revisoresDe } from "../../../../lib/push";

// Recordatorio de reuniones que empiezan en los próximos 30 minutos. Debe
// llamarse seguido (cada 10 min). Vercel Hobby solo permite crons diarios, así
// que este se dispara desde un cron externo (p. ej. cron-job.org) con
// "Authorization: Bearer <CRON_SECRET>". `push_enviados` evita repetirlo.
// Le llega a Gerencia/Coordinación del equipo de los participantes, y a los
// propios participantes si también usan la app.

const VENTANA_MIN = 30;

export async function GET(req: Request) {
  if (!esCronAutorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = new Date();
  const limite = new Date(ahora.getTime() + VENTANA_MIN * 60 * 1000);
  const { data: filas } = await supabaseAdmin
    .from("reuniones")
    .select("titulo, fecha_inicio, empleado_id, creado_por, link, tarea_id")
    .in("estado", REUNION_ACTIVA)
    .gte("fecha_inicio", ahora.toISOString())
    .lte("fecha_inicio", limite.toISOString());

  // Una reunión con varios participantes son varias filas.
  // empleado_id vacío = reunión para todo el equipo ("Todos" en la web).
  const reuniones = new Map<string, { titulo: string; inicio: string; personas: Set<string>; todos: boolean; creador: string | null }>();
  (filas || []).forEach((r) => {
    const clave = `${r.titulo}|${r.fecha_inicio}`;
    const previa = reuniones.get(clave) || {
      titulo: r.titulo,
      inicio: r.fecha_inicio,
      personas: new Set<string>(),
      todos: false,
      creador: r.creado_por,
    };
    if (r.empleado_id) previa.personas.add(r.empleado_id);
    else previa.todos = true;
    reuniones.set(clave, previa);
  });

  // Para reuniones de todo el equipo: toda Gerencia y Coordinación.
  const { data: mandos } = await supabaseAdmin
    .from("empleados")
    .select("id")
    .in("nivel", ["Gerencia", "Coordinador"]);

  let enviadas = 0;
  for (const [clave, r] of reuniones) {
    if (!(await primeraVez(`reunion-${clave}`))) continue;

    const destinatarios = new Set<string>(r.personas);
    if (r.creador) destinatarios.add(r.creador);
    if (r.todos) (mandos || []).forEach((m) => destinatarios.add(m.id));
    for (const p of r.personas) (await revisoresDe(p)).forEach((id) => destinatarios.add(id));

    const minutos = Math.max(1, Math.round((new Date(r.inicio).getTime() - ahora.getTime()) / 60000));
    await enviarPush(Array.from(destinatarios), {
      titulo: `Reunión en ${minutos} min`,
      cuerpo: r.titulo,
      url: "/movil/avisos",
      etiqueta: `reunion-${clave}`,
    });
    enviadas++;
  }

  return NextResponse.json({ enviadas });
}
