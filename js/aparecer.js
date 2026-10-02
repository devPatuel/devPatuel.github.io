// Timeline: milestones fade in as they scroll into view, and a green line fills down the
// timeline as you scroll, lighting each dot when it reaches it.
(function () {
  const lista = document.querySelector('.hitos');
  const hitos = document.querySelectorAll('.hito');
  if (!lista || !hitos.length) return;

  const progreso = document.createElement('span');
  progreso.className = 'hitos-progreso';
  progreso.setAttribute('aria-hidden', 'true');
  lista.prepend(progreso);

  function encenderTodo() {
    lista.style.setProperty('--progreso', '1');
    hitos.forEach((hito) => hito.classList.add('is-visible', 'is-encendido'));
  }

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    encenderTodo();
    return;
  }

  const observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('is-visible');
      observador.unobserve(entrada.target);
    });
  }, { threshold: 0.2 });
  hitos.forEach((hito) => observador.observe(hito));

  // The tip of the line follows a point at 60% of the screen height. It only grows: scrolling back
  // up leaves the dots already lit, so the timeline never "switches off" while you read it.
  let maximo = 0;
  let pendiente = false;
  function actualizar() {
    pendiente = false;
    const caja = lista.getBoundingClientRect();
    const punta = window.innerHeight * 0.6 - caja.top;
    const valor = Math.min(1, Math.max(0, punta / caja.height));
    if (valor <= maximo) return;
    maximo = valor;
    lista.style.setProperty('--progreso', String(maximo));
    hitos.forEach(function (hito) {
      // The dot sits at the top of each milestone.
      if (hito.offsetTop <= maximo * caja.height) hito.classList.add('is-encendido');
    });
  }
  function alHacerScroll() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(actualizar);
  }
  window.addEventListener('scroll', alHacerScroll, { passive: true });
  window.addEventListener('resize', alHacerScroll);
  actualizar();
})();
