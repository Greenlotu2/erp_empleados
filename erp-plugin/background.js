// ==========================================
// 1. CONFIGURACIÓN DEL SIDEPANEL
// ==========================================
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  ?.catch((error) => console.error('Error al configurar SidePanel:', error));

// ==========================================
// 2. FUNCIÓN DE INICIO AUTOMÁTICO DE TURNO
// ==========================================
function asegurarTurnoActivo() {
  chrome.storage.local.get(['session_user', 'turnoActivo', 'inicioTurnoTimestamp'], (res) => {
    // Si hay una sesión iniciada (usuario logueado)
    const empleadoId = res.session_user?.id || res.session_user?.user_id;

    if (empleadoId) {
      const ahora = Date.now();
      
      // Si no estaba activo o no tenía timestamp, lo inicializamos
      if (!res.turnoActivo || !res.inicioTurnoTimestamp) {
        chrome.storage.local.set({
          turnoActivo: true,
          inicioTurnoTimestamp: ahora,
          empleadoId: empleadoId
        });
      }

      // Asegurar que la alarma exista
      if (chrome.alarms) {
        chrome.alarms.get('SYNC_HORAS_SUPABASE', (alarma) => {
          if (!alarma) {
            chrome.alarms.create('SYNC_HORAS_SUPABASE', { periodInMinutes: 5 });
            console.log("⏰ Alarma automática de horas activada (cada 5 min).");
          }
        });
      }
    }
  });
}

// ==========================================
// 3. EVENTOS DEL NAVEGADOR (AUTO-START)
// ==========================================

// A) Cuando se abre el navegador Chrome
chrome.runtime.onStartup.addListener(() => {
  console.log("🚀 Navegador abierto: Verificando turno automático...");
  asegurarTurnoActivo();
});

// B) Cuando se instala o actualiza la extensión
chrome.runtime.onInstalled.addListener(() => {
  console.log("📦 Extensión iniciada: Verificando turno automático...");
  asegurarTurnoActivo();
});

// C) Escuchar cambios en Storage (ej. cuando el usuario inicia/cierra sesión)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.session_user) {
      if (changes.session_user.newValue) {
        console.log("🔑 Inicio de sesión detectado -> Activando turno automático.");
        asegurarTurnoActivo();
      } else {
        console.log("🚪 Cierre de sesión detectado -> Deteniendo turno.");
        detenerTurnoAutomatico();
      }
    }
  }
});

// ==========================================
// 4. DETENCIÓN Y GUARDADO FINAL
// ==========================================
async function detenerTurnoAutomatico() {
  chrome.storage.local.get(['inicioTurnoTimestamp', 'empleadoId', 'session_user'], async (res) => {
    const empleadoId = res.empleadoId || res.session_user?.id;
    if (res.inicioTurnoTimestamp && empleadoId) {
      const tiempoTranscurridoMs = Date.now() - res.inicioTurnoTimestamp;
      const horasDecimales = tiempoTranscurridoMs / (1000 * 60 * 60);

      await acumularHorasEnSupabase(empleadoId, horasDecimales);

      chrome.storage.local.set({ turnoActivo: false, inicioTurnoTimestamp: null }, () => {
        if (chrome.alarms) chrome.alarms.clear('SYNC_HORAS_SUPABASE');
        console.log(`🛑 Turno detenido y guardado en Supabase: +${horasDecimales.toFixed(2)} hrs`);
      });
    }
  });
}

// ==========================================
// 5. SINCRONIZACIÓN PERIÓDICA EN SEGUNDO PLANO
// ==========================================
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'SYNC_HORAS_SUPABASE') {
      chrome.storage.local.get(['session_user', 'inicioTurnoTimestamp'], async (res) => {
        const empleadoId = res.session_user?.id || res.session_user?.user_id;

        if (empleadoId && res.inicioTurnoTimestamp) {
          const tiempoActual = Date.now();
          const lapsoMs = tiempoActual - res.inicioTurnoTimestamp;
          const horasParciales = lapsoMs / (1000 * 60 * 60);

          if (horasParciales > 0) {
            await acumularHorasEnSupabase(empleadoId, horasParciales);
            // Avanzar el timestamp para no duplicar horas en la siguiente alarma
            chrome.storage.local.set({ inicioTurnoTimestamp: tiempoActual });
            console.log(`⏱️ Sincronización automática: +${horasParciales.toFixed(3)} hrs añadidas.`);
          }
        }
      });
    }
  });
}

// ==========================================
// 6. FUNCIÓN AUXILIAR PARA SUMAR HORAS EN BD
// ==========================================
async function acumularHorasEnSupabase(empleadoId, horasIncremento) {
  try {
    const SUPABASE_URL = "https://twrvbdxudbmzdimxgjnz.supabase.co";       // 👈 Tu URL de Supabase
    const SUPABASE_KEY = "sb_publishable_vNP-W2Qk4VMjw4Cx4GNdXw_g9jGPy_w";  // 👈 Tu Anon Key de Supabase

    // 1. Obtener horas actuales
    const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?id=eq.${empleadoId}&select=horas_acumuladas`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    const horasActuales = data[0]?.horas_acumuladas || 0;
    const nuevasHoras = Number((horasActuales + horasIncremento).toFixed(2));

    // 2. Actualizar en Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/empleados?id=eq.${empleadoId}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ horas_acumuladas: nuevasHoras })
    });
  } catch (error) {
    console.error("Error sincronizando horas en Supabase:", error);
  }
}

// ==========================================
// 7. MENSAJES Y PETICIONES HTTP
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'API_REQUEST') {
    fetch(request.url, request.options)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        sendResponse({ ok: response.ok, status: response.status, data: data });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || 'Error de red' });
      });
    return true;
  }

  if (request.type === 'OPEN_POPUP_WINDOW') {
    chrome.windows.create({
      url: 'panel.html',
      type: 'popup',
      width: 380,
      height: 620,
      focused: true
    });
    return false;
  }
});