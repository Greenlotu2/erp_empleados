// Abrir automáticamente el Side Panel de Chrome al hacer clic en el ícono
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error al configurar SidePanel:', error));

// Escuchador de peticiones y comando para abrir la Ventana Flotante Independiente
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Petición HTTP centralizada
  if (request.type === 'API_REQUEST') {
    fetch(request.url, request.options)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        sendResponse({ ok: response.ok, status: response.status, data: data });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || 'Error de red' });
      });
    return true; // Respuesta asíncrona
  }

  // Comando para abrir la Opción B (Ventana flotante Pop-out)
  if (request.type === 'OPEN_POPUP_WINDOW') {
    chrome.windows.create({
      url: 'panel.html',
      type: 'popup',
      width: 380,
      height: 620,
      focused: true
    });
  }
});