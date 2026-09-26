import * as THREE from 'three';
import { CATEGORIES } from '../data/parts.js';

const FREEDOM = ['None', 'Minimal', 'Limited', 'Substantial', 'High'];
const NS = 'http://www.w3.org/2000/svg';

/** Horizontal screen span not covered by the (expanded) side panels. */
function freeBounds(w, cw) {
  let L = 16;
  let R = w - 16;
  const c = document.getElementById('controls');
  const i = document.getElementById('index');
  if (c && !c.classList.contains('collapsed')) {
    const r = c.getBoundingClientRect();
    if (r.right < w / 2) L = r.right + 14;
  }
  if (i && !i.classList.contains('collapsed')) {
    const r = i.getBoundingClientRect();
    if (r.left > w / 2) R = r.left - 14;
  }
  if (R - L < cw + 20) return { L: 16, R: w - 16 };
  return { L, R };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Floating info card connected to a point on a part by a leader line.
 * The anchor is stored in the part's local space so the line tracks the part
 * as it explodes, hides or as the camera orbits.
 */
export class Callout {
  constructor({ card, svg, camera, renderer, onClose }) {
    this.onClose = onClose;
    this.card = card;
    this.svg = svg;
    this.camera = camera;
    this.renderer = renderer;
    this.part = null;
    this.infoId = null;
    this.anchorLocal = new THREE.Vector3();
    this.pos = null;
    this.side = 1;
    this.visible = false;

    this.path = document.createElementNS(NS, 'path');
    this.path.setAttribute('class', 'callout-line');
    this.dot = document.createElementNS(NS, 'circle');
    this.dot.setAttribute('class', 'callout-dot');
    this.dot.setAttribute('r', '4');
    this.ring = document.createElementNS(NS, 'circle');
    this.ring.setAttribute('class', 'callout-ring');
    this.ring.setAttribute('r', '6');
    svg.append(this.path, this.ring, this.dot);
    this.setSvgVisible(false);
  }

  setSvgVisible(v) {
    for (const el of [this.path, this.dot, this.ring]) el.style.display = v ? '' : 'none';
  }

  show(info, infoId, part, pointWorld, pinned) {
    if (!info) return;
    const newContent = infoId !== this.infoId || pinned !== this.pinned;
    this.part = part;
    part.updateMatrixWorld(true);
    this.anchorLocal.copy(part.worldToLocal(pointWorld.clone()));
    if (newContent) {
      this.infoId = infoId;
      this.pinned = pinned;
      this.render(info, pinned);
      this.pos = null; // re-seat the card next to the new anchor
    }
    if (!this.visible) {
      this.card.hidden = false;
      requestAnimationFrame(() => this.card.classList.add('show'));
      this.visible = true;
      this.pos = null;
    }
    this.card.classList.toggle('pinned', pinned);
    this.setSvgVisible(true);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.infoId = null;
    this.part = null;
    this.card.classList.remove('show', 'pinned');
    this.setSvgVisible(false);
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      if (!this.visible) this.card.hidden = true;
    }, 180);
  }

  render(info, pinned) {
    const cat = CATEGORIES[info.cat];
    this.color = cat.color;
    this.card.style.setProperty('--cat', cat.color);
    this.path.style.stroke = cat.color;
    this.dot.style.fill = '#0b0d11';
    this.dot.style.stroke = cat.color;
    this.ring.style.stroke = cat.color;
    const bars = [0, 1, 2, 3].map((i) => `<span class="${i < info.freedom ? 'on' : ''}"></span>`).join('');
    this.card.innerHTML = `
      <div class="cat-row">
        <span class="cat-pill"><i></i>${esc(cat.label)} <code>${cat.short}</code></span>
        ${pinned ? '<button class="close" aria-label="Close">×</button>' : '<span class="pin">Click to pin</span>'}
      </div>
      <h3>${esc(info.name)}</h3>
      <p class="summary">${esc(info.summary)}</p>
      <div class="who"><b>Who makes it:</b> ${esc(cat.who)}</div>
      <div class="freedom">Team design freedom <div class="bars">${bars}</div><em>${FREEDOM[info.freedom]}</em></div>
      <ul>${info.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      ${info.numbers?.length ? `<div class="nums">${info.numbers.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${info.isNew ? `<div class="new"><b>New for 2026:</b> ${esc(info.isNew)}</div>` : ''}
    `;
    this.card.querySelector('.close')?.addEventListener('click', () => this.onClose?.());
  }

  update() {
    if (!this.visible || !this.part) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const world = this.part.localToWorld(this.anchorLocal.clone());
    const ndc = world.clone().project(this.camera);
    const behind = ndc.z > 1;
    const ax = (ndc.x * 0.5 + 0.5) * w;
    const ay = (-ndc.y * 0.5 + 0.5) * h;

    const cw = this.card.offsetWidth;
    const ch = this.card.offsetHeight;
    const gap = 90;
    const { L, R } = freeBounds(w, cw);

    if (!this.pos) {
      // choose the side with more room between the side panels
      const roomRight = R - (ax + gap);
      const roomLeft = ax - gap - L;
      this.side = roomRight >= cw ? 1 : roomLeft >= cw ? -1 : roomRight > roomLeft ? 1 : -1;
    }
    let tx = this.side > 0 ? ax + gap : ax - gap - cw;
    let ty = ay - 70;
    tx = THREE.MathUtils.clamp(tx, L, Math.max(L, R - cw));
    ty = THREE.MathUtils.clamp(ty, 70, h - ch - 70);
    if (w < 600) {
      // phones: dock the card above the camera bar
      tx = (w - cw) / 2;
      ty = Math.max(70, h - ch - 84);
    }
    if (!this.pos) this.pos = { x: tx, y: ty };
    else {
      this.pos.x += (tx - this.pos.x) * 0.2;
      this.pos.y += (ty - this.pos.y) * 0.2;
    }
    this.card.style.left = `${this.pos.x.toFixed(1)}px`;
    this.card.style.top = `${this.pos.y.toFixed(1)}px`;

    if (behind) {
      this.setSvgVisible(false);
      return;
    }
    this.setSvgVisible(true);
    // leader: anchor -> elbow -> card edge
    const edgeX = ax < this.pos.x + cw / 2 ? this.pos.x : this.pos.x + cw;
    const edgeY = THREE.MathUtils.clamp(ay, this.pos.y + 24, this.pos.y + ch - 24);
    const dir = edgeX > ax ? 1 : -1;
    const elbowX = edgeX - dir * 28;
    this.path.setAttribute('d', `M${ax},${ay} L${elbowX},${edgeY} L${edgeX},${edgeY}`);
    this.dot.setAttribute('cx', ax);
    this.dot.setAttribute('cy', ay);
    this.ring.setAttribute('cx', ax);
    this.ring.setAttribute('cy', ay);
  }
}
