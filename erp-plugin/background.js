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
// 6. FUNCIÓN AUXILIAR PARA SUMAR HORAS (vía API del ERP, NO Supabase directo)
// ==========================================
// Antes esto pegaba a `/rest/v1/empleados` con la publishable key horneada en el
// código. Ahora pasa por la API autenticada del ERP (`/api/empleados/horas`), que
// verifica el JWT del empleado y valida que solo actualice su propio perfil.
function getConfigExtension() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['custom_api_url', 'jwt_token'], (res) => {
      const base = (res?.custom_api_url || 'https://erp-empleados-rocal.vercel.app/api').replace(/\/+$/, '');
      resolve({ apiBase: base, token: res?.jwt_token || null });
    });
  });
}

async function acumularHorasEnSupabase(empleadoId, horasIncremento) {
  if (!horasIncremento || horasIncremento <= 0) return;

  try {
    const { apiBase, token } = await getConfigExtension();
    if (!token) {
      console.warn('Sin JWT en storage: se omite la sincronización de horas.');
      return;
    }
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Incremento ATÓMICO en el servidor — sin leer-modificar-escribir, así no hay
    // carrera con el panel cuando ambos sincronizan casi al mismo tiempo.
    await fetch(`${apiBase}/empleados/horas`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        employeeId: empleadoId,
        deltaHoras: Number(horasIncremento.toFixed(6)),
      }),
    });
  } catch (error) {
    console.error('Error sincronizando horas vía API:', error);
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
    abrirVentanaPanel();
    return false;
  }
});
// ==========================================
// 7.5 ABRIR EL PANEL AL INICIAR CHROME
// ==========================================
// Chrome no deja abrir el panel lateral sin un clic, así que al abrir el
// navegador se abre la ventana flotante. Solo si hay sesión y la opción
// "Abrir al iniciar Chrome" (menú ⋮) está activa; viene activada por defecto.
//
// No basta con runtime.onStartup: si Chrome se queda corriendo en segundo
// plano al cerrar sus ventanas, al "volver a abrirlo" no hay inicio. Por eso
// también se escucha cuando aparece la primera ventana normal. El id de la
// ventana flotante se guarda en storage.session para no abrir dos.
async function abrirVentanaPanel() {
  const w = await chrome.windows.create({ url: 'panel.html', type: 'popup', width: 380, height: 620, focused: true });
  if (w?.id != null) chrome.storage.session?.set({ ventanaPanelId: w.id });
  return w;
}

async function ventanaPanelAbierta() {
  const { ventanaPanelId } = (await chrome.storage.session?.get(['ventanaPanelId'])) || {};
  if (ventanaPanelId == null) return false;
  try {
    await chrome.windows.get(ventanaPanelId);
    return true;
  } catch {
    return false;
  }
}

let abriendoAlIniciar = false;
async function abrirAlIniciarSiCorresponde() {
  if (abriendoAlIniciar) return;
  abriendoAlIniciar = true;
  try {
    const res = await chrome.storage.local.get(['session_user', 'jwt_token', 'abrir_al_iniciar']);
    if (!res.session_user?.id || !res.jwt_token || res.abrir_al_iniciar === false) return;
    // Se espera a que Chrome termine de abrir y restaurar sus ventanas; si no,
    // la ventana flotante queda detrás de la principal.
    await new Promise(r => setTimeout(r, 1500));
    const normales = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (normales.length === 0) return;
    if (await ventanaPanelAbierta()) return;
    await abrirVentanaPanel();
  } catch (e) {
    console.error('No se pudo abrir el panel al iniciar:', e);
  } finally {
    abriendoAlIniciar = false;
  }
}

chrome.runtime.onStartup.addListener(abrirAlIniciarSiCorresponde);

chrome.windows.onCreated.addListener(async (win) => {
  if (win.type !== 'normal') return;
  // Solo cuando es la primera ventana (el navegador se acaba de "abrir").
  const normales = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (normales.length === 1) abrirAlIniciarSiCorresponde();
});

// ==========================================
// 8. NOTIFICACIONES DE TAREAS Y REUNIONES
// ==========================================
// Cada 30 segundos (aunque el panel esté cerrado) se consultan las tareas y
// reuniones del empleado y se avisa con una notificación del sistema:
//  - tarea nueva asignada
//  - tarea revisada (aprobada / a corregir)
//  - reunión nueva programada
//  - recordatorio 10 minutos antes de que empiece una reunión
// La primera consulta solo memoriza lo que ya existe, para no avisar de golpe
// de todo lo viejo al instalar o iniciar sesión.
const ALARMA_AVISOS = 'REVISAR_AVISOS';
const MIN_RECORDATORIO = 10;
const ESTADOS_REUNION_ACTIVA = ['Programada', 'Ajuste por tiempo'];

