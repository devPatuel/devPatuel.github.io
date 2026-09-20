// Theme toggle. The initial theme is applied by the inline script in <head> to avoid a flash.
(function () {
  const boton = document.querySelector('.tema-toggle');
  if (!boton) return;
  const html = document.documentElement;

  function pintar() {
    const oscuro = html.dataset.tema === 'oscuro';
    boton.setAttribute('aria-pressed', String(oscuro));
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  }

  boton.addEventListener('click', function () {
    html.dataset.tema = html.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    try {
      localStorage.setItem('tema', html.dataset.tema);
    } catch (e) {
      // Storage blocked (private mode, site data disabled): the toggle still works for this visit
    }
    pintar();
  });

  pintar();
  boton.hidden = false;
})();
