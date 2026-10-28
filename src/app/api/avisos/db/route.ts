import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import { esCronAutorizado } from "../../../../lib/cronAuth";
import { enviarPush, primeraVez } from "../../../../lib/push";

// Push inmediato al celular cuando se asigna una tarea o una reunión, o cuando
// se aprueba/rechaza una entrega. Lo llaman los triggers de Supabase
// (avisar_cambio, vía pg_net) con "Authorization: Bearer <CRON_SECRET>", así
// funciona igual venga el cambio de la web, de la app o de la extensión.
// Usa las mismas claves de `push_enviados` que /api/cron/reuniones, de modo que
// el cron de respaldo no repite lo que ya salió aquí.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (valor: string) => {
  const [, mm, dd] = valor.slice(0, 10).split("-");
  return `${Number(dd)} ${MESES[Number(mm) - 1] || ""}`;
};

export async function POST(req: Request) {
  if (!esCronAutorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { tabla, op, id } = await req.json().catch(() => ({}));
  if (!tabla || !id) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  if (tabla === "tareas") {
    const { data: t } = await supabaseAdmin
      .from("tareas")
      .select("id, titulo, empleado_id, colaboradores_ids, fecha_limite, revision_resultado, revision_comentario, revision_fecha")
      .eq("id", id)
      .maybeSingle();
    if (!t) return NextResponse.json({ enviado: false });

    if (op === "INSERT") {
      if (!(await primeraVez(`tarea-nueva-${t.id}`))) return NextResponse.json({ enviado: false });
      const entrega = t.fecha_limite ? ` · Entrega: ${fechaCorta(t.fecha_limite)}` : "";
      await enviarPush([t.empleado_id, ...(t.colaboradores_ids || [])].filter(Boolean), {
        titulo: "Nueva tarea asignada",
        cuerpo: `${t.titulo}${entrega}`,
        url: `/movil/tarea/${t.id}`,
        etiqueta: `tarea-nueva-${t.id}`,
      });
      return NextResponse.json({ enviado: true });
    }

    if (op === "UPDATE" && t.revision_resultado && t.empleado_id) {
      if (!(await primeraVez(`decision-${t.id}-${t.revision_fecha}`))) {
        return NextResponse.json({ enviado: false });
      }
      const aprobada = t.revision_resultado === "Aprobado";
      const comentario = t.revision_comentario ? ` — “${t.revision_comentario}”` : "";
      await enviarPush([t.empleado_id], {
        titulo: aprobada ? "Tu entrega fue aprobada" : "Te pidieron correcciones",
        cuerpo: `${t.titulo}${comentario}`,
        url: `/movil/tarea/${t.id}`,
        etiqueta: `decision-${t.id}`,
      });
      return NextResponse.json({ enviado: true });
    }
  }

  if (tabla === "reuniones" && op === "INSERT") {
    const { data: r } = await supabaseAdmin
      .from("reuniones")
      .select("id, titulo, fecha_inicio, empleado_id, creado_por, tarea_id")
      .eq("id", id)
      .maybeSingle();
    // Las reuniones ligadas a una tarea ya se avisan con "Nueva tarea asignada".
    if (!r || r.tarea_id) return NextResponse.json({ enviado: false });
    if (!(await primeraVez(`reunion-nueva-${r.id}`))) return NextResponse.json({ enviado: false });

    // Cada participante es una fila; empleado_id vacío = todo el equipo.
    let destinatarios: string[];
    if (r.empleado_id) {
      destinatarios = [r.empleado_id];
    } else {
      const { data: todos } = await supabaseAdmin.from("empleados").select("id");
      destinatarios = (todos || []).map((e) => e.id);
    }
    destinatarios = destinatarios.filter((d) => d !== r.creado_por);

    const cuando = r.fecha_inicio
      ? new Date(r.fecha_inicio).toLocaleString("es-MX", {
          timeZone: "America/Mexico_City",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "";
    await enviarPush(destinatarios, {
      titulo: "Nueva reunión agendada",
      cuerpo: `${r.titulo}${cuando ? ` · ${cuando}` : ""}`,
      url: "/movil/avisos",
      etiqueta: `reunion-nueva-${r.id}`,
    });
    return NextResponse.json({ enviado: true });
  }

  return NextResponse.json({ enviado: false });
}