function programarAlarmaAvisos() {
  if (!chrome.alarms) return;
  chrome.alarms.get(ALARMA_AVISOS, (alarma) => {
    // 30 s es el mínimo que permite Chrome. Si quedó una alarma con otro
    // periodo (versión anterior), se reemplaza.
    if (!alarma || alarma.periodInMinutes !== 0.5) {
      chrome.alarms.create(ALARMA_AVISOS, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
    }
  });
}

chrome.runtime.onStartup.addListener(programarAlarmaAvisos);
chrome.runtime.onInstalled.addListener(programarAlarmaAvisos);
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local' || !changes.session_user) return;
  if (changes.session_user.newValue) {
    programarAlarmaAvisos();
  } else {
    if (chrome.alarms) chrome.alarms.clear(ALARMA_AVISOS);
    chrome.storage.local.remove(['avisos_estado', 'avisos_historial']);
  }
});

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARMA_AVISOS) revisarAvisos();
  });
}

// Con el panel abierto, él pide revisar al cargar datos y cada 15 s, así el
// aviso no espera a la alarma.
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'REVISAR_AVISOS') revisarAvisos();
});

function leerStorage(claves) {
  return new Promise((resolve) => chrome.storage.local.get(claves, resolve));
}

async function pedirJson(url, token) {
  try {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    // Token vencido o cuenta eliminada: se cierra la sesión de la extensión.
    if (r.status === 401) {
      chrome.storage.local.remove(['session_user', 'jwt_token', 'todaySeconds', 'turnoActivo', 'inicioTurnoTimestamp']);
      return null;
    }
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Cada aviso se muestra como notificación del sistema y además se guarda en
// `avisos_historial`, que es lo que lista la pestaña "Avisos" del panel.
const MAX_HISTORIAL = 50;
let avisosNuevos = [];

function notificar(id, titulo, mensaje, link) {
  avisosNuevos.push({ id, tipo: id.split(':')[0], titulo, mensaje: mensaje || '', link: link || null, fecha: Date.now(), leido: false });
  if (!chrome.notifications) return;
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icono.png',
    title: titulo,
    message: mensaje || '',
    priority: 2,
  });
}

async function guardarAvisosNuevos() {
  if (avisosNuevos.length === 0) return;
  const nuevos = avisosNuevos;
  avisosNuevos = [];
  const { avisos_historial } = await leerStorage(['avisos_historial']);
  const previos = Array.isArray(avisos_historial) ? avisos_historial : [];
  const ids = new Set(nuevos.map(a => a.id));
  const historial = [...nuevos.reverse(), ...previos.filter(a => !ids.has(a.id))].slice(0, MAX_HISTORIAL);
  await chrome.storage.local.set({ avisos_historial: historial });
}

// Número de avisos sin leer sobre el ícono de la extensión.
function actualizarInsignia(historial) {
  if (!chrome.action) return;
  const sinLeer = (historial || []).filter(a => !a.leido).length;
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  chrome.action.setBadgeText({ text: sinLeer ? String(Math.min(sinLeer, 99)) : '' });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.avisos_historial) actualizarInsignia(changes.avisos_historial.newValue);
});

function inicioReunion(m) {
  if (m.fecha_inicio) {
    const d = new Date(m.fecha_inicio);
    if (!isNaN(d)) return d.getTime();
  }
  return null;
}

let revisandoAvisos = false;
async function revisarAvisos() {
  if (revisandoAvisos) return;
  revisandoAvisos = true;
  try {
    const res = await leerStorage(['session_user', 'jwt_token', 'avisos_estado']);
    const empleadoId = res.session_user?.id;
    if (!empleadoId || !res.jwt_token) return;
    const { apiBase } = await getConfigExtension();

    const [dataT, dataR] = await Promise.all([
      pedirJson(`${apiBase}/tareas?employeeId=${empleadoId}`, res.jwt_token),
      pedirJson(`${apiBase}/reuniones?employeeId=${empleadoId}`, res.jwt_token),
    ]);
    // Si algo falló (red, sesión vencida) no se toca el estado guardado.
    if (!dataT || !dataR) return;

    const tareas = Array.isArray(dataT) ? dataT : (dataT.tareas || []);
    const reuniones = Array.isArray(dataR) ? dataR : (dataR.reuniones || []);

    const previo = res.avisos_estado;
    const primeraVez = !previo || previo.empleadoId !== empleadoId;
    const tareasVistas = new Set(primeraVez ? [] : previo.tareas);
    const revisionesVistas = new Set(primeraVez ? [] : previo.revisiones);
    const reunionesVistas = new Set(primeraVez ? [] : previo.reuniones);
    const recordadas = new Set(primeraVez ? [] : previo.recordadas);

    const ahora = Date.now();

    for (const t of tareas) {
      const clave = String(t.id);
      if (!primeraVez && !tareasVistas.has(clave)) {
        const limite = t.fecha_limite ? ` · Entrega: ${t.fecha_limite}` : '';
        notificar(`tarea:${clave}`, 'Nueva tarea asignada', `${t.titulo || 'Tarea'}${limite}`);
      }
      tareasVistas.add(clave);

      if (t.revision_fecha && t.revision_resultado) {
        const claveRev = `${clave}|${t.revision_fecha}`;
        if (!primeraVez && !revisionesVistas.has(claveRev)) {
          const aprobada = t.revision_resultado === 'Aprobado';
          const comentario = t.revision_comentario ? ` — “${t.revision_comentario}”` : '';
          notificar(
            `revision:${claveRev}`,
            aprobada ? 'Tarea aprobada' : 'Tarea por corregir',
            `${t.titulo || 'Tarea'}${comentario}`
          );
        }
        revisionesVistas.add(claveRev);
      }
    }

    for (const m of reuniones) {
      if (m.estado && !ESTADOS_REUNION_ACTIVA.includes(m.estado)) continue;
      const clave = String(m.id);
      const inicio = inicioReunion(m);
      const cuando = inicio
        ? new Date(inicio).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
        : 'Fecha por definir';

      if (!primeraVez && !reunionesVistas.has(clave) && (!inicio || inicio > ahora)) {
        notificar(`reunion:${clave}`, 'Nueva reunión programada', `${m.titulo || 'Reunión'} · ${cuando}`, m.link);
      }
      reunionesVistas.add(clave);

      // Recordatorio: faltan 10 minutos o menos y todavía no empieza.
      const claveRec = `${clave}|${m.fecha_inicio}`;
      if (inicio && inicio > ahora && inicio - ahora <= MIN_RECORDATORIO * 60000 && !recordadas.has(claveRec)) {
        const minutos = Math.max(1, Math.round((inicio - ahora) / 60000));
        notificar(`recordatorio:${claveRec}`, `Reunión en ${minutos} min`, `${m.titulo || 'Reunión'}${m.link ? ' · Clic para unirte' : ''}`, m.link);
        recordadas.add(claveRec);
      }
    }

    await guardarAvisosNuevos();

    // Se recorta para que el storage no crezca sin límite.
    chrome.storage.local.set({
      avisos_estado: {
        empleadoId,
        tareas: Array.from(tareasVistas).slice(-500),
        revisiones: Array.from(revisionesVistas).slice(-500),
        reuniones: Array.from(reunionesVistas).slice(-500),
        recordadas: Array.from(recordadas).slice(-200),
      },
    });
  } finally {
    avisosNuevos = [];
    revisandoAvisos = false;
  }
}

// Clic en la notificación: si es una reunión con enlace, se abre el enlace;
// en cualquier otro caso se abre el panel en ventana flotante.
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener(async (idNotif) => {
    chrome.notifications.clear(idNotif);
    const tipo = idNotif.split(':')[0];
    if (tipo === 'reunion' || tipo === 'recordatorio') {
      const { avisos_historial } = await leerStorage(['avisos_historial']);
      const link = (avisos_historial || []).find(a => a.id === idNotif)?.link;
      if (link && /^https:\/\//i.test(link)) {
        chrome.tabs.create({ url: link });
        return;
      }
    }
    chrome.windows.create({ url: 'panel.html', type: 'popup', width: 380, height: 620, focused: true });
  });
}

// Al despertar el service worker se asegura que la alarma exista.
programarAlarmaAvisos();
leerStorage(['avisos_historial']).then(r => actualizarInsignia(r.avisos_historial));
