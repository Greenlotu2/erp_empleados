import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import { esCronAutorizado, fechaMx, REUNION_ACTIVA } from "../../../../lib/cronAuth";
import { idsEquipo } from "../../../../lib/movilAuth";
import { enviarPush, primeraVez } from "../../../../lib/push";

// Resumen de la mañana (Vercel Cron, ver vercel.json: 14:00 UTC = 8:00 México).
// A cada persona de Gerencia/Coordinación con notificaciones activas le llega
// UNA notificación con lo de su equipo: por revisar, vencidas, vencen hoy y
// reuniones de hoy. Si no hay nada, no se manda.

export async function GET(req: Request) {
  if (!esCronAutorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = fechaMx(0);
  const inicioDia = new Date(`${hoy}T00:00:00-06:00`).toISOString();
  const finDia = new Date(`${hoy}T23:59:59-06:00`).toISOString();

  // Solo a quien tiene al menos un teléfono suscrito.
  const { data: subs } = await supabaseAdmin.from("push_suscripciones").select("empleado_id");
  const conPush = Array.from(new Set((subs || []).map((s) => s.empleado_id)));
  if (conPush.length === 0) return NextResponse.json({ enviados: 0 });

  const [{ data: destinatarios }, { data: tareas }, { data: reuniones }] = await Promise.all([
    supabaseAdmin
      .from("empleados")
      .select("id, nombre, nivel, area")
      .in("id", conPush)
      .in("nivel", ["Gerencia", "Coordinador"]),
    supabaseAdmin
      .from("tareas")
      .select("empleado_id, estado, fecha_limite")
      .neq("estado", "Completada"),
    supabaseAdmin
      .from("reuniones")
      .select("titulo, fecha_inicio, empleado_id, creado_por")
      .in("estado", REUNION_ACTIVA)
      .gte("fecha_inicio", inicioDia)
      .lte("fecha_inicio", finDia),
  ]);

  let enviados = 0;
  for (const d of destinatarios || []) {
    if (!(await primeraVez(`resumen-${hoy}-${d.id}`))) continue;

    const equipo = await idsEquipo(d);
    const enEquipo = (id: string) => !equipo || equipo.includes(id);
    const suyas = (tareas || []).filter((t) => enEquipo(t.empleado_id));
    const porRevisar = suyas.filter((t) => (t.estado || "").includes("Revisi")).length;
    const activas = suyas.filter((t) => !(t.estado || "").includes("Revisi") && t.fecha_limite);
    const vencidas = activas.filter((t) => t.fecha_limite.slice(0, 10) < hoy).length;
    const vencenHoy = activas.filter((t) => t.fecha_limite.slice(0, 10) === hoy).length;
    const juntas = new Set(
      (reuniones || [])
        .filter((r) => !r.empleado_id || enEquipo(r.empleado_id) || r.creado_por === d.id)
        .map((r) => `${r.titulo}|${r.fecha_inicio}`),
    ).size;

    const partes = [
      porRevisar && `${porRevisar} por revisar`,
      vencidas && `${vencidas} ${vencidas === 1 ? "vencida" : "vencidas"}`,
      vencenHoy && `${vencenHoy} ${vencenHoy === 1 ? "vence" : "vencen"} hoy`,
      juntas && `${juntas} ${juntas === 1 ? "reunión" : "reuniones"} hoy`,
    ].filter(Boolean);
    if (partes.length === 0) continue;

    await enviarPush([d.id], {
      titulo: `Buenos días, ${d.nombre.split(" ")[0]}`,
      cuerpo: `Tu equipo hoy: ${partes.join(" · ")}.`,
      url: "/movil/avisos",
      etiqueta: `resumen-${hoy}`,
    });
    enviados++;
  }

  return NextResponse.json({ enviados });
}
