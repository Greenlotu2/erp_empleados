(function() {
  if (document.getElementById('crm-persistent-panel')) return;

  // 1. Contenedor Principal
  const panel = document.createElement('div');
  panel.id = 'crm-persistent-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '340px',
    height: '520px',
    zIndex: '2147483647',
    backgroundColor: '#0b0f19',
    border: '1px solid #1f2937',
    borderRadius: '16px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#f1f5f9',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column'
  });

  // 2. Barra Superior (Header)
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1f2937',
    paddingBottom: '8px',
    marginBottom: '12px',
    width: '100%'
  });

  const title = document.createElement('span');
  title.innerText = 'CRM TRABAJADOR REAL';
  Object.assign(title.style, { fontSize: '10px', fontWeight: '800', color: '#4b5563', letterSpacing: '0.05em' });

  const closeBtn = document.createElement('span');
  closeBtn.innerText = '✕';
  Object.assign(closeBtn.style, { cursor: 'pointer', color: '#9ca3af', fontSize: '14px' });
  closeBtn.onclick = () => panel.remove();

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // 3. Contenedor Dinámico de Pantallas
  const screenContainer = document.createElement('div');
  screenContainer.style.flex = '1';
  screenContainer.style.display = 'flex';
  screenContainer.style.flexDirection = 'column';
  panel.appendChild(screenContainer);

  // Variable global temporal para guardar la info del usuario firmado (contiene el id)
  let usuarioAutenticado = null;

  // 4. VISTA: Inicio de Sesión Real
  function renderLoginScreen() {
    screenContainer.innerHTML = '';

    const loginBox = document.createElement('div');
    Object.assign(loginBox.style, { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '40px' });

    const welcomeText = document.createElement('h3');
    welcomeText.innerText = 'Ingreso al Sistema';
    Object.assign(welcomeText.style, { margin: '0 0 4px 0', fontSize: '16px', color: '#ffffff', textAlign: 'center' });

    const inputUser = document.createElement('input');
    inputUser.type = 'text';
    inputUser.placeholder = 'Usuario o Correo';
    Object.assign(inputUser.style, { padding: '10px', borderRadius: '8px', border: '1px solid #374151', backgroundColor: '#111827', color: '#ffffff', fontSize: '13px' });

    const inputPass = document.createElement('input');
    inputPass.type = 'password';
    inputPass.placeholder = 'Contraseña';
    Object.assign(inputPass.style, { padding: '10px', borderRadius: '8px', border: '1px solid #374151', backgroundColor: '#111827', color: '#ffffff', fontSize: '13px' });

    const btnLogin = document.createElement('button');
    btnLogin.innerText = 'Conectar';
    Object.assign(btnLogin.style, { width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' });

    // --- PETICIÓN HTTP POST AL SERVIDOR ---
    btnLogin.onclick = async () => {
      const username = inputUser.value.trim();
      const password = inputPass.value.trim();

      if (!username || !password) {
        alert('Rellena todos los campos.');
        return;
      }

      btnLogin.innerText = 'Autenticando...';
      btnLogin.disabled = true;

      try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (response.ok) {
          const data = await response.json();
          usuarioAutenticado = data.user; // Guardamos el id, name y role devuelto por la API vinculada a Supabase
          renderDashboardScreen(); // Pasamos al listado de tareas real
        } else {
          const errorData = await response.json().catch(() => ({}));
          alert(errorData.message || 'Credenciales incorrectas. Intenta de nuevo.');
          btnLogin.innerText = 'Conectar';
          btnLogin.disabled = false;
        }
      } catch (err) {
        console.error(err);
        alert('Error de conexión con el servidor local.');
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

  // 5. VISTA: Lista de Tareas Real
  async function renderDashboardScreen() {
    screenContainer.innerHTML = '<div style="font-size:12px; color:#9ca3af; text-align:center; margin-top:40px;">Cargando tus actividades...</div>';

    try {
      // --- PETICIÓN HTTP GET FILTRADA POR EMPLEADO ID ---
      const response = await fetch(`http://localhost:3000/api/tareas?empleadoId=${usuarioAutenticado.id}`);
      if (!response.ok) throw new Error('No se pudieron obtener las tareas');
      const tareas = await response.json();

      screenContainer.innerHTML = '';

      // Perfil Dinámico devuelto por la sesión
      const profileBox = document.createElement('div');
      Object.assign(profileBox.style, { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' });
      profileBox.innerHTML = `<div style="font-size: 20px;">👨‍🔧</div><div><h4 style="margin:0; font-size:13px; color:#fff;">${usuarioAutenticado?.name || 'Usuario'}</h4><p style="margin:0; font-size:10px; color:#3b82f6;">${usuarioAutenticado?.role || 'Trabajador'}</p></div>`;
      screenContainer.appendChild(profileBox);

      const listContainer = document.createElement('div');
      Object.assign(listContainer.style, { display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '340px' });

      if (tareas.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; font-size:11px; color:#4b5563;">Sin tareas asignadas hoy.</p>';
      }

      tareas.forEach(tarea => {
        const taskCard = document.createElement('div');
        Object.assign(taskCard.style, { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' });

        const taskTitle = document.createElement('p');
        taskTitle.innerText = tarea.titulo;
        Object.assign(taskTitle.style, { margin: '0', fontSize: '11px', color: '#e2e8f0', lineHeight: '1.3' });

        const badgeAndAction = document.createElement('div');
        Object.assign(badgeAndAction.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' });

        const badge = document.createElement('span');
        badge.innerText = tarea.estado;
        Object.assign(badge.style, { fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' });

        if (tarea.estado === 'Pendiente') Object.assign(badge.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171' });
        else if (tarea.estado === 'En progreso') Object.assign(badge.style, { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' });
        else Object.assign(badge.style, { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399' });

        badgeAndAction.appendChild(badge);

        // --- ACCIÓN REAL: MODIFICAR ESTADO ENVIANDO JSON EN EL CUERPO ---
        if (tarea.estado !== 'Completado') {
          const actionBtn = document.createElement('button');
          actionBtn.innerText = 'Finalizar ✓';
          Object.assign(actionBtn.style, { background: 'none', border: 'none', color: '#3b82f6', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' });
          
          actionBtn.onclick = async () => {
            try {
              const res = await fetch(`http://localhost:3000/api/tareas`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: tarea.id, estado: 'Completado' })
              });
              if (res.ok) {
                renderDashboardScreen(); // Volver a consultar a Supabase para pintar los cambios actualizados
              } else {
                alert('No se pudo actualizar la tarea en el servidor.');
              }
            } catch (err) {
              alert('Error al conectar con el servidor.');
            }
          };
          badgeAndAction.appendChild(actionBtn);
        }

        taskCard.appendChild(taskTitle);
        taskCard.appendChild(badgeAndAction);
        listContainer.appendChild(taskCard);
      });

      screenContainer.appendChild(listContainer);
    } catch (err) {
      screenContainer.innerHTML = `<div style="font-size:11px; color:#f87171; text-align:center; margin-top:40px;">Error al conectar con la base de datos remota.</div>`;
    }
  }

  renderLoginScreen();
  document.body.appendChild(panel);
})();