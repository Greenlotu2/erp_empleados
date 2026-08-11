import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '../../../../lib/auth';

export async function POST(req: NextRequest) {
  try {
    let isAuthorized = false;

    // 🔒 1. Intento A: Verificar Token JWT en encabezado Authorization (Bearer)
    const jwtCaller = verifyAuthToken(req);
    if (jwtCaller) {
      isAuthorized = true;
    }

    // 🔒 2. Intento B: Verificar Sesión de Supabase vía Cookies (Panel Web)
    if (!isAuthorized) {
      const supabaseSsr = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll() {},
          },
        }
      );

      const { data: { user } } = await supabaseSsr.auth.getUser();
      if (user) {
        isAuthorized = true;
      }
    }

    // 🛡️ Bloquear acceso si no hay usuario autenticado (evita consumo no autorizado de la API de Groq)
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'No autorizado: Debes iniciar sesión para ejecutar este análisis' },
        { status: 401 }
      );
    }

    // =========================================================
    // 👇 TU LÓGICA DE GROQ API PERMANECE INTACTA A CONTINUACIÓN
    // =========================================================
    const body = await req.json();
    const { proyectoNombre, tareas, reuniones } = body;

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No se encontró la variable GROQ_API_KEY en .env.local' },
        { status: 500 }
      );
    }

    const prompt = `
Eres un experto en gestión de proyectos, Diagramas Gantt y Método de la Ruta Crítica (CPM).
Analiza las siguientes tareas del proyecto "${proyectoNombre}":

TAREAS:
${JSON.stringify(tareas, null, 2)}

REUNIONES RELACIONADAS:
${JSON.stringify(reuniones, null, 2)}

Responde ÚNICAMENTE con un objeto JSON estrictamente válido que tenga esta estructura exacta (sin bloques de código Markdown ni texto extra):
{
  "estadoGeneral": "Crítico",
  "resumenEjecutivo": "Un resumen conciso del estado actual de las dependencias, holguras y tiempos.",
  "puntosCriticos": ["Nombre del empleado o tarea que representa el cuello de botella main"],
  "recomendaciones": [
    {
      "descripcion": "Sugerencia concreta de reasignación o balanceo de trabajo."
    }
  ]
}
`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Error devuelto por Groq API:', errText);
      return NextResponse.json(
        { error: 'Error devuelto por la API de Groq', details: errText },
        { status: groqRes.status }
      );
    }

    const groqData = await groqRes.json();
    const textResponse = groqData.choices?.[0]?.message?.content || '{}';

    // Limpiar formato Markdown por si el modelo lo incluye
    const cleanJsonText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonText);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error('Error interno en endpoint de Groq:', error);
    return NextResponse.json(
      { error: 'Error procesando la solicitud en el servidor', details: error?.message },
      { status: 500 }
    );
  }
}