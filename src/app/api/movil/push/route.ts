import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/api-auth";
import {
  corsMovil,
  opcionesMovil,
  verificarMovil,
} from "../../../../lib/movilAuth";
import { enviarPush } from "../../../../lib/push";

// Suscripción del teléfono a las notificaciones push.
//  POST   { subscription, prueba? } → guarda/actualiza (y opcionalmente manda una de prueba)
//  DELETE { endpoint }               → deja de recibirlas en ese teléfono

const responder = (cuerpo: object, status: number) =>
  NextResponse.json(cuerpo, { status, headers: corsMovil });

export async function POST(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const { usuario } = auth;

  const b = await req.json().catch(() => ({}));
  const sub = b?.subscription;
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const authKey = String(sub?.keys?.auth || "");
  if (!endpoint.startsWith("https://") || !p256dh || !authKey) {
    return responder({ error: "Suscripción no válida." }, 400);
  }

  // El mismo teléfono puede cambiar de usuario: el endpoint manda.
  const { error } = await supabaseAdmin.from("push_suscripciones").upsert(
    {
      empleado_id: usuario.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return responder({ error: error.message }, 500);

  // Al activar de nuevo, las suscripciones anteriores de este mismo teléfono
  // (mismo usuario y mismo user-agent, endpoint distinto) ya no sirven: Apple
  // las sigue aceptando pero nadie las recibe, y estorban al mandar avisos.
  if (b?.prueba) {
    const agente = (req.headers.get("user-agent") || "").slice(0, 300);
    await supabaseAdmin
      .from("push_suscripciones")
      .delete()
      .eq("empleado_id", usuario.id)
      .eq("user_agent", agente)
      .neq("endpoint", endpoint);
  }

  if (b?.prueba) {
    await enviarPush([usuario.id], {
      titulo: "Notificaciones activadas",
      cuerpo: "Aquí te avisaremos de entregas por revisar, vencimientos y reuniones.",
      url: "/movil/avisos",
      etiqueta: "prueba",
    });
  }
  return responder({ success: true }, 200);
}

export async function DELETE(req: Request) {
  const auth = await verificarMovil(req);
  if (!auth.ok) return auth.respuesta;
  const b = await req.json().catch(() => ({}));
  const endpoint = String(b?.endpoint || "");
  if (endpoint) {
    await supabaseAdmin
      .from("push_suscripciones")
      .delete()
      .eq("endpoint", endpoint)
      .eq("empleado_id", auth.usuario.id);
  }
  return responder({ success: true }, 200);
}

export const OPTIONS = opcionesMovil;
