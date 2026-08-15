// ==========================================
// 1. CONFIGURACIÓN DEL SIDEPANEL
// ==========================================
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  ?.catch((error) => console.error('Error al configurar SidePanel:', error));

// ==========================================
// 1.5 ESTADO DEL PANEL (🛡️ Fix #4: Evita doble conteo)
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PANEL_ACTIVE') {
    chrome.storage.local.set({ panelActive: true, inicioTurnoTimestamp: Date.now() });
  }

  if (request.type === 'PANEL_INACTIVE') {
    chrome.storage.local.set({ panelActive: false, inicioTurnoTimestamp: Date.now() });
  }
});

// ==========================================
// 2. FUNCIÓN DE INICIO AUTOMÁTICO DE TURNO
// ==========================================
function asegurarTurnoActivo() {
  chrome.storage.local.get(['session_user', 'turnoActivo', 'inicioTurnoTimestamp'], (res) => {
    const empleadoId = res.session_user?.id || res.session_user?.user_id;

    if (empleadoId) {
      const ahora = Date.now();
      
      if (!res.turnoActivo || !res.inicioTurnoTimestamp) {
        chrome.storage.local.set({
          turnoActivo: true,
          inicioTurnoTimestamp: ahora,
          empleadoId: empleadoId
        });
      }

      // 🛡️ Fix #8: Asegurar que la alarma no esté atascada ni vencida
      if (chrome.alarms) {
        chrome.alarms.get('SYNC_HORAS_SUPABASE', (alarma) => {
          const cincoMinutosMs = 5 * 60 * 1000;
          const alarmaAtascada = alarma && alarma.scheduledTime && (Date.now() - alarma.scheduledTime > cincoMinutosMs);

          if (!alarma || alarmaAtascada) {
            chrome.alarms.clear('SYNC_HORAS_SUPABASE', () => {
              chrome.alarms.create('SYNC_HORAS_SUPABASE', { periodInMinutes: 5 });
              console.log("⏰ Alarma de horas reprogramada exitosamente (cada 5 min).");
            });
          }
        });
      }
    }
  });
}

// ==========================================
// 3. EVENTOS DEL NAVEGADOR
// ==========================================
chrome.runtime.onStartup.addListener(() => {
  console.log("🚀 Navegador abierto: Verificando turno...");
  asegurarTurnoActivo();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("📦 Extensión iniciada: Verificando turno...");
  asegurarTurnoActivo();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.session_user) {
      if (changes.session_user.newValue) {
        console.log("🔑 Sesión detectada -> Activando turno.");
        asegurarTurnoActivo();
      } else {
        console.log("🚪 Cierre de sesión -> Deteniendo turno.");
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
// 5. SINCRONIZACIÓN EN SEGUNDO PLANO (Con horario 9am-5pm)
// ==========================================
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'SYNC_HORAS_SUPABASE') {
      const ahora = new Date();
      const horaActual = ahora.getHours();
      const esHorarioLaboral = horaActual >= 9 && horaActual < 17; // ⏰ 9:00 a 17:00

      chrome.storage.local.get(['session_user', 'inicioTurnoTimestamp', 'panelActive'], async (res) => {
        const empleadoId = res.session_user?.id || res.session_user?.user_id;

        // 🛡️ Fix #4: Si el panel está abierto, panel.js ya suma, background solo adelanta el reloj
        if (res.panelActive) {
          chrome.storage.local.set({ inicioTurnoTimestamp: Date.now() });
          return;
        }

        if (empleadoId && res.inicioTurnoTimestamp && esHorarioLaboral) {
          const tiempoActual = Date.now();
          const lapsoMs = tiempoActual - res.inicioTurnoTimestamp;
          const horasParciales = lapsoMs / (1000 * 60 * 60);

          if (horasParciales > 0) {
            await acumularHorasEnSupabase(empleadoId, horasParciales);
            chrome.storage.local.set({ inicioTurnoTimestamp: tiempoActual });
            console.log(`⏱️ Sincronización automática: +${horasParciales.toFixed(3)} hrs.`);
          }
        } else if (!esHorarioLaboral) {
          // Si estamos fuera de horario, solo adelantamos el timestamp para no acumular horas no trabajadas
          chrome.storage.local.set({ inicioTurnoTimestamp: Date.now() });
        }
      });
    }
  });
}

// ==========================================
// 6. FUNCIÓN AUXILIAR PARA SUMAR HORAS EN SUPABASE
// ==========================================
async function acumularHorasEnSupabase(empleadoId, horasIncremento) {
  if (!horasIncremento || horasIncremento <= 0) return;

  try {
    const SUPABASE_URL = "https://twrvbdxudbmzdimxgjnz.supabase.co";
    const SUPABASE_KEY = "sb_publishable_vNP-W2Qk4VMjw4Cx4GNdXw_g9jGPy_w";

    // 1. Obtener horas actuales
    const res = await fetch(`${SUPABASE_URL}/rest/v1/empleados?id=eq.${empleadoId}&select=horas_acumuladas`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    const horasActuales = data[0]?.horas_acumuladas || 0;
    const nuevasHoras = Number((horasActuales + horasIncremento).toFixed(4));

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