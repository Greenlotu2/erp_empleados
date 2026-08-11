(function () {
  // Evita doble inyección
  if (document.getElementById('erp-persistent-panel')) return;

  let usuarioAutenticado = null;

  // ── Panel flotante ──────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'erp-persistent-panel';
  panel.setAttribute('style', `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 340px !important;
    height: 520px !important;
    z-index: 2147483647 !important;
    background-color: #0b0f19 !important;
    border: 1px solid #1f2937 !important;
    border-radius: 16px !important;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5) !important;
    padding: 16px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    color: #ffffff !important;
  `);

  // ── Cabecera ────────────────────────────────────────────────
  const panelHeader = document.createElement('div');
  Object.assign(panelHeader.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid #1f2937', paddingBottom: '8px',
    marginBottom: '12px', userSelect: 'none'
  });

  const title = document.createElement('span');
  title.innerText = 'ERP EMPLEADOS';
  Object.assign(title.style, { fontSize: '10px', fontWeight: '800', color: '#9ca3af' });

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '10px', alignItems: 'center' });

  const logoutBtn = document.createElement('button');
  logoutBtn.innerText = 'SALIR';
  Object.assign(logoutBtn.style, {
    cursor: 'pointer', color: '#ffffff', fontSize: '10px',
    backgroundColor: '#dc2626', border: 'none',
    padding: '4px 8px', borderRadius: '4px',
    fontWeight: 'bold', display: 'none'
  });

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✖';
  Object.assign(closeBtn.style, {
    cursor: 'pointer', color: '#9ca3af', fontSize: '14px',
    background: 'none', border: 'none', padding: '0'
  });
  closeBtn.onclick = () => { panel.style.display = 'none'; };

  actions.appendChild(logoutBtn);
  actions.appendChild(closeBtn);
  panelHeader.appendChild(title);
  panelHeader.appendChild(actions);
  panel.appendChild(panelHeader);

  // ── Contenedor de pantallas ─────────────────────────────────
  const screenContainer = document.createElement('div');
  screenContainer.style.flex = '1';
  screenContainer.style.display = 'flex';
  screenContainer.style.flexDirection = 'column';
  panel.appendChild(screenContainer);

  // ── Comunicación con background.js ──────────────────────────
  function apiRequest(url, options) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'API_REQUEST', url, options }, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: 'Service worker no disponible' });
            } else {
              resolve(res || { ok: false, error: 'Sin respuesta del servidor' });
            }
          });
        } else {
          resolve({ ok: false, error: 'Contexto del plugin inválido' });
        }
      } catch (e) {
        resolve({ ok: false, error: 'Error de comunicación interna' });
      }
    });
  }

  // ── Pantalla de login ───────────────────────────────────────
  function renderLogin() {
    screenContainer.innerHTML = '';

    const box = document.createElement('div');
    Object.assign(box.style, {
      display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '40px'
    });

    const h3 = document.createElement('h3');
    h3.innerText = 'ERP Empleados';
    Object.assign(h3.style, {
      margin: '0', fontSize: '16px', textAlign: 'center', color: '#ffffff'
    });

    const inputUser = document.createElement('input');
    inputUser.type = 'text';
    inputUser.placeholder = 'Usuario o Correo';
    Object.assign(inputUser.style, {
      padding: '10px', borderRadius: '8px', border: '1px solid #374151',
      backgroundColor: '#111827', color: '#ffffff', fontSize: '13px'
    });

    const inputPass = document.createElement('input');
    inputPass.type = 'password';
    inputPass.placeholder = 'Contraseña';
    Object.assign(inputPass.style, {
      padding: '10px', borderRadius: '8px', border: '1px solid #374151',
      backgroundColor: '#111827', color: '#ffffff', fontSize: '13px'
    });

    const btnLogin = document.createElement('button');
    btnLogin.innerText = 'Conectar al ERP';
    Object.assign(btnLogin.style, {
      backgroundColor: '#2563eb', color: '#ffffff', border: 'none',
      padding: '12px', borderRadius: '8px', fontSize: '13px',
      fontWeight: '700', cursor: 'pointer'
    });

    btnLogin.onclick = async () => {
      const username = inputUser.value.trim();
      const password = inputPass.value.trim();

      if (!username || !password) {
        alert('Ingresa tus datos de empleado.');
        return;
      }

      btnLogin.innerText = 'Autenticando...';
      btnLogin.disabled = true;

      try {
        const res = await apiRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        // Soporta { user: {...} } y { data: { user: {...} } }
        const user = res?.data?.user ?? res?.data ?? null;

        if (res?.ok && user?.id) {
          usuarioAutenticado = user;
          chrome.storage?.local?.set({ session_user: usuarioAutenticado });
          logoutBtn.style.display = 'block';
          renderDashboard();
        } else {
          const msg = res?.data?.message || res?.data?.error || res?.error || 'Usuario o contraseña incorrectos.';
          alert(msg);
          btnLogin.innerText = 'Conectar al ERP';
          btnLogin.disabled = false;
        }
      } catch (err) {
        console.error('[ERP]', err);
        alert('Error de conexión con el servidor ERP.');
        btnLogin.innerText = 'Conectar al ERP';
        btnLogin.disabled = false;
      }
    };

    box.appendChild(h3);
    box.appendChild(inputUser);
    box.appendChild(inputPass);
    box.appendChild(btnLogin);
    screenContainer.appendChild(box);
  }

  // ── Pantalla de dashboard ───────────────────────────────────
  async function renderDashboard() {
    if (!usuarioAutenticado?.id) { renderLogin(); return; }

    screenContainer.innerHTML = '<div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:40px;">Cargando tareas...</div>';

    const resTareas = await apiRequest(
      `http://localhost:3000/api/tareas?empleadoId=${usuarioAutenticado.id}`,
      { method: 'GET' }
    );
    const tareas = (resTareas?.ok && Array.isArray(resTareas.data)) ? resTareas.data : [];

    screenContainer.innerHTML = `
      <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:10px;display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:20px;">👨‍🔧</div>
        <div>
          <h4 style="margin:0;font-size:13px;color:#fff;">${usuarioAutenticado.name || 'Empleado'}</h4>
          <p style="margin:0;font-size:10px;color:#3b82f6;">${usuarioAutenticado.role || 'Personal'}</p>
        </div>
      </div>
      <div id="erp-task-list" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:340px;"></div>
    `;

    const list = document.getElementById('erp-task-list');
    if (!list) return;

    if (tareas.length === 0) {
      list.innerHTML = '<p style="text-align:center;font-size:11px;color:#4b5563;margin-top:20px;">Sin tareas asignadas.</p>';
    } else {
      tareas.forEach(t => {
        const item = document.createElement('div');
        item.style.cssText = 'background:#111827;border:1px solid #1f2937;border-radius:8px;padding:10px;font-size:11px;';
        item.innerHTML = `
          <div style="font-weight:600;color:#f1f5f9;margin-bottom:4px;">${t.titulo || t.descripcion || 'Tarea'}</div>
          <div style="font-size:9px;color:#9ca3af;">Estado: <b style="color:#fbbf24;">${t.estado || 'Pendiente'}</b></div>
        `;
        list.appendChild(item);
      });
    }
  }

  // ── Logout ──────────────────────────────────────────────────
  logoutBtn.onclick = () => {
    chrome.storage?.local?.remove('session_user', () => {
      usuarioAutenticado = null;
      logoutBtn.style.display = 'none';
      renderLogin();
    });
  };

  // ── Inicio: restaurar sesión o mostrar login ────────────────
  document.body.appendChild(panel);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['session_user'], (res) => {
      if (res?.session_user?.id) {
        usuarioAutenticado = res.session_user;
        logoutBtn.style.display = 'block';
        renderDashboard();
      } else {
        renderLogin();
      }
    });
  } else {
    renderLogin();
  }

})(); // ← IIFE: todo el código vive aquí dentro, sin contaminar el scope global