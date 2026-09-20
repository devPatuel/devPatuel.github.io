// Fades timeline milestones in as they scroll into view.
(function () {
  const hitos = document.querySelectorAll('.hito');
  if (!hitos.length) return;

  if (!('IntersectionObserver' in window)) {
    hitos.forEach((hito) => hito.classList.add('is-visible'));
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
})();
