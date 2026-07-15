chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_REQUEST') {
    const { url, options } = message;

    fetch(url, options)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        sendResponse({ ok: response.ok, status: response.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true; // mantiene el canal abierto para la respuesta async
  }
});