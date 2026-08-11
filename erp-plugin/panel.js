document.addEventListener('DOMContentLoaded', () => {
  let usuarioAutenticado = null;
  let activeMainTab = 'tareas';
  let activeSubFilter = 'por_hacer';

  const screenContainer = document.getElementById('screen-container');
  const logoutBtn = document.getElementById('btn-logout');
  const popoutBtn = document.getElementById('btn-popout');

  // Botón para desplegar en ventana flotante (Opción B)
  popoutBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP_WINDOW' });
  };

  function apiRequest(url, options) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'API_REQUEST', url, options }, (res) => {
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
      const username = document.getElementById('c-user').value.trim();
      const password = document.getElementById('c-pass').value.trim();
      if (!username || !password) return alert('Ingresa tus datos.');

      const res = await apiRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const user = res?.data?.user ?? res?.data;
      if (res?.ok && user?.id) {
        usuarioAutenticado = user;
        chrome.storage.local.set({ session_user: usuarioAutenticado });
        logoutBtn.style.display = 'block';
        renderDashboard();
      } else {
        alert(res?.data?.message || res?.error || 'Credenciales incorrectas.');
      }
    };
  }

  async function renderDashboard() {
    if (!usuarioAutenticado?.id) return renderLogin();

    screenContainer.innerHTML = `
      <div style="background:#111827; border:1px solid #1f2937; border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <div style="font-size:18px;">👨‍💻</div>
        <div style="flex:1; overflow:hidden;">
          <h4 style="margin:0; font-size:12px; color:#fff;">${usuarioAutenticado.name || 'Empleado'}</h4>
          <p style="margin:0; font-size:10px; color:#3b82f6;">${usuarioAutenticado.role || 'Personal'}</p>
        </div>
      </div>

      <div style="display:flex; background:#111827; border-radius:8px; padding:3px; gap:4px; margin-bottom:10px;">
        <button id="tab-tareas" style="flex:1; padding:6px; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">📋 Tareas</button>
        <button id="tab-reuniones" style="flex:1; padding:6px; border:none; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">📅 Reuniones</button>
      </div>

      <div style="display:flex; justify-content:space-between; gap:4px; margin-bottom:12px;">
        <button id="sub-por_hacer" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Por hacer</button>
        <button id="sub-pendientes" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Pendientes</button>
        <button id="sub-completadas" style="flex:1; padding:4px; border:1px solid #1f2937; border-radius:6px; font-size:9px; font-weight:600; cursor:pointer;">Completadas</button>
      </div>

      <div id="c-contentList" style="flex:1; display:flex; flex-direction:column; gap:8px; overflow-y:auto;"></div>
    `;

    setupEvents();
    updateStyles();
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

  async function loadData() {
    const list = document.getElementById('c-contentList');
    if (!list) return;

    if (activeMainTab === 'tareas') {
      const res = await apiRequest(`http://localhost:3000/api/tareas?empleadoId=${usuarioAutenticado.id}`, { method: 'GET' });
      const tareas = (res?.ok && Array.isArray(res.data)) ? res.data : [];

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
          item.style.cssText = 'background:#111827; border:1px solid #1f2937; border-radius:8px; padding:10px; font-size:11px;';
          item.innerHTML = `
            <div style="font-weight:600; color:#f1f5f9; margin-bottom:4px;">${t.titulo || t.descripcion}</div>
            <div style="font-size:9px; color:#9ca3af;">Estado: <b style="color:#fbbf24;">${t.estado}</b></div>
          `;
          list.appendChild(item);
        });
      }
    } else {
      list.innerHTML = `<p style="text-align:center; font-size:11px; color:#4b5563; margin-top:20px;">Sin reuniones programadas.</p>`;
    }
  }

  // Cargar sesión inicial
  chrome.storage.local.get(['session_user'], (res) => {
    if (res?.session_user?.id) {
      usuarioAutenticado = res.session_user;
      logoutBtn.style.display = 'block';
      renderDashboard();
    } else {
      renderLogin();
    }
  });

  logoutBtn.onclick = () => {
    chrome.storage.local.remove('session_user', () => {
      usuarioAutenticado = null;
      logoutBtn.style.display = 'none';
      renderLogin();
    });
  };
});