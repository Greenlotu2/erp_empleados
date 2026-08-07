document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000/api';

  // Vistas
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');

  // Login
  const inputUsername = document.getElementById('inputUsername');
  const inputPassword = document.getElementById('inputPassword');
  const btnLogin = document.getElementById('btnLogin');

  // Dashboard
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  const btnLogout = document.getElementById('btnLogout');

  let sessionData = null;

  // 1. Revisar si ya hay una sesión guardada en la extensión
  chrome.storage.local.get(['session'], (result) => {
    if (result.session && result.session.access_token) {
      sessionData = result.session;
      showDashboard();
    } else {
      showLogin();
    }
  });

  function showLogin() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
  }

  function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';

    if (sessionData && sessionData.user) {
      userName.textContent = sessionData.user.name || 'Usuario';
      userRole.textContent = sessionData.user.role || 'Empleado';
    }
  }

  // 2. Conectar al backend (POST /api/auth/login)
  btnLogin.addEventListener('click', async () => {
    const username = inputUsername.value.trim();
    const password = inputPassword.value.trim();

    if (!username || !password) {
      alert('Ingresa tu usuario y contraseña');
      return;
    }

    btnLogin.textContent = 'Conectando...';
    btnLogin.disabled = true;

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Error al autenticar');
      }

      // Guardar token y datos del usuario en el storage local de Chrome
      sessionData = data;
      chrome.storage.local.set({ session: data }, () => {
        showDashboard();
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      btnLogin.textContent = 'Conectar';
      btnLogin.disabled = false;
    }
  });

  // 3. Cerrar sesión
  btnLogout.addEventListener('click', () => {
    chrome.storage.local.remove('session', () => {
      sessionData = null;
      showLogin();
    });
  });
});