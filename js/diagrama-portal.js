// Interactive architecture diagrams (portal, GrowTogether, ...).
// Without JS nothing breaks: each SVG stays static and its full component list stays visible.
document.querySelectorAll('[data-arch]').forEach(function (root) {
  const nodes = root.querySelectorAll('.node[data-id]');
  const links = root.querySelectorAll('.link');
  const items = root.querySelectorAll('.arch-details [data-id]');
  const hint = root.querySelector('.arch-hint');
  let selected = null;

  function relatedIds(id) {
    const ids = new Set([id]);
    links.forEach((link) => {
      if (link.dataset.a === id) ids.add(link.dataset.b);
      if (link.dataset.b === id) ids.add(link.dataset.a);
    });
    // A container and the pieces running inside it stay visible together
    nodes.forEach((node) => {
      if (node.dataset.in === id) ids.add(node.dataset.id);
      if (node.dataset.id === id && node.dataset.in) ids.add(node.dataset.in);
    });
    return ids;
  }

  function select(id) {
    selected = id === selected ? null : id;
    const ids = selected ? relatedIds(selected) : new Set();

    root.classList.toggle('has-selection', selected !== null);
    nodes.forEach((node) => {
      const isSelected = node.dataset.id === selected;
      node.classList.toggle('is-selected', isSelected);
      node.classList.toggle('is-related', ids.has(node.dataset.id));
      node.setAttribute('aria-pressed', String(isSelected));
    });
    links.forEach((link) => {
      const touches = link.dataset.a === selected || link.dataset.b === selected;
      link.classList.toggle('is-related', selected !== null && touches);
    });
    items.forEach((item) => {
      item.hidden = item.dataset.id !== selected;
    });
    if (hint) hint.hidden = selected !== null;
  }

  nodes.forEach((node) => {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.addEventListener('click', () => select(node.dataset.id));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(node.dataset.id);
      } else if (event.key === 'Escape' && selected !== null) {
        select(selected);
      }
    });
  });

  root.classList.add('is-enhanced');
  select(null);
});
