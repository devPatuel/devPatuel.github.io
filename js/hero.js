// Types the hero quote once. The full sentence stays in the DOM for screen readers and search engines.
(function () {
  const hero = document.querySelector('.hero');
  const frase = hero && hero.querySelector('[data-escribir]');
  if (!frase) return;

  function terminar() {
    hero.classList.add('is-listo');
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    terminar();
    return;
  }

  const texto = frase.textContent.trim();
  const accesible = document.createElement('span');
  accesible.className = 'sr-only';
  accesible.textContent = texto;
  const escrito = document.createElement('span');
  escrito.className = 'hero-escrito';
  escrito.setAttribute('aria-hidden', 'true');
  const pendiente = document.createElement('span');
  pendiente.className = 'hero-pendiente';
  pendiente.setAttribute('aria-hidden', 'true');
  frase.replaceChildren(accesible, escrito, pendiente);

  let i = 0;
  function paso() {
    escrito.textContent = texto.slice(0, i);
    // The untyped rest keeps its space while invisible, so lines never reflow as letters appear
    pendiente.textContent = texto.slice(i);
    if (i === texto.length) {
      terminar();
      return;
    }
    i += 1;
    setTimeout(paso, 45);
  }

  hero.classList.add('is-escribiendo');
  setTimeout(paso, 300);
})();
