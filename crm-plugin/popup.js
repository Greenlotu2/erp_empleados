document.addEventListener('DOMContentLoaded', () => {
  const btnToggle = document.getElementById('btnToggle');
  const btnAction = document.getElementById('btnAction');
  const btnSimulate = document.getElementById('btnSimulate');
  const statusBadge = document.getElementById('statusBadge');
  const taskText = document.getElementById('taskText');

  let isOcupado = false;

  function updateUI() {
    if (isOcupado) {
      statusBadge.className = "status-badge status-busy";
      statusBadge.textContent = "Ocupado";
      btnToggle.textContent = "Ponerme Libre";
      btnAction.style.display = "block";
    } else {
      statusBadge.className = "status-badge status-available";
      statusBadge.textContent = "Disponible";
      btnToggle.textContent = "Ponerme Ocupado";
      taskText.textContent = "No tienes actividades asignadas por el momento. Tu estado figura como libre.";
      btnAction.style.display = "none";
    }
  }

  btnToggle.addEventListener('click', () => {
    isOcupado = !isOcupado;
    updateUI();
  });

  btnSimulate.addEventListener('click', () => {
    isOcupado = true;
    taskText.textContent = "Ejecutar pruebas de regresión completas en el módulo de facturación del sistema.";
    updateUI();
  });

  btnAction.addEventListener('click', () => {
    alert("¡Actividad completada!");
    isOcupado = false;
    updateUI();
  });
});