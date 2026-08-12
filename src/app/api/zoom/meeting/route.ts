import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getZoomAccessToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Variables de entorno de Zoom no configuradas correctamente');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.reason || data.message || 'Error autenticando con la API de Zoom');
  }

  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { titulo, descripcion, fechaInicio } = await req.json();

    const token = await getZoomAccessToken();

    const zoomRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: titulo || 'Reunión ERP',
        type: 2, // Reunión programada
        start_time: new Date(fechaInicio).toISOString(),
        duration: 60, // Duración en minutos
        agenda: descripcion || 'Reunión de seguimiento convocada desde ROCAL ERP',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          auto_recording: 'none',
        },
      }),
    });

    const meetingData = await zoomRes.json();

    if (zoomRes.ok && meetingData.join_url) {
      return NextResponse.json({ success: true, link: meetingData.join_url }, { status: 200, headers: corsHeaders });
    } else {
      throw new Error(meetingData.message || 'No se pudo generar la sala de Zoom');
    }
  } catch (error: any) {
    console.error('Error endpoint Zoom:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}