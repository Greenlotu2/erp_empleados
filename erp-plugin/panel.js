document.addEventListener('DOMContentLoaded', () => {
  let usuarioAutenticado = null;
  let jwtToken = null;
  let activeMainTab = 'tareas';
  let activeSubFilter = 'por_hacer';

  // ⏱️ Variables para el Timer Automático
  // 🏆 Evidencia pendiente de adjuntar por tarea (id -> {base64, nombre, tipo}) —
  // se llena al elegir un archivo y se envía junto con "Enviar a Revisión".
  const evidenciasPendientes = new Map();
  const MAX_EVIDENCIA_BYTES = 5 * 1024 * 1024; // 5MB

  let timerInterval = null;
  let todaySeconds = 0;
  let lastSyncTimestamp = Date.now();
  let lastSyncedSeconds = 0; // 🛡️ Fix #5: Marca hasta dónde ya se sincronizó realmente
  let syncInProgress = false; // 🛡️ Fix #9: Candado para evitar carreras y errores de null
  const SYNC_INTERVAL_MS = 15000; // ⏱️ Fix #7: Cada 15s
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
  const refreshBtn = document.getElementById('btn-refresh');

  // Abrir extensión en ventana flotante
  if (popoutBtn) {
    popoutBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP_WINDOW' });
    };
  }

  // 🔄 Actualizar manualmente (tareas/reuniones/puntos de la pestaña activa)
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      if (!usuarioAutenticado || refreshBtn.disabled) return;
      refreshBtn.disabled = true;
      refreshBtn.classList.add('spinning');
      await loadData();
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
      }, 400);
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
        <div style="text-align: center; margin-bottom: 10px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 2px;">Acceso de Empleados</h3>
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

    const rolLower = (usuarioAutenticado.rol || usuarioAutenticado.role || '').toLowerCase().trim();

    // Detectar categoría
    const isServicio = rolLower.includes('servicio') || rolLower.includes('ss');
    const isPracticas = rolLower.includes('practicante') || rolLower.includes('práctica') || rolLower.includes('practica') || rolLower.includes('pp');
    const isEstudiante = isServicio || isPracticas;

    // Priorizar horas por rol (PP = 250, SS = 480)
    const targetHours = isPracticas ? 250 : (isServicio ? 480 : (usuarioAutenticado.horas_totales_objetivo || 480));
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
        <span id="rewards-badge" class="rewards-badge" title="Puntos de recompensa">🏆 ${usuarioAutenticado.puntos_recompensa || 0} pts</span>
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
        <button id="tab-recompensas" class="tab-btn">🏆 Puntos</button>
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
    const btnP = document.getElementById('tab-recompensas');
    if (btnT) btnT.onclick = () => { activeMainTab = 'tareas'; updateStyles(); loadData(); };
    if (btnR) btnR.onclick = () => { activeMainTab = 'reuniones'; updateStyles(); loadData(); };
    if (btnP) btnP.onclick = () => { activeMainTab = 'recompensas'; updateStyles(); loadData(); };

    ['por_hacer', 'pendientes', 'completadas'].forEach(filter => {
      const btn = document.getElementById(`sub-${filter}`);
      if (btn) btn.onclick = () => { activeSubFilter = filter; updateStyles(); loadData(); };
    });
  }

  function updateStyles() {
    const btnT = document.getElementById('tab-tareas');
    const btnR = document.getElementById('tab-reuniones');
    const btnP = document.getElementById('tab-recompensas');
    const subContainer = document.getElementById('subfilters-container');

    if (btnT && btnR && btnP) {
      [btnT, btnR, btnP].forEach(b => b.classList.remove('active'));
      if (activeMainTab === 'tareas') {
        btnT.classList.add('active');
        if (subContainer) subContainer.style.display = 'grid';
      } else {
        (activeMainTab === 'reuniones' ? btnR : btnP).classList.add('active');
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

    // 🛡️ Fix #4: Avisar a background.js que el panel está activo
    chrome.runtime.sendMessage({ type: 'PANEL_ACTIVE', employeeId: usuarioAutenticado?.id });

    timerInterval = setInterval(() => {
      const ahora = new Date();
      const horaActual = ahora.getHours();
      const esHorarioLaboral = horaActual >= 9 && horaActual < 17; // ⏰ 9 AM a 5 PM

      const statusEl = document.getElementById('timer-status');

      if (!esHorarioLaboral) {
        if (statusEl) {
          statusEl.innerText = '⏸️ Fuera de horario (9am-5pm)';
          statusEl.style.color = '#fbbf24';
        }
      } else if (todaySeconds < MAX_DAILY_SECONDS) {
        todaySeconds++;
        if (statusEl) {
          statusEl.innerText = '🟢 Contando';
          statusEl.style.color = '#34d399';
        }
      } else {
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

      // Sincronizar horas con el servidor cada SYNC_INTERVAL_MS (15s)
      if (Date.now() - lastSyncTimestamp >= SYNC_INTERVAL_MS) {
        syncHoursToBackend(targetHours, todaySeconds);
        lastSyncTimestamp = Date.now();
      }

      const accumulatedHours = (usuarioAutenticado?.horas_acumuladas || 0) + (todaySeconds / 3600);
      const percent = Math.min(Math.round((accumulatedHours / targetHours) * 100), 100);

      const totalText = document.getElementById('total-hours-text');
      const progressFill = document.getElementById('progress-fill');
      if (totalText) totalText.innerText = `${accumulatedHours.toFixed(1)} / ${targetHours} hrs (${percent}%)`;
      if (progressFill) progressFill.style.width = `${percent}%`;

    }, 1000);
  }

  async function syncHoursToBackend(targetHours, currentTodaySeconds) {
    // 🛡️ Fix #9: Evitar colisiones de sync simultáneas
    if (!usuarioAutenticado?.id || syncInProgress) return;

    const secondsToSync = currentTodaySeconds - lastSyncedSeconds;
    if (secondsToSync <= 0) return;

    syncInProgress = true;
    const incrementHours = secondsToSync / 3600;

    try {
      // Incremento ATÓMICO en el servidor — se manda solo el delta, no el total.
      // Así el panel y el background pueden sincronizar sin pisarse.
      const res = await apiRequest(`${API_BASE_URL}/empleados/horas`, {
        method: 'PATCH',
        body: JSON.stringify({
          employeeId: usuarioAutenticado.id,
          deltaHoras: parseFloat(incrementHours.toFixed(6)),
          targetHours
        })
      });

      // 🛡️ Fix #9: Verificar que el usuario no haya cerrado sesión mientras esperaba
      if (!usuarioAutenticado) return;

      if (res?.ok) {
        // El servidor devuelve el nuevo total ya sumado atómicamente.
        const total = res?.data?.horas_acumuladas;
        usuarioAutenticado.horas_acumuladas =
          typeof total === 'number'
            ? total
            : (usuarioAutenticado.horas_acumuladas || 0) + incrementHours;
        lastSyncedSeconds = currentTodaySeconds; // ✅ Fix #5: Solo avanza si el servidor confirmó éxito
        chrome.storage.local.set({ session_user: usuarioAutenticado });
      } else {
        console.warn('Sync de horas no confirmado, se reintentará en el próximo ciclo.');
      }
    } catch (err) {
      console.error('Error sincronizando horas:', err);
    } finally {
      syncInProgress = false;
    }
  }

  // 🏆 Actualiza el badge de puntos (y lo persiste) cada vez que llega un valor
  // fresco del servidor — los puntos se otorgan por trigger al completar tareas,
  // así que se refrescan solos en cada carga sin necesitar un endpoint aparte.
  function actualizarPuntosUI(puntos) {
    if (typeof puntos !== 'number' || !usuarioAutenticado) return;
    usuarioAutenticado.puntos_recompensa = puntos;
    const el = document.getElementById('rewards-badge');
    if (el) el.textContent = `🏆 ${puntos} pts`;
    chrome.storage.local.set({ session_user: usuarioAutenticado });
  }

  // 🏆 Mismos umbrales de nivel que Panel Principal (src/app/page.tsx,
  // NIVELES_RECOMPENSA) — que coincidan es lo que hace que un empleado vea el mismo
  // nivel en la extensión y en el CRM web.
  const NIVELES_RECOMPENSA = [
    { min: 0, label: 'Bronce', icon: '🥉' },
    { min: 300, label: 'Plata', icon: '🥈' },
    { min: 800, label: 'Oro', icon: '🥇' },
    { min: 1500, label: 'Diamante', icon: '💎' },
  ];

  function getNivelRecompensa(puntos) {
    let actual = NIVELES_RECOMPENSA[0];
    let siguiente = null;
    for (let i = 0; i < NIVELES_RECOMPENSA.length; i++) {
      if (puntos >= NIVELES_RECOMPENSA[i].min) {
        actual = NIVELES_RECOMPENSA[i];
        siguiente = NIVELES_RECOMPENSA[i + 1] || null;
      }
    }
    const progresoPct = siguiente
      ? Math.min(100, Math.round(((puntos - actual.min) / (siguiente.min - actual.min)) * 100))
      : 100;
    return { actual, siguiente, progresoPct };
  }

  // Mismo catálogo (visual, sin canje real todavía) que Panel Principal.
  const CATALOGO_RECOMPENSAS = [
    { icon: '🛒', label: 'Vale de Despensa', desc: 'Apoyo para compras de despensa en supermercados.', cost: 400 },
    { icon: '⛽', label: 'Tarjeta / Vale de Gasolina', desc: 'Apoyo para transporte y movilidad diaria.', cost: 400 },
    { icon: '📚', label: 'Curso o Certificación Profesional', desc: 'Pago de capacitación técnica o profesional.', cost: 900 },
    { icon: '🎟️', label: 'Día Libre', desc: 'Un día de descanso adicional pagado.', cost: 2500 },
    { icon: '🏆', label: 'Bono Colectivo de Equipo', desc: 'Premio acumulativo por cumplimiento de hitos del área o proyecto.', cost: null },
  ];

  function formatFechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async function renderRecompensas(list) {
    const res = await apiRequest(`${API_BASE_URL}/recompensas?employeeId=${usuarioAutenticado.id}`, { method: 'GET' });

    if (!res?.ok) {
      list.innerHTML = `<p style="text-align:center; font-size:11px; color:#64748b; margin-top: 12px;">No se pudo cargar tus recompensas.</p>`;
      return;
    }

    const puntos = res.data?.puntosRecompensa || 0;
    const historial = res.data?.historial || [];
    actualizarPuntosUI(puntos);

    const { actual, siguiente, progresoPct } = getNivelRecompensa(puntos);

    const historialHtml = historial.length === 0
      ? `<p style="font-size:10px; color:#64748b; padding: 2px 2px;">Todavía no has ganado puntos — se otorgan al completar tareas.</p>`
      : historial.map(h => `
          <div style="display:flex; align-items:center; justify-content:space-between; background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding: 4px 6px; gap: 4px;">
            <span style="font-size:10px; color:#e2e8f0; flex:1; min-width:0;">${h.motivo}</span>
            <div style="display:flex; align-items:center; gap: 3px; flex-shrink:0;">
              <span style="font-size:10px; font-weight:700; color:#6ee7b7;">+${h.puntos} pts</span>
              <span style="font-size:9px; color:#64748b; font-family:monospace;">${formatFechaCorta(h.created_at)}</span>
            </div>
          </div>
        `).join('');

    const catalogoHtml = CATALOGO_RECOMPENSAS.map(item => `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding: 4px 6px; gap: 4px;">
        <div style="display:flex; align-items:flex-start; gap: 4px; min-width:0;">
          <span>${item.icon}</span>
          <span style="min-width:0;">
            <span style="display:block; font-size:11px; font-weight:700; color:#f8fafc;">${item.label}</span>
            <span style="display:block; font-size:9px; color:#94a3b8; margin-top: 2px; line-height:1.3;">${item.desc}</span>
          </span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap: 2px; flex-shrink:0;">
          <span style="font-size:9px; font-weight:700; color:#fcd34d; white-space:nowrap;">${item.cost !== null ? `⭐ ${item.cost} pts` : 'Según equipo'}</span>
          <button disabled title="Próximamente" style="font-size:9px; font-weight:700; background:#1e293b; color:#64748b; padding: 2px 4px; border:none; border-radius:6px; cursor:not-allowed;">Canjear</button>
        </div>
      </div>
    `).join('');

    list.innerHTML = `
      <div style="background:linear-gradient(135deg, #4338ca, #2563eb); border-radius:12px; padding: 8px; display:flex; flex-direction:column; gap: 6px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <p style="font-size:9px; font-weight:700; color:#c7d2fe; text-transform:uppercase; letter-spacing:0.5px;">Tus puntos</p>
            <p style="font-size:20px; font-weight:800; color:#fff; margin-top: 2px;">⭐ ${puntos} pts</p>
          </div>
          <span style="font-size:10px; font-weight:700; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25); color:#fff; padding: 2px 6px; border-radius:999px; white-space:nowrap;">
            ${actual.icon} Nivel ${actual.label}
          </span>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:9px; font-weight:600; color:#c7d2fe; margin-bottom: 2px;">
            <span>${siguiente ? `Progreso a Nivel ${siguiente.label}` : 'Nivel máximo alcanzado'}</span>
            <span>${siguiente ? `${puntos} / ${siguiente.min} pts` : `${puntos} pts`}</span>
          </div>
          <div style="width:100%; height:6px; background:rgba(255,255,255,0.2); border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${progresoPct}%; background:#fff; border-radius:999px;"></div>
          </div>
        </div>
      </div>

      <p style="font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin: 6px 0 3px;">Historial de puntos</p>
      <div style="display:flex; flex-direction:column; gap: 3px;">${historialHtml}</div>

      <p style="font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin: 8px 0 3px; display:flex; align-items:center; gap: 3px;">
        Catálogo de Recompensas
        <span style="font-size:8px; font-weight:700; background:rgba(245,158,11,0.15); color:#fcd34d; border:1px solid rgba(245,158,11,0.3); padding: 2px 3px; border-radius:999px; text-transform:none;">Pendiente</span>
      </p>
      <div style="display:flex; flex-direction:column; gap: 3px;">${catalogoHtml}</div>
    `;
  }

  // Convierte un File a base64 (sin el prefijo "data:...;base64,") para mandarlo
  // dentro del JSON de apiRequest — chrome.runtime.sendMessage no transporta bien
  // FormData/Blob entre el panel y el service worker.
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==========================================
  // 5. CARGA Y DIBUJO DE TAREAS Y REUNIONES
  // ==========================================
  async function loadData() {
    const list = document.getElementById('c-contentList');
    if (!list) return;

    if (activeMainTab === 'recompensas') {
      await renderRecompensas(list);
      return;
    }

    if (activeMainTab === 'tareas') {
      const res = await apiRequest(`${API_BASE_URL}/tareas?employeeId=${usuarioAutenticado.id}`, { method: 'GET' });
      const tareas = (res?.ok && (Array.isArray(res.data) || Array.isArray(res.data?.tareas)))
        ? (res.data.tareas || res.data)
        : [];

      if (res?.ok && typeof res.data?.puntosRecompensa === 'number') {
        actualizarPuntosUI(res.data.puntosRecompensa);
      }

      const hoyFiltro = new Date().toISOString().split('T')[0];

      const filtered = tareas.filter(t => {
        const st = (t.estado || '').toLowerCase();
        const avance = t.porcentaje_avance ?? 0;
        const isDoneFiltro = st.includes('completa');
        const isOverdueFiltro = t.fecha_limite && t.fecha_limite < hoyFiltro && !isDoneFiltro;

        // Las tareas nuevas siempre se crean como 'En Proceso' (ningún flujo del CRM
        // usa 'Por Hacer' como estado real) — se usa el avance para distinguir "sin
        // empezar" (Por Hacer) de "con avance" (Pendientes) dentro de ese mismo estado.
        // Las vencidas necesitan atención inmediata, así que también caen en "Por Hacer"
        // sin importar su avance.
        if (activeSubFilter === 'por_hacer') {
          return st === 'por hacer' || st === 'todo' || st === 'nueva' || st === 'por_hacer' ||
            (st === 'en proceso' && (avance === 0 || isOverdueFiltro));
        }
        if (activeSubFilter === 'pendientes') {
          return st === 'pendiente' || st === 'en revisión' || st === 'en_revision' ||
            (st === 'en proceso' && avance > 0 && !isOverdueFiltro);
        }
        if (activeSubFilter === 'completadas') return st === 'completada' || st === 'finalizada';
        return true;
      });

      if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; font-size:11px; color:#64748b; margin-top: 12px;">Sin tareas en esta categoría.</p>`;
      } else {
        list.innerHTML = '';
        filtered.forEach(t => {
          const item = document.createElement('div');
          item.className = 'card-item';

          const statusLower = (t.estado || '').toLowerCase();
          const isDone = statusLower.includes('completa');
          const isReview = statusLower.includes('revisi') || statusLower.includes('pendiente');
          
          const hoy = new Date().toISOString().split('T')[0];
          const isOverdue = t.fecha_limite && t.fecha_limite < hoy && !isDone;

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
                <div class="card-actions">
                  <label class="btn-attach${evidenciasPendientes.has(String(t.id)) ? ' has-file' : ''}" title="Adjuntar evidencia (opcional, máx. 5MB)">
                    📎
                    <input type="file" class="file-evidencia" data-id="${t.id}" style="display:none">
                  </label>
                  <span class="evidence-name" data-id="${t.id}">${evidenciasPendientes.get(String(t.id))?.nombre || ''}</span>
                  <button class="btn-action btn-review" data-id="${t.id}" data-title="${t.titulo || t.descripcion}">
                    🚀 Enviar a Revisión
                  </button>
                </div>
              ` : ''}
            </div>
          `;

          list.appendChild(item);
        });

        document.querySelectorAll('.file-evidencia').forEach(input => {
          input.onchange = async (e) => {
            const id = e.target.dataset.id;
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > MAX_EVIDENCIA_BYTES) {
              alert('El archivo supera los 5MB permitidos como evidencia.');
              e.target.value = '';
              return;
            }

            const base64 = await fileToBase64(file);
            evidenciasPendientes.set(id, { base64, nombre: file.name, tipo: file.type });

            const nameEl = document.querySelector(`.evidence-name[data-id="${id}"]`);
            if (nameEl) nameEl.textContent = file.name;
            e.target.closest('.btn-attach')?.classList.add('has-file');
          };
        });

        document.querySelectorAll('.btn-review').forEach(btn => {
          btn.onclick = async (e) => {
            const target = e.currentTarget;
            // 🛡️ Evita doble envío: un doble clic rápido antes de que loadData()
            // vuelva a pintar la lista disparaba dos POST a /api/revisiones (bug real
            // detectado: dos filas duplicadas en `revisiones`/`notificaciones`).
            if (target.disabled) return;
            target.disabled = true;
            target.style.opacity = '0.6';
            target.style.cursor = 'not-allowed';
            const textoOriginal = target.textContent;
            target.textContent = 'Enviando...';

            const taskId = target.dataset.id;
            const taskTitle = target.dataset.title;
            const evidencia = evidenciasPendientes.get(taskId);

            const resRev = await apiRequest(`${API_BASE_URL}/revisiones`, {
              method: 'POST',
              body: JSON.stringify({
                taskId,
                taskTitle,
                employeeId: usuarioAutenticado.id,
                employeeName: usuarioAutenticado.nombre || usuarioAutenticado.name,
                ...(evidencia ? {
                  evidenciaBase64: evidencia.base64,
                  evidenciaNombre: evidencia.nombre,
                  evidenciaTipo: evidencia.tipo,
                } : {})
              })
            });

            if (resRev?.ok) {
              evidenciasPendientes.delete(taskId);
              alert('🚀 Tarea enviada a revisión' + (evidencia ? ' con evidencia adjunta' : ''));
              loadData();
            } else {
              alert('Error al enviar la tarea a revisión' + (resRev?.data?.error ? `: ${resRev.data.error}` : ''));
              target.disabled = false;
              target.style.opacity = '';
              target.style.cursor = '';
              target.textContent = textoOriginal;
            }
          };
        });
      }
    } else {
      const resR = await apiRequest(`${API_BASE_URL}/reuniones?employeeId=${usuarioAutenticado.id}`, { method: 'GET' });
      
      const reuniones = (resR?.ok && (Array.isArray(resR.data) || Array.isArray(resR.data?.reuniones)))
        ? (resR.data.reuniones || resR.data)
        : [];

      if (reuniones.length === 0) {
        list.innerHTML = `<p style="text-align:center; font-size:11px; color:#64748b; margin-top: 12px;">Sin reuniones programadas.</p>`;
      } else {
        list.innerHTML = '';
        reuniones.forEach(m => {
          const item = document.createElement('div');
          item.className = 'card-item';

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
      lastSyncedSeconds = todaySeconds;

      if (logoutBtn) logoutBtn.style.display = 'flex';
      renderDashboard();
    } else {
      renderLogin();
    }
  });

  async function handleLogout() {
    if (timerInterval) clearInterval(timerInterval);

    // 🛡️ Fix #6: Sync final con await para no perder segundos al cerrar sesión
    if (usuarioAutenticado?.id && todaySeconds > lastSyncedSeconds) {
      const targetHours = usuarioAutenticado.horas_totales_objetivo || 480;
      await syncHoursToBackend(targetHours, todaySeconds);
    }

    chrome.runtime.sendMessage({ type: 'PANEL_INACTIVE', employeeId: usuarioAutenticado?.id });
    chrome.storage.local.remove(['session_user', 'jwt_token', 'todaySeconds', 'turnoActivo', 'inicioTurnoTimestamp'], () => {
      usuarioAutenticado = null;
      jwtToken = null;
      if (logoutBtn) logoutBtn.style.display = 'none';
      renderLogin();
    });
  }

  if (logoutBtn) {
    logoutBtn.onclick = handleLogout;
  }

  // 🛡️ Fix #4: Avisar a background.js que el panel se cerró para que retome el conteo
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type: 'PANEL_INACTIVE', employeeId: usuarioAutenticado?.id });
  });
});