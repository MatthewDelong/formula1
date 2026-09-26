import { PARTS, CATEGORIES, LAYERS, OVERVIEW } from '../data/parts.js';

const PRESET_LABELS = [
  ['assembled', 'Assembled'],
  ['shell', 'No bodywork'],
  ['exploded', 'Exploded'],
];

const COMPOUNDS = [
  ['Soft', '#e10600'],
  ['Medium', '#ffd12e'],
  ['Hard', '#f4f4f4'],
  ['Inter', '#39b54a'],
  ['Wet', '#0067ad'],
];

const $ = (id) => document.getElementById(id);

export function initUI(h) {
  const { state } = h;

  /* expose the top bar's height to CSS (the key and menus sit just below it) */
  const topbar = $('topbar');
  const trackTopbar = () => document.documentElement.style.setProperty('--topbar-bottom', `${topbar.getBoundingClientRect().bottom}px`);
  new ResizeObserver(trackTopbar).observe(topbar);
  trackTopbar();

  /* dropdown menus */
  const menus = [...document.querySelectorAll('[data-menu]')];
  const closeMenus = (except) =>
    menus.forEach((b) => {
      if (b === except) return;
      b.classList.remove('on');
      $(b.dataset.menu).hidden = true;
    });
  for (const b of menus) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenus(b);
      const m = $(b.dataset.menu);
      m.style.top = `${$('topbar').getBoundingClientRect().bottom + 8}px`;
      m.hidden = !m.hidden;
      b.classList.toggle('on', !m.hidden);
      if (!m.hidden) m.querySelector('input[type=search]')?.focus();
    });
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.menu, [data-menu]')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
  });

  /* presets */
  const presets = $('presets');
  for (const [id, label] of PRESET_LABELS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.p = id;
    b.addEventListener('click', () => h.onPreset(id));
    presets.append(b);
  }
  /** Highlight the view that matches the current state (none after a manual layer change). */
  const markPreset = () => {
    const off = LAYERS.filter((l) => !state.layers[l.id]).map((l) => l.id).join();
    const current = state.explodeTarget > 0 ? (off ? null : 'exploded') : off === '' ? 'assembled' : off === 'body' ? 'shell' : null;
    presets.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.p === current));
  };
  markPreset();

  /* explode slider */
  const ex = $('explode');
  const exVal = $('explode-val');
  ex.addEventListener('input', () => {
    h.onExplode(+ex.value);
    exVal.textContent = `${Math.round(ex.value * 100)}%`;
    markPreset();
  });

  /* layers */
  const layerEl = $('layers');
  const chips = {};
  for (const l of LAYERS) {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = l.label;
    c.addEventListener('click', () => {
      const on = c.classList.toggle('off') === false;
      h.onLayer(l.id, on);
      markPreset();
    });
    chips[l.id] = c;
    layerEl.append(c);
  }

  /* toggle buttons */
  const toggle = (id, cb) => {
    const b = $(id);
    b.addEventListener('click', () => cb(b.classList.toggle('on')));
    return b;
  };
  toggle('view-mode', (on) => h.onView(on ? 'category' : 'real'));
  toggle('xray', h.onXray);
  toggle('dims', h.onDims);
  toggle('spin', h.onSpin);

  /* tyre compound: click to cycle */
  const tyre = $('compound');
  let ci = 0;
  const names = tyre.querySelector('.names');
  names.innerHTML = COMPOUNDS.map(([name]) => `<span>${name}</span>`).join('');
  const showCompound = () => {
    tyre.querySelector('i').style.background = COMPOUNDS[ci][1];
    [...names.children].forEach((s, i) => s.classList.toggle('on', i === ci));
  };
  showCompound();
  tyre.addEventListener('click', () => {
    ci = (ci + 1) % COMPOUNDS.length;
    showCompound();
    h.onCompound(COMPOUNDS[ci][1]);
  });

  /* camera bar */
  const cams = $('cams');
  cams.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      cams.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      h.onCam(b.dataset.cam);
    }),
  );

  /* legend */
  const legend = $('legend');
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${c.color}"></span><div><b>${c.label}</b><small>${c.who}</small></div><span class="count">${h.counts[k]}</span>`;
    li.addEventListener('mouseenter', () => h.onCategoryHover(k));
    li.addEventListener('mouseleave', () => h.onCategoryHover(null));
    legend.append(li);
  }

  /* always-visible colour key (top right) */
  const key = $('key');
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${c.color}"></i>${c.label}`;
    li.title = c.who;
    li.addEventListener('mouseenter', () => h.onCategoryHover(k));
    li.addEventListener('mouseleave', () => h.onCategoryHover(null));
    key.append(li);
  }

  /* overview */
  $('overview-list').innerHTML = OVERVIEW.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  /* part index */
  const list = $('part-list');
  const items = {};
  const groups = {};
  for (const [id, p] of Object.entries(PARTS)) (groups[p.group] ??= []).push([id, p]);
  for (const [g, entries] of Object.entries(groups)) {
    const t = document.createElement('div');
    t.className = 'group-title';
    t.textContent = g;
    list.append(t);
    for (const [id, p] of entries) {
      const b = document.createElement('button');
      b.className = 'part-item';
      b.dataset.search = `${p.name} ${g} ${CATEGORIES[p.cat].label} ${p.cat}`.toLowerCase();
      b.innerHTML = `<span class="dot" style="background:${CATEGORIES[p.cat].color}"></span><span class="nm">${p.name}</span>${p.isNew ? '<span class="new">NEW</span>' : ''}<span class="cat">${p.cat}</span>`;
      b.addEventListener('click', () => h.onPick(id));
      b.addEventListener('mouseenter', () => h.onHoverInfo(id));
      b.addEventListener('mouseleave', () => h.onHoverInfo(null));
      items[id] = b;
      list.append(b);
    }
  }
  $('search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const b of Object.values(items)) b.hidden = q && !b.dataset.search.includes(q);
    list.querySelectorAll('.group-title').forEach((t) => {
      let n = t.nextElementSibling;
      let any = false;
      while (n && !n.classList.contains('group-title')) {
        if (!n.hidden) any = true;
        n = n.nextElementSibling;
      }
      t.hidden = !any;
    });
  });

  return {
    sync() {
      ex.value = state.explodeTarget;
      exVal.textContent = `${Math.round(state.explodeTarget * 100)}%`;
      for (const l of LAYERS) chips[l.id].classList.toggle('off', !state.layers[l.id]);
      $('xray').classList.toggle('on', state.xray);
      markPreset();
    },
    markHot(id) {
      for (const [k, b] of Object.entries(items)) b.classList.toggle('hot', k === id);
    },
    markSelected(id) {
      for (const [k, b] of Object.entries(items)) b.classList.toggle('sel', k === id);
      if (id && items[id]) items[id].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  };
}
