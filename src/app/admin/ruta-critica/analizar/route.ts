import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
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