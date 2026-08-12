document.addEventListener('DOMContentLoaded', () => {
  let usuarioAutenticado = null;
  let jwtToken = null;
  let activeMainTab = 'tareas';
  let activeSubFilter = 'por_hacer';

  // ⏱️ Variables para el Timer Automático
  let timerInterval = null;
  let todaySeconds = 0;
  let lastSyncTimestamp = Date.now();
  const MAX_DAILY_SECONDS = 5 * 3600; // 5 Horas = 18,000s

  // 🌐 Carga dinámica de URL de API (Fallback a localhost)
  let API_BASE_URL = "http://localhost:3000/api";
  chrome.storage.local.get(['custom_api_url'], (res) => {
    if (res?.custom_api_url) {
      API_BASE_URL = res.custom_api_url.replace(/\/+$/, '');
    }
  });

  const screenContainer = document.getElementById('screen-container');
  const logoutBtn = document.getElementById('btn-logout');
  const popoutBtn = document.getElementById('btn-popout');

  // Abrir extensión en ventana flotante
  if (popoutBtn) {
    popoutBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP_WINDOW' });
    };
  }

  // 🔒 Cliente de red inyectando Token JWT
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

  // ==========================================
  // 1. RENDERIZADO DEL LOGIN
  // ==========================================
  function renderLogin() {
    if (!screenContainer) return;

    screenContainer.innerHTML = `
      <div class="login-container">
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Acceso de Empleados</h3>
          <p style="font-size: 11px; color: #94a3b8;">Sincroniza tus tareas y jornada de trabajo</p>
        </div>

        <div class="form-group">
          <label class="form-label">Usuario o Correo</label>
          <input type="text" id="c-user" placeholder="usuario o correo@empresa.com" class="form-input">
        </div>

        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input type="password" id="c-pass" placeholder="••••••••" class="form-input">
        </div>

        <button id="c-btnLogin" class="btn-submit">Conectar al ERP</button>
      </div>
    `;

    document.getElementById('c-btnLogin').onclick = async () => {
      const email = document.getElementById('c-user').value.trim();
      const password = document.getElementById('c-pass').value.trim();
      if (!email || !password) return alert('Por favor ingresa tus credenciales.');

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
        if (logoutBtn) logoutBtn.style.display = 'flex';
        renderDashboard();
      } else {
        alert(res?.data?.error || res?.data?.message || res?.error || 'Credenciales incorrectas.');
      }
    };
  }

  // ==========================================
  // 2. RENDERIZADO DEL DASHBOARD
  // ==========================================
  async function renderDashboard() {
    if (!screenContainer) return;
    if (!usuarioAutenticado?.id || !jwtToken) return renderLogin();
// Reemplaza estas líneas al inicio de renderDashboard() en panel.js:

const rolLower = (usuarioAutenticado.rol || usuarioAutenticado.role || '').toLowerCase().trim();

// Detectar categoría
const isServicio = rolLower.includes('servicio') || rolLower.includes('ss');
const isPracticas = rolLower.includes('practicante') || rolLower.includes('práctica') || rolLower.includes('practica') || rolLower.includes('pp');
const isEstudiante = isServicio || isPracticas;

// Priorizar las horas por rol (PP = 250, SS = 480)
const targetHours = isPracticas ? 250 : (isServicio ? 480 : (usuarioAutenticado.horas_totales_objetivo || 480));

// Actualizar en el objeto local
usuarioAutenticado.horas_totales_objetivo = targetHours;

    screenContainer.innerHTML = `
      <!-- Tarjeta de Usuario -->
      <div class="user-card">
        <div class="avatar">
          ${(usuarioAutenticado.nombre || usuarioAutenticado.name || 'E').charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
          <div class="user-name">${usuarioAutenticado.nombre || usuarioAutenticado.name || 'Empleado'}</div>
          <div class="user-role-container">
            <div class="status-dot"></div>
            <span class="user-role">${usuarioAutenticado.rol || usuarioAutenticado.role || 'Personal'}</span>
          </div>
        </div>
      </div>

      <!-- Widget de Timer Automático -->
      <div id="timer-box" class="timer-widget" style="display: ${isEstudiante ? 'block' : 'none'};">
        <div class="timer-header">
          <span>⏱️ Jornada Diaria (Máx 5h)</span>
          <span id="timer-status" class="timer-badge">🟢 Contando</span>
        </div>

        <div id="timer-display" class="timer-clock">00:00:00</div>

        <div class="timer-footer">
          <span>Acumulado Total:</span>
          <strong id="total-hours-text" style="color: #a5b4fc;">0.0 / ${targetHours} hrs</strong>
        </div>

        <div class="progress-bar-bg">
          <div id="progress-fill" class="progress-bar-fill"></div>
        </div>
      </div>

      <!-- Pestañas Principales -->
      <div class="tabs-container">
        <button id="tab-tareas" class="tab-btn">📋 Tareas</button>
        <button id="tab-reuniones" class="tab-btn">📅 Reuniones</button>
      </div>

      <!-- Sub-filtros de Tareas -->
      <div id="subfilters-container" class="subfilters-grid">
        <button id="sub-por_hacer" class="subfilter-btn">Por hacer</button>
        <button id="sub-pendientes" class="subfilter-btn">Pendientes</button>
        <button id="sub-completadas" class="subfilter-btn">Completadas</button>
      </div>

      <!-- Contenedor Dinámico -->
      <div id="c-contentList" class="content-list"></div>
    `;

    setupEvents();
    updateStyles();

    if (isEstudiante) {
      setupAutoTimer(targetHours);
    }

    await loadData();
  }

  // ==========================================
  // 3. SELECCIÓN Y ESTILOS DE PESTAÑAS
  // ==========================================
  function setupEvents() {
    const btnT = document.getElementById('tab-tareas');
    const btnR = document.getElementById('tab-reuniones');
    if (btnT) btnT.onclick = () => { activeMainTab = 'tareas'; updateStyles(); loadData(); };
    if (btnR) btnR.onclick = () => { activeMainTab = 'reuniones'; updateStyles(); loadData(); };

    ['por_hacer', 'pendientes', 'completadas'].forEach(filter => {
      const btn = document.getElementById(`sub-${filter}`);
      if (btn) btn.onclick = () => { activeSubFilter = filter; updateStyles(); loadData(); };
    });
  }

  function updateStyles() {
    const btnT = document.getElementById('tab-tareas');
    const btnR = document.getElementById('tab-reuniones');
    const subContainer = document.getElementById('subfilters-container');

    if (btnT && btnR) {
      if (activeMainTab === 'tareas') {
        btnT.classList.add('active');
        btnR.classList.remove('active');
        if (subContainer) subContainer.style.display = 'grid';
      } else {
        btnR.classList.add('active');
        btnT.classList.remove('active');
        if (subContainer) subContainer.style.display = 'none';
      }
    }

    ['por_hacer', 'pendientes', 'completadas'].forEach(f => {
      const btn = document.getElementById(`sub-${f}`);
      if (btn) {
        if (activeSubFilter === f) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  // ==========================================
  // 4. TEMPORIZADOR AUTOMÁTICO DE SERVICIO
  // ==========================================
  function setupAutoTimer(targetHours) {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (todaySeconds < MAX_DAILY_SECONDS) {
        todaySeconds++;
        const statusEl = document.getElementById('timer-status');
        if (statusEl) {
          statusEl.innerText = '🟢 Contando';
          statusEl.style.color = '#34d399';
        }
      } else {
        const statusEl = document.getElementById('timer-status');
        if (statusEl) {
          statusEl.innerText = '🛑 Límite diario (5h max)';
          statusEl.style.color = '#f87171';
        }
      }

      const hrs = Math.floor(todaySeconds / 3600).toString().padStart(2, '0');
      const mins = Math.floor((todaySeconds % 3600) / 60).toString().padStart(2, '0');
      const secs = (todaySeconds % 60).toString().padStart(2, '0');

      const timerDisplay = document.getElementById('timer-display');
      if (timerDisplay) timerDisplay.innerText = `${hrs}:${mins}:${secs}`;

      chrome.storage.local.set({ todaySeconds });

      // Sincronizar horas con el servidor cada 60 segundos
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

  // ==========================================
  // 5. CARGA Y DIBUJO DE TAREAS Y REUNIONES
  // ==========================================
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
      if (activeSubFilter === 'por_hacer') return st === 'por hacer' || st === 'todo' || st === 'nueva' || st === 'por_hacer';
      if (activeSubFilter === 'pendientes') return st === 'en proceso' || st === 'pendiente' || st === 'en revisión' || st === 'en_revision';
      if (activeSubFilter === 'completadas') return st === 'completada' || st === 'finalizada';
      return true;
    });

    if (filtered.length === 0) {
      list.innerHTML = `<p style="text-align:center; font-size:11px; color:#64748b; margin-top:24px;">Sin tareas en esta categoría.</p>`;
    } else {
      list.innerHTML = '';
      filtered.forEach(t => {
        const item = document.createElement('div');
        item.className = 'card-item';

        const statusLower = (t.estado || '').toLowerCase();
        const isDone = statusLower.includes('completa');
        const isReview = statusLower.includes('revisi') || statusLower.includes('pendiente');
        
        // Detectar fecha límite vencida
        const hoy = new Date().toISOString().split('T')[0];
        const isOverdue = t.fecha_limite && t.fecha_limite < hoy && !isDone;

        // Determinar badge de estado
        let statusBadgeClass = 'badge-status-pending';
        let statusText = 'Por hacer';

        if (isDone) {
          statusBadgeClass = 'badge-status-completed';
          statusText = '✓ Completada';
        } else if (isReview) {
          statusBadgeClass = 'badge-status-review';
          statusText = '⏳ En revisión';
        } else if (isOverdue) {
          statusBadgeClass = 'badge-status-overdue';
          statusText = '⚠️ Vencida';
        }

        const desc = t.descripcion ? `<div class="card-desc">${t.descripcion}</div>` : '';
        const fechaLim = t.fecha_limite ? `<span>📅 ${t.fecha_limite}</span>` : '<span>📅 Sin fecha límite</span>';
        const proyectoNombre = t.proyectos?.nombre || t.proyecto_nombre || 'General';

        item.innerHTML = `
          <div class="card-header">
            <span class="card-title">${t.titulo || t.descripcion || 'Tarea sin título'}</span>
            <span class="card-badge badge-project">📁 ${proyectoNombre}</span>
          </div>
          
          ${desc}
          
          <div class="card-footer">
            <div class="card-meta">
              <span class="card-badge ${statusBadgeClass}">${statusText}</span>
              ${fechaLim}
            </div>

            ${!isDone && !isReview ? `
              <button class="btn-action btn-review" data-id="${t.id}" data-title="${t.titulo || t.descripcion}">
                🚀 Enviar a revisión
              </button>
            ` : ''}
          </div>
        `;

        list.appendChild(item);
      });

      // Event Listener para enviar solicitudes de revisión
      document.querySelectorAll('.btn-review').forEach(btn => {
        btn.onclick = async (e) => {
          const taskId = e.currentTarget.dataset.id;
          const taskTitle = e.currentTarget.dataset.title;

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
            alert('✅ Tarea enviada a revisión');
            loadData();
          } else {
            alert('Error enviando la tarea a revisión');
          }
        };
      });
    }
  } else {
    // ⬇️ PESTAÑA DE REUNIONES (BLOQUE AJUSTADO)
    const resR = await apiRequest(`${API_BASE_URL}/reuniones?employeeId=${usuarioAutenticado.id}`, { method: 'GET' });
    
    // 1. Extraer el arreglo soportando respuesta directa [...] o envuelta { reuniones: [...] }
    const reuniones = (resR?.ok && (Array.isArray(resR.data) || Array.isArray(resR.data?.reuniones)))
      ? (resR.data.reuniones || resR.data)
      : [];

    if (reuniones.length === 0) {
      list.innerHTML = `<p style="text-align:center; font-size:11px; color:#64748b; margin-top:24px;">Sin reuniones programadas.</p>`;
    } else {
      list.innerHTML = '';
      reuniones.forEach(m => {
        const item = document.createElement('div');
        item.className = 'card-item';

        // 2. Fallbacks de Hora y Fecha desde fecha_inicio por si hora/fecha vienen nulos
        const horaDisplay = m.hora || (m.fecha_inicio ? new Date(m.fecha_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Por definir');
        const fechaDisplay = m.fecha || (m.fecha_inicio ? m.fecha_inicio.split('T')[0] : 'Hoy');

        item.innerHTML = `
          <div class="card-header">
            <span class="card-title" style="color:#a5b4fc;">${m.titulo || 'Reunión de equipo'}</span>
            <span class="card-badge badge-time">⏰ ${horaDisplay}</span>
          </div>

          <div class="card-desc">${m.descripcion || 'Sin orden del día.'}</div>

          <div class="card-footer">
            <div class="card-meta">
              <span>📅 ${fechaDisplay}</span>
            </div>
            ${m.link ? `
              <a href="${m.link}" target="_blank" class="btn-meeting-link">
                🔗 Unirme a sesión
              </a>
            ` : '<span style="font-size:9px; color:#64748b;">Sin enlace asignado</span>'}
          </div>
        `;

        list.appendChild(item);
      });
    }
  }
}

  // ==========================================
  // 6. CONTROL DE SESIÓN Y LOGOUT
  // ==========================================
  chrome.storage.local.get(['session_user', 'jwt_token', 'todaySeconds'], (res) => {
    if (res?.session_user?.id && res?.jwt_token) {
      usuarioAutenticado = res.session_user;
      jwtToken = res.jwt_token;
      todaySeconds = res.todaySeconds || 0;

      if (logoutBtn) logoutBtn.style.display = 'flex';
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