document.addEventListener('DOMContentLoaded', () => {
  let usuarioAutenticado = null;
  let jwtToken = null;
  let activeMainTab = 'tareas';
  let activeSubFilter = 'por_hacer';

  // ⏱️ Variables para el Timer Automático de Servicio/Prácticas
  let timerInterval = null;
  let todaySeconds = 0;
  let lastSyncTimestamp = Date.now();
  const MAX_DAILY_SECONDS = 5 * 3600; // 5 Horas = 18,000s
  const API_BASE_URL = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL 
  ? process.env.NEXT_PUBLIC_API_URL 
  : "http://localhost:3000/api";

  const screenContainer = document.getElementById('screen-container');
  const logoutBtn = document.getElementById('btn-logout');
  const popoutBtn = document.getElementById('btn-popout');

  // Botón para desplegar en ventana flotante
  if (popoutBtn) {
    popoutBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP_WINDOW' });
    };
  }

  // 🔒 Peticiones seguras inyectando la cabecera Authorization: Bearer <token>
  function apiRequest(url, options = {}) {
    options.headers = {
      'Content-Type': 'application/json',
      ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}),
      ...(options.headers || {})
    };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'API_REQUEST', url, options }, (res) => {
        if (res?.status === 401) {
          handleLogout();
        }
        resolve(res || { ok: false, error: 'Sin respuesta' });
      });
    });
  }

  function renderLogin() {
    screenContainer.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:40px;">
        <h3 style="margin:0; font-size:15px; text-align:center; color:#fff;">Acceso de Empleados</h3>
        <input type="text" id="c-user" placeholder="Usuario o Correo" style="padding:10px; border-radius:8px; border:1px solid #374151; background:#111827; color:#fff; font-size:13px;">
        <input type="password" id="c-pass" placeholder="Contraseña" style="padding:10px; border-radius:8px; border:1px solid #374151; background:#111827; color:#fff; font-size:13px;">
        <button id="c-btnLogin" style="background:#2563eb; color:#fff; border:none; padding:11px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">Conectar al ERP</button>
      </div>
    `;

    document.getElementById('c-btnLogin').onclick = async () => {
      const email = document.getElementById('c-user').value.trim();
      const password = document.getElementById('c-pass').value.trim();
      if (!email || !password) return alert('Ingresa tus datos.');

      const res = await apiRequest(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      const user = res?.data?.employee || res?.data?.user;
      const token = res?.data?.token;

      if (res?.ok && user?.id && token) {
        usuarioAutenticado = user;
        jwtToken = token;
        
        chrome.storage.local.set({ session_user: usuarioAutenticado, jwt_token: jwtToken });
        if (logoutBtn) logoutBtn.style.display = 'block';
        renderDashboard();
      } else {
        alert(res?.data?.error || res?.data?.message || res?.error || 'Credenciales incorrectas.');
      }
    };
  }

  async function renderDashboard() {
    if (!usuarioAutenticado?.id || !jwtToken) return renderLogin();

    const rolLower = (usuarioAutenticado.rol || usuarioAutenticado.role || '').toLowerCase();
    const isEstudiante = rolLower.includes('practicante') || rolLower.includes('servicio');
    const targetHours = rolLower.includes('servicio') ? 480 : 250;

    screenContainer.innerHTML = `
      <!-- Tarjeta de Usuario -->
      <div style="background:#111827; border:1px solid #1f2937; border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <div style="font-size:18px;">👨‍💻</div>
        <div style="flex:1; overflow:hidden;">
          <h4 style="margin:0; font-size:12px; color:#fff;">${usuarioAutenticado.nombre || usuarioAutenticado.name || 'Empleado'}</h4>
          <p style="margin:0; font-size:10px; color:#3b82f6;">${usuarioAutenticado.rol || usuarioAutenticado.role || 'Personal'}</p>
        </div>
      </div>

      <!-- TIMER AUTOMÁTICO (Solo visible para Practicantes / Servicio Social) -->
      <div id="timer-box" style="display:${isEstudiante ? 'block' : 'none'}; background:linear-gradient(135deg, #0284c7, #4f46e5); border-radius:10px; padding:10px; color:white; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; opacity:0.9;">
          <span>⏱️ Jornada Diaria (Máx 5 hrs)</span>
          <span id="timer-status">🟢 Activo</span>
        </div>
        <div id="timer-display" style="font-size:20px; font-weight:bold; font-family:monospace; margin:4px 0; text-align:center;">00:00:00</div>
        <div style="display:flex; justify-content:space-between; font-size:9px; margin-top:2px;">
          <span>Acumulado:</span>
          <strong id="total-hours-text">0 / ${targetHours} hrs</strong>
        </div>
        <div style="width:100%; height:4px; background:rgba(255,255,255,0.2); border-radius:2px; overflow:hidden; margin-top:4px;">
          <div id="progress-fill" style="height:100%; background:#38bdf8; width:0%; transition:width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Pestañas Principales -->
      <div style="display:flex; background:#111827; border-radius:8px; padding:3px; gap:4px; margin-bottom:10px;">
        <button id="tab-tareas" style="flex:1; padding:6px; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">📋 Tareas</button>
        <button id="tab-reuniones" style="flex:1; padding:6px; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">📅 Reuniones</button>
      </div>

      <!-- Sub-Filtros -->
      <div style="display:flex; justify-content:space-between; gap:4px; margin-bottom:12px;">
        <button id="sub-por_hacer" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Por hacer</button>
        <button id="sub-pendientes" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Pendientes</button>
        <button id="sub-completadas" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Completadas</button>
      </div>

      <!-- Contenedor Dinámico -->
      <div id="c-contentList" style="flex:1; display:flex; flex-direction:column; gap:8px; overflow-y:auto;"></div>
    `;

    setupEvents();
    updateStyles();
    
    if (isEstudiante) {
      setupAutoTimer(targetHours);
    }

    await loadData();
  }

  function setupEvents() {
    document.getElementById('tab-tareas').onclick = () => { activeMainTab = 'tareas'; updateStyles(); loadData(); };
    document.getElementById('tab-reuniones').onclick = () => { activeMainTab = 'reuniones'; updateStyles(); loadData(); };

    ['por_hacer', 'pendientes', 'completadas'].forEach(filter => {
      document.getElementById(`sub-${filter}`).onclick = () => { activeSubFilter = filter; updateStyles(); loadData(); };
    });
  }

  function updateStyles() {
    const btnT = document.getElementById('tab-tareas');
    const btnR = document.getElementById('tab-reuniones');
    if (btnT && btnR) {
      btnT.style.background = activeMainTab === 'tareas' ? '#2563eb' : 'transparent';
      btnT.style.color = activeMainTab === 'tareas' ? '#fff' : '#9ca3af';
      btnR.style.background = activeMainTab === 'reuniones' ? '#2563eb' : 'transparent';
      btnR.style.color = activeMainTab === 'reuniones' ? '#fff' : '#9ca3af';
    }

    ['por_hacer', 'pendientes', 'completadas'].forEach(f => {
      const btn = document.getElementById(`sub-${f}`);
      if (btn) {
        const isActive = activeSubFilter === f;
        btn.style.background = isActive ? '#1f2937' : '#0b0f19';
        btn.style.color = isActive ? '#60a5fa' : '#6b7280';
        btn.style.borderColor = isActive ? '#3b82f6' : '#1f2937';
      }
    });
  }

  // ⏱️ Lógica del Temporizador Automático Diario
  function setupAutoTimer(targetHours) {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (todaySeconds < MAX_DAILY_SECONDS) {
        todaySeconds++;
        const statusEl = document.getElementById('timer-status');
        if (statusEl) {
          statusEl.innerText = '🟢 Contando';
          statusEl.style.color = '#86efac';
        }
      } else {
        const statusEl = document.getElementById('timer-status');
        if (statusEl) {
          statusEl.innerText = '🛑 Límite diario (5h max)';
          statusEl.style.color = '#fca5a5';
        }
      }

      const hrs = Math.floor(todaySeconds / 3600).toString().padStart(2, '0');
      const mins = Math.floor((todaySeconds % 3600) / 60).toString().padStart(2, '0');
      const secs = (todaySeconds % 60).toString().padStart(2, '0');

      const timerDisplay = document.getElementById('timer-display');
      if (timerDisplay) timerDisplay.innerText = `${hrs}:${mins}:${secs}`;

      chrome.storage.local.set({ todaySeconds });

      // Sincronizar horas con el backend cada 60 segundos
      if (Date.now() - lastSyncTimestamp >= 60000) {
        syncHoursToBackend(targetHours);
        lastSyncTimestamp = Date.now();
      }

      const accumulatedHours = (usuarioAutenticado.horas_acumuladas || 0) + (todaySeconds / 3600);
      const percent = Math.min(Math.round((accumulatedHours / targetHours) * 100), 100);

      const totalText = document.getElementById('total-hours-text');
      const progressFill = document.getElementById('progress-fill');
      if (totalText) totalText.innerText = `${accumulatedHours.toFixed(1)} / ${targetHours} hrs (${percent}%)`;
      if (progressFill) progressFill.style.width = `${percent}%`;

    }, 1000);
  }

  async function syncHoursToBackend(targetHours) {
    if (!usuarioAutenticado?.id) return;
    const newTotalHours = (usuarioAutenticado.horas_acumuladas || 0) + (1 / 60);

    try {
      await apiRequest(`${API_BASE_URL}/empleados/horas`, {
        method: 'PATCH',
        body: JSON.stringify({
          employeeId: usuarioAutenticado.id,
          horasAcumuladas: parseFloat(newTotalHours.toFixed(2)),
          targetHours
        })
      });
      usuarioAutenticado.horas_acumuladas = newTotalHours;
      chrome.storage.local.set({ session_user: usuarioAutenticado });
    } catch (err) {
      console.error('Error sincronizando horas:', err);
    }
  }

  async function loadData() {
    const list = document.getElementById('c-contentList');
    if (!list) return;

    if (activeMainTab === 'tareas') {
      const res = await apiRequest(`${API_BASE_URL}/tareas?employeeId=${usuarioAutenticado.id}`, { method: 'GET' });
      const tareas = (res?.ok && (Array.isArray(res.data) || Array.isArray(res.data?.tareas)))
        ? (res.data.tareas || res.data)
        : [];

      const filtered = tareas.filter(t => {
        const st = (t.estado || '').toLowerCase();
        if (activeSubFilter === 'por_hacer') return st === 'por hacer' || st === 'todo' || st === 'nueva';
        if (activeSubFilter === 'pendientes') return st === 'en proceso' || st === 'pendiente';
        if (activeSubFilter === 'completadas') return st === 'completada' || st === 'finalizada';
        return true;
      });

      if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; font-size:11px; color:#4b5563; margin-top:20px;">Sin tareas en esta categoría.</p>`;
      } else {
        list.innerHTML = '';
        filtered.forEach(t => {
          const item = document.createElement('div');
          item.style.cssText = 'background:#111827; border:1px solid #1f2937; border-radius:8px; padding:10px; font-size:11px; display:flex; flex-direction:column; gap:6px;';
          
          const isDone = (t.estado || '').toLowerCase().includes('completa');

          item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:#f1f5f9; font-size:11px;">${t.titulo || t.descripcion}</strong>
              <span style="font-size:9px; background:#1e1b4b; color:#818cf8; padding:2px 6px; border-radius:4px;">
                📁 ${t.proyectos?.nombre || t.proyecto_nombre || 'General'}
              </span>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <span style="font-size:9px; color:#9ca3af;">Estado: <b style="color:${isDone ? '#4ade80' : '#fbbf24'};">${t.estado}</b></span>
              ${!isDone ? `
                <button class="btn-review" data-id="${t.id}" data-title="${t.titulo || t.descripcion}" style="background:#2563eb; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:9px; font-weight:bold; cursor:pointer;">
                  🚀 Enviar a Revisión
                </button>
              ` : ''}
            </div>
          `;

          list.appendChild(item);
        });

        // Event listener para enviar tareas a revisión
        document.querySelectorAll('.btn-review').forEach(btn => {
          btn.onclick = async (e) => {
            const taskId = e.target.dataset.id;
            const taskTitle = e.target.dataset.title;

            const resRev = await apiRequest(`${API_BASE_URL}/revisiones`, {
              method: 'POST',
              body: JSON.stringify({
                taskId,
                taskTitle,
                employeeId: usuarioAutenticado.id,
                employeeName: usuarioAutenticado.nombre || usuarioAutenticado.name
              })
            });

            if (resRev?.ok) {
              alert('✅ Solicitud de revisión enviada al Administrador');
              loadData();
            } else {
              alert('Error enviando la revisión');
            }
          };
        });
      }
    } else {
      list.innerHTML = `<p style="text-align:center; font-size:11px; color:#4b5563; margin-top:20px;">Sin reuniones programadas.</p>`;
    }
  }

  // Cargar sesión inicial (recuperando tanto el usuario como el token JWT)
  chrome.storage.local.get(['session_user', 'jwt_token', 'todaySeconds'], (res) => {
    if (res?.session_user?.id && res?.jwt_token) {
      usuarioAutenticado = res.session_user;
      jwtToken = res.jwt_token;
      todaySeconds = res.todaySeconds || 0;

      if (logoutBtn) logoutBtn.style.display = 'block';
      renderDashboard();
    } else {
      renderLogin();
    }
  });

  function handleLogout() {
    if (timerInterval) clearInterval(timerInterval);
    chrome.storage.local.remove(['session_user', 'jwt_token', 'todaySeconds'], () => {
      usuarioAutenticado = null;
      jwtToken = null;
      if (logoutBtn) logoutBtn.style.display = 'none';
      renderLogin();
    });
  }

  if (logoutBtn) {
    logoutBtn.onclick = handleLogout;
  }
});