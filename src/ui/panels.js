import { PARTS, CATEGORIES, LAYERS, OVERVIEW } from '../data/parts.js';

const PRESET_LABELS = [
  ['assembled', 'Assembled'],
  ['shell', 'Remove bodywork'],
  ['wheels', 'Remove wheels'],
  ['bare', 'Bare chassis'],
  ['pu', 'Power unit'],
  ['exploded', 'Exploded view'],
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

  /* collapsible panels */
  document.querySelectorAll('.panel-toggle').forEach((b) =>
    b.addEventListener('click', () => $(b.dataset.target).classList.toggle('collapsed')),
  );
  if (window.innerWidth < 600) $('index').classList.add('collapsed');
  if (window.innerWidth < 600) $('controls').classList.add('collapsed');

  /* presets */
  const presets = $('presets');
  for (const [id, label] of PRESET_LABELS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.p = id;
    b.addEventListener('click', () => {
      presets.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      h.onPreset(id);
    });
    presets.append(b);
  }
  presets.firstChild.classList.add('on');
  const clearPreset = () => presets.querySelectorAll('button').forEach((x) => x.classList.remove('on'));

  /* explode slider */
  const ex = $('explode');
  const exVal = $('explode-val');
  ex.addEventListener('input', () => {
    h.onExplode(+ex.value);
    exVal.textContent = `${Math.round(ex.value * 100)}%`;
    clearPreset();
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
      clearPreset();
    });
    chips[l.id] = c;
    layerEl.append(c);
  }

  /* view mode */
  const seg = (el, cb) => {
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        cb(b.dataset.v);
      }),
    );
  };
  seg($('view-mode'), h.onView);
  const aeroHint = $('aero-hint');
  seg($('aero-mode'), (v) => {
    h.onAero(v);
    aeroHint.textContent =
      v === 'straight'
        ? 'Low-drag setting for straights. The flaps open inside FIA activation zones and are available to every driver.'
        : 'High-downforce default. The front and rear flaps are closed.';
  });
  $('xray').addEventListener('change', (e) => h.onXray(e.target.checked));
  $('dims').addEventListener('change', (e) => h.onDims(e.target.checked));
  $('spin').addEventListener('change', (e) => h.onSpin(e.target.checked));

  /* swatches */
  const swatches = (el, items, cb) => {
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 0 ? ' on' : '');
      b.innerHTML = `<i style="background:${it.bg}"></i>${it.name}`;
      b.addEventListener('click', () => {
        el.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
        cb(it);
      });
      el.append(b);
    });
  };
  swatches($('compounds'), COMPOUNDS.map(([name, c]) => ({ name, bg: c, c })), (it) => h.onCompound(it.c));

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
      $('xray').checked = state.xray;
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
