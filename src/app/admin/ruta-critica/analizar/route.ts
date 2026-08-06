import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { proyectoNombre, tareas, reuniones } = await req.json();

    const prompt = `
      Eres un experto en gestión de proyectos y optimización de Ruta Crítica (CPM).
      Analiza el estado del proyecto "${proyectoNombre}":

      TAREAS DEL PROYECTO:
      ${JSON.stringify(tareas, null, 2)}

      REUNIONES Y REVISIONES PROGRAMADAS:
      ${JSON.stringify(reuniones, null, 2)}

      Genera un análisis en formato JSON estricto con la siguiente estructura exacta:
      {
        "estadoGeneral": "A tiempo" | "En riesgo" | "Crítico",
        "resumenEjecutivo": "Explicación breve del impacto de los retrasos y ajustes en las reuniones.",
        "puntosCriticos": ["Descripción puntual del cuello de botella 1", "Descripción puntual 2"],
        "recomendaciones": [
          {
            "titulo": "Acción recomendada",
            "impacto": "Alto" | "Medio" | "Bajo",
            "descripcion": "Qué ajustar en la cronología o asignación para recuperar tiempo."
          }
        ]
      }
    `;

    // Usamos gemini-1.5-flash optimizado para respuestas JSON rápidas
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonAnalysis = JSON.parse(responseText);

    return NextResponse.json(jsonAnalysis);
  } catch (error: any) {
    console.error('Error al analizar Ruta Crítica con Gemini:', error);
    return NextResponse.json(
      { error: 'No se pudo generar el diagnóstico con Gemini.' },
      { status: 500 }
    );
  }
}