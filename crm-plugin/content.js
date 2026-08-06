(function() {
  console.log('CRM Plugin: Script iniciado');
  
  if (document.getElementById('crm-persistent-panel')) {
    console.log('CRM Plugin: Ya existe, saliendo');
    return;
  }

  // --- 1. ESTADOS LOCALES ---
  let isMinimized = false;
  let lastTheme = null;
  let activeTab = 'tareas'; // 'tareas' | 'revisiones'

  // --- 2. CREACIÓN DEL PANEL PRINCIPAL CON ESTILOS BLINDADOS ---
  const panel = document.createElement('div');
  panel.id = 'crm-persistent-panel';
  
  const panelStyles = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    width: 340px !important;
    height: 520px !important;
    z-index: 2147483647 !important;
    border-radius: 16px !important;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5) !important;
    padding: 16px !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    transition: width 0.2s ease, height 0.2s ease, background-color 0.3s ease, border-color 0.3s ease !important;
  `;
  panel.setAttribute('style', panelStyles);

  // --- 3. CABECERA Y BOTONES ---
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1f2937',
    paddingBottom: '8px',
    marginBottom: '12px',
    userSelect: 'none'
  });

  const title = document.createElement('span');
  title.innerText = 'ERP TRABAJADOR REAL';
  Object.assign(title.style, { fontSize: '10px', fontWeight: '800' });

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', alignItems: 'center' });

  const minimizeBtn = document.createElement('button');
  minimizeBtn.innerText = '—';
  minimizeBtn.dataset.noDrag = 'true';
  Object.assign(minimizeBtn.style, {
    cursor: 'pointer', fontSize: '12px',
    backgroundColor: 'transparent', border: 'none', padding: '0 4px',
    fontWeight: 'bold', lineHeight: '1'
  });

  const logoutBtn = document.createElement('button');
  logoutBtn.innerText = 'SALIR';
  logoutBtn.dataset.noDrag = 'true';
  Object.assign(logoutBtn.style, {
    cursor: 'pointer', color: '#ffffff', fontSize: '10px',
    backgroundColor: '#dc2626', border: 'none', padding: '4px 8px',
    borderRadius: '4px', fontWeight: 'bold', display: 'none'
  });

  const closeBtn = document.createElement('span');
  closeBtn.innerText = 'X';
  closeBtn.dataset.noDrag = 'true';
  Object.assign(closeBtn.style, { cursor: 'pointer', fontSize: '14px', padding: '0 4px' });

  actions.appendChild(minimizeBtn);
  actions.appendChild(logoutBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);
  panel.appendChild(header);

  // --- 4. APLICACIÓN DE TEMA ---
  function applyTheme(theme) {
    if (theme === lastTheme) return;
    lastTheme = theme;

    if (theme === 'dark-panel') {
      panel.style.setProperty('background-color', '#0b0f19', 'important');
      panel.style.setProperty('border', '1px solid #1f2937', 'important');
      panel.style.setProperty('color', '#f1f5f9', 'important');
      if (title) title.style.setProperty('color', '#9ca3af', 'important');
      if (minimizeBtn) minimizeBtn.style.setProperty('color', '#9ca3af', 'important');
      if (closeBtn) closeBtn.style.setProperty('color', '#9ca3af', 'important');
    } else {
      panel.style.setProperty('background-color', '#0f172a', 'important');
      panel.style.setProperty('border', '1px solid #334155', 'important');
      panel.style.setProperty('color', '#ffffff', 'important');
      if (title) title.style.setProperty('color', '#cbd5e1', 'important');
      if (minimizeBtn) minimizeBtn.style.setProperty('color', '#cbd5e1', 'important');
      if (closeBtn) closeBtn.style.setProperty('color', '#cbd5e1', 'important');
    }
  }

  function adjustContrastColor() {
    try {
      const rect = panel.getBoundingClientRect();
      let x = Math.max(1, Math.min(rect.left + rect.width / 2, window.innerWidth - 1));
      let y = Math.max(1, Math.min(rect.top + rect.height / 2, window.innerHeight - 1));

      panel.style.pointerEvents = 'none';
      let elementUnderneath = document.elementFromPoint(x, y);
      panel.style.pointerEvents = 'auto';

      if (!elementUnderneath) { applyTheme('dark-panel'); return; }

      let bg = window.getComputedStyle(elementUnderneath).backgroundColor;
      let currentElem = elementUnderneath;

      while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && currentElem?.parentElement) {
        currentElem = currentElem.parentElement;
        if (currentElem) bg = window.getComputedStyle(currentElem).backgroundColor;
      }

      if ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && document.body) {
        bg = window.getComputedStyle(document.body).backgroundColor;
      }

      const rgb = bg ? bg.match(/\d+/g) : null;
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
        applyTheme(brightness > 128 ? 'dark-panel' : 'light-panel');
      } else {
        applyTheme('dark-panel');
      }
    } catch (err) {
      panel.style.pointerEvents = 'auto';
      applyTheme('dark-panel');
    }
  }

  // --- 5. ACCIONES DE BOTONES ---
  minimizeBtn.onclick = () => {
    isMinimized = !isMinimized;
    applyMinimizedStyles(isMinimized);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try { chrome.storage.local.set({ panel_minimized: isMinimized }); } catch (e) {}
    }
  };

  logoutBtn.onclick = () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try { chrome.storage.local.remove(['session_user']); } catch (e) {}
    }
  };

  closeBtn.onclick = () => {
    const pwd = prompt('Contraseña para cerrar:');
    if (pwd === 'RoCInGeLuMInOv251289//') {
      observer.disconnect();
      panel.remove();
    } else if (pwd !== null) {
      alert('Contraseña incorrecta.');
    }
  };

  function applyMinimizedStyles(minimized) {
    if (minimized) {
      panel.style.height = '48px';
      panel.style.width = '220px';
      panel.style.overflow = 'hidden';
      screenContainer.style.display = 'none';
      header.style.borderBottom = 'none';
      header.style.marginBottom = '0';
      header.style.paddingBottom = '0';
      minimizeBtn.innerText = '▢';
    } else {
      panel.style.height = '520px';
      panel.style.width = '340px';
      panel.style.overflow = 'visible';
      screenContainer.style.display = 'flex';
      header.style.borderBottom = '1px solid #1f2937';
      header.style.marginBottom = '12px';
      header.style.paddingBottom = '8px';
      minimizeBtn.innerText = '—';
    }
  }

  // --- 6. RECUPERAR POSICIÓN Y ESTADO MINIMIZADO ---
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      chrome.storage.local.get(['panel_position', 'panel_minimized'], (result) => {
        if (result) {
          if (result.panel_position) {
            panel.style.left = result.panel_position.left + 'px';
            panel.style.top = result.panel_position.top + 'px';
            panel.style.right = 'auto';
          }
          if (result.panel_minimized) {
            isMinimized = true;
            applyMinimizedStyles(true);
          }
        }
        adjustContrastColor();
      });
    } catch (e) {
      adjustContrastColor();
    }
  }

  // --- 7. LÓGICA DE ARRASTRE ---
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let lastBroadcast = 0;

  panel.addEventListener('mousedown', (e) => {
    const targetTag = e.target.tagName.toLowerCase();
    if (['input', 'button', 'a', 'textarea', 'select'].includes(targetTag) || e.target.dataset.noDrag) return;
    isDragging = true;
    panel.style.cursor = 'grabbing';
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    panel.style.left = rect.left + 'px';
    panel.style.right = 'auto';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let newLeft = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - panel.offsetWidth));
    let newTop = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - panel.offsetHeight));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    adjustContrastColor();

    const now = Date.now();
    if (now - lastBroadcast > 30) {
      lastBroadcast = now;
      if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime?.sendMessage) {
        try { chrome.runtime.sendMessage({ type: 'PANEL_MOVING', position: { left: newLeft, top: newTop } }); } catch (err) {}
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      panel.style.cursor = 'grab';
      const rect = panel.getBoundingClientRect();
      if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
        try { chrome.storage.local.set({ panel_position: { left: rect.left, top: rect.top } }); } catch (err) {}
      }
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'PANEL_MOVING' && !isDragging) {
          panel.style.left = message.position.left + 'px';
          panel.style.top = message.position.top + 'px';
          panel.style.right = 'auto';
          adjustContrastColor();
        }
      });
    } catch (e) {}
  }

  // --- 8. PETICIONES A LA API ---
  function apiRequest(url, options) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'API_REQUEST', url, options }, (result) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: 'Servidor no disponible' });
              return;
            }
            resolve(result || { ok: false, error: 'Sin respuesta del servidor' });
          });
        } else {
          resolve({ ok: false, error: 'Runtime no disponible' });
        }
      } catch (err) {
        resolve({ ok: false, error: 'Contexto desconectado' });
      }
    });
  }

  // --- 9. CONTENEDOR DE PANTALLAS ---
  const screenContainer = document.createElement('div');
  screenContainer.style.flex = '1';
  screenContainer.style.display = 'flex';
  screenContainer.style.flexDirection = 'column';
  panel.appendChild(screenContainer);

  let usuarioAutenticado = null;

  // --- 10. VISTA: LOGIN ---
  function renderLoginScreen() {
    screenContainer.innerHTML = '';
    const loginBox = document.createElement('div');
    Object.assign(loginBox.style, { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '40px' });

    const welcomeText = document.createElement('h3');
    welcomeText.innerText = 'Ingreso al Sistema';
    Object.assign(welcomeText.style, { margin: '0 0 4px 0', fontSize: '16px', textAlign: 'center', color: '#ffffff' });

    const inputUser = document.createElement('input');
    inputUser.type = 'text';
    inputUser.placeholder = 'Usuario o Correo';
    inputUser.style.cursor = 'text';
    Object.assign(inputUser.style, { padding: '10px', borderRadius: '8px', border: '1px solid #374151', backgroundColor: '#111827', color: '#ffffff', fontSize: '13px' });

    const inputPass = document.createElement('input');
    inputPass.type = 'password';
    inputPass.placeholder = 'Contraseña';
    inputPass.style.cursor = 'text';
    Object.assign(inputPass.style, { padding: '10px', borderRadius: '8px', border: '1px solid #374151', backgroundColor: '#111827', color: '#ffffff', fontSize: '13px' });

    const btnLogin = document.createElement('button');
    btnLogin.innerText = 'Conectar';
    Object.assign(btnLogin.style, { width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' });

    btnLogin.onclick = async () => {
      const username = inputUser.value.trim();
      const password = inputPass.value.trim();
      if (!username || !password) { alert('Rellena todos los campos.'); return; }

      btnLogin.innerText = 'Autenticando...';
      btnLogin.disabled = true;

      const response = await apiRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        usuarioAutenticado = response.data.user;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          try { chrome.storage.local.set({ session_user: usuarioAutenticado }); } catch (e) {}
        }
        logoutBtn.style.display = 'block';
        renderDashboardScreen();
      } else {
        alert(response.data?.message || response.error || 'Credenciales incorrectas o servidor desconectado.');
        btnLogin.innerText = 'Conectar';
        btnLogin.disabled = false;
      }
    };

    loginBox.appendChild(welcomeText);
    loginBox.appendChild(inputUser);
    loginBox.appendChild(inputPass);
    loginBox.appendChild(btnLogin);
    screenContainer.appendChild(loginBox);
  }

  // --- 11. VISTA: DASHBOARD CON TABS (TAREAS / REVISIONES) ---
  async function renderDashboardScreen() {
    screenContainer.innerHTML = '<div style="font-size:12px; color:#9ca3af; text-align:center; margin-top:40px;">Cargando información...</div>';

    const [resTareas, resRevisiones] = await Promise.all([
      apiRequest(`http://localhost:3000/api/tareas?empleadoId=${usuarioAutenticado.id}`, { method: 'GET' }),
      apiRequest(`http://localhost:3000/api/revisiones?empleadoId=${usuarioAutenticado.id}`, { method: 'GET' })
    ]);

    if (!resTareas.ok) {
      screenContainer.innerHTML = '<div style="font-size:11px; color:#f87171; text-align:center; margin-top:40px;">No se pudo conectar con el servidor backend (localhost:3000).</div>';
      return;
    }

    const tareas = resTareas.data || [];
    const revisiones = resRevisiones.ok && resRevisiones.data ? resRevisiones.data : [];
    const isLight = lastTheme === 'light-panel';

    screenContainer.innerHTML = '';

    // Perfil
    const profileBox = document.createElement('div');
    Object.assign(profileBox.style, { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' });
    profileBox.innerHTML = `<div style="font-size:20px;">👨‍🔧</div><div><h4 style="margin:0; font-size:13px; color:#fff;">${usuarioAutenticado?.name || 'Usuario'}</h4><p style="margin:0; font-size:10px; color:#3b82f6;">${usuarioAutenticado?.role || 'Trabajador'}</p></div>`;
    screenContainer.appendChild(profileBox);

    // Tabs
    const navTabs = document.createElement('div');
    Object.assign(navTabs.style, {
      display: 'flex',
      backgroundColor: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '10px',
      padding: '3px',
      marginBottom: '10px'
    });

    const tabTareas = document.createElement('button');
    tabTareas.innerHTML = `📌 Tareas (${tareas.length})`;
    tabTareas.dataset.noDrag = 'true';

    const tabRevisiones = document.createElement('button');
    tabRevisiones.innerHTML = `📅 Revisiones (${revisiones.length})`;
    tabRevisiones.dataset.noDrag = 'true';

    const styleTab = (btn, isActive) => {
      Object.assign(btn.style, {
        flex: '1', padding: '6px 0', fontSize: '11px', fontWeight: '700',
        border: 'none', borderRadius: '7px', cursor: 'pointer', transition: 'all 0.2s',
        backgroundColor: isActive ? '#2563eb' : 'transparent',
        color: isActive ? '#ffffff' : '#9ca3af'
      });
    };

    styleTab(tabTareas, activeTab === 'tareas');
    styleTab(tabRevisiones, activeTab === 'revisiones');

    tabTareas.onclick = () => { activeTab = 'tareas'; renderDashboardScreen(); };
    tabRevisiones.onclick = () => { activeTab = 'revisiones'; renderDashboardScreen(); };

    navTabs.appendChild(tabTareas);
    navTabs.appendChild(tabRevisiones);
    screenContainer.appendChild(navTabs);

    // Lista
    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, { display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '290px' });

    // 📌 PESTAÑA TAREAS
    if (activeTab === 'tareas') {
      if (tareas.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:#4b5563; margin-top:20px;">Sin tareas asignadas.</p>';
      }

      tareas.forEach(tarea => {
        const taskCard = document.createElement('div');
        Object.assign(taskCard.style, {
          backgroundColor: isLight ? '#f8fafc' : '#111827',
          border: isLight ? '1px solid #e2e8f0' : '1px solid #1f2937',
          borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px'
        });

        const taskTitle = document.createElement('p');
        taskTitle.innerText = tarea.titulo;
        Object.assign(taskTitle.style, { margin: '0', fontSize: '11px', fontWeight: '600', color: isLight ? '#1e293b' : '#e2e8f0', lineHeight: '1.3' });
        taskCard.appendChild(taskTitle);

        if (tarea.estado === 'Completado' && tarea.fecha_completado) {
          const dateFormatted = new Date(tarea.fecha_completado).toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
          });
          const completedDateEl = document.createElement('span');
          completedDateEl.innerText = `Finalizado: ${dateFormatted}`;
          Object.assign(completedDateEl.style, { fontSize: '9px', color: isLight ? '#64748b' : '#9ca3af', fontStyle: 'italic', marginTop: '2px', display: 'block' });
          taskCard.appendChild(completedDateEl);
        }

        const badgeAndAction = document.createElement('div');
        Object.assign(badgeAndAction.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' });

        const badge = document.createElement('span');
        badge.innerText = tarea.estado;
        Object.assign(badge.style, { fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' });

        if (tarea.estado === 'Pendiente') Object.assign(badge.style, { backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' });
        else if (tarea.estado === 'En progreso') Object.assign(badge.style, { backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24' });
        else Object.assign(badge.style, { backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399' });

        badgeAndAction.appendChild(badge);

        const actionBtn = document.createElement('button');
        actionBtn.dataset.noDrag = 'true';
        Object.assign(actionBtn.style, { background: 'none', border: 'none', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' });

        if (tarea.estado === 'Completado') {
          actionBtn.innerText = 'Deshacer';
          actionBtn.style.color = '#f87171';
          actionBtn.onclick = async () => {
            actionBtn.disabled = true;
            const res = await apiRequest('http://localhost:3000/api/tareas', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: tarea.id, estado: 'Pendiente' })
            });
            if (res.ok) renderDashboardScreen();
          };
        } else {
          actionBtn.innerText = 'Finalizar ✓';
          actionBtn.style.color = '#3b82f6';
          actionBtn.onclick = async () => {
            actionBtn.disabled = true;
            const res = await apiRequest('http://localhost:3000/api/tareas', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: tarea.id, estado: 'Completado' })
            });
            if (res.ok) renderDashboardScreen();
            else alert('No se pudo actualizar la tarea.');
          };
        }

        badgeAndAction.appendChild(actionBtn);
        taskCard.appendChild(badgeAndAction);
        listContainer.appendChild(taskCard);
      });
    }

    // 📅 PESTAÑA REVISIONES
    if (activeTab === 'revisiones') {
      if (revisiones.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:#4b5563; margin-top:20px;">Sin revisiones programadas.</p>';
      }

      revisiones.forEach(rev => {
        const revCard = document.createElement('div');
        Object.assign(revCard.style, {
          backgroundColor: isLight ? '#f8fafc' : '#111827',
          border: isLight ? '1px solid #e2e8f0' : '1px solid #1e293b',
          borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px'
        });

        const revTitle = document.createElement('p');
        revTitle.innerText = rev.title || rev.titulo;
        Object.assign(revTitle.style, { margin: '0', fontSize: '11px', fontWeight: 'bold', color: '#f8fafc' });

        const startDate = new Date(rev.start || rev.fecha_inicio);
        const horaFormateada = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const fechaFormateada = startDate.toLocaleDateString([], { day: '2-digit', month: 'short' });

        const timeInfo = document.createElement('div');
        Object.assign(timeInfo.style, { fontSize: '10px', color: '#60a5fa', fontWeight: '600', display: 'flex', justifyContent: 'space-between' });
        timeInfo.innerHTML = `<span>🕒 ${horaFormateada}</span><span>📅 ${fechaFormateada}</span>`;

        revCard.appendChild(revTitle);
        revCard.appendChild(timeInfo);

        if (rev.descripcion) {
          const desc = document.createElement('p');
          desc.innerText = rev.descripcion;
          Object.assign(desc.style, { margin: '2px 0 0 0', fontSize: '10px', color: '#94a3b8' });
          revCard.appendChild(desc);
        }

        listContainer.appendChild(revCard);
      });
    }

    screenContainer.appendChild(listContainer);
  }

  // --- 12. SINCRONIZACIÓN DE ESTADOS ---
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
          if (changes.session_user) {
            const newUser = changes.session_user.newValue;
            if (newUser) {
              usuarioAutenticado = newUser;
              logoutBtn.style.display = 'block';
              renderDashboardScreen();
            } else {
              usuarioAutenticado = null;
              logoutBtn.style.display = 'none';
              renderLoginScreen();
            }
          }
          if (changes.panel_position && !isDragging) {
            const pos = changes.panel_position.newValue;
            if (pos) {
              panel.style.left = pos.left + 'px';
              panel.style.top = pos.top + 'px';
              panel.style.right = 'auto';
              adjustContrastColor();
            }
          }
          if (changes.panel_minimized !== undefined) {
            isMinimized = changes.panel_minimized.newValue;
            applyMinimizedStyles(isMinimized);
          }
        }
      });
    } catch (e) {}
  }

  // --- 13. CARGA INICIAL ---
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      chrome.storage.local.get(['session_user'], (result) => {
        if (result && result.session_user) {
          usuarioAutenticado = result.session_user;
          logoutBtn.style.display = 'block';
          renderDashboardScreen();
        } else {
          renderLoginScreen();
        }
      });
    } catch (e) {
      renderLoginScreen();
    }
  } else {
    renderLoginScreen();
  }

  // --- 14. INSERCIÓN EN DOM Y GUARDIÁN ---
  document.body.appendChild(panel);
  adjustContrastColor();

  const observer = new MutationObserver(() => {
    if (!document.getElementById('crm-persistent-panel')) {
      document.body.appendChild(panel);
      adjustContrastColor();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();    