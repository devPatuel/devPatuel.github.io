// "Copy email" button. Stays hidden without JS or Clipboard API, where the mailto link is enough.
(function () {
  if (!navigator.clipboard) return;

  document.querySelectorAll('[data-copiar]').forEach(function (boton) {
    const estado = boton.parentElement.querySelector('.copiar-estado');
    let limpiar = null;

    boton.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(boton.dataset.copiar);
        estado.textContent = 'Copiado';
      } catch (e) {
        estado.textContent = 'No se pudo copiar';
      }
      clearTimeout(limpiar);
      limpiar = setTimeout(function () {
        estado.textContent = '';
      }, 2000);
    });

    boton.hidden = false;
  });
})();
