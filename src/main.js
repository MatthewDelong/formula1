import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildCar } from './car/build.js';
import { liveryUniforms } from './car/materials.js';
import { PARTS, CATEGORIES, LAYERS } from './data/parts.js';
import { createDimensions } from './dimensions.js';
import { Callout } from './ui/callout.js';
import { initUI } from './ui/panels.js';

/* ------------------------------------------------------------------ */
/* Renderer, scene, camera                                            */
/* ------------------------------------------------------------------ */

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const BG = 0x0b0d11;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 10, 24);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(5.6, 2.3, 5.2);
{
  const a = window.innerWidth / window.innerHeight;
  if (a < 1.3) camera.position.sub(new THREE.Vector3(0, 0.4, 0)).multiplyScalar(Math.min(2.6, 1.35 / a)).add(new THREE.Vector3(0, 0.4, 0));
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

/* Lights */
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c20, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(4, 7, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2);
rim.position.set(-5, 3, -4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffe8d0, 0.5);
fill.position.set(-2, 2, 6);
scene.add(fill);

/* Studio floor */
function radialTexture(inner, outer, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, inner, 256, 256, outer);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0e1014,
  roughness: 0.7,
  metalness: 0.0,
  transparent: true,
  alphaMap: radialTexture(0, 256, [[0, '#fff'], [0.55, '#fff'], [1, '#000']]),
});
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 96), floorMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// soft contact shadow blob
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(6.2, 2.6),
  new THREE.MeshBasicMaterial({
    map: radialTexture(0, 256, [[0, 'rgba(0,0,0,0.75)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true,
    depthWrite: false,
  }),
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.002;
scene.add(blob);
// subtle floor grid
const grid = new THREE.GridHelper(24, 48, 0x2a2f38, 0x1b1f26);
grid.material.transparent = true;
grid.material.opacity = 0.35;
grid.position.y = 0.001;
scene.add(grid);

/* ------------------------------------------------------------------ */
/* Car                                                                */
/* ------------------------------------------------------------------ */

const { root: car, reg, M, aero } = buildCar();
scene.add(car);
const parts = [...reg.parts.values()];

// Per-part assembled centre (for scale-around-centre when hiding layers)
const box = new THREE.Box3();
for (const p of parts) {
  box.setFromObject(p);
  p.userData.centre = box.getCenter(new THREE.Vector3());
  p.userData.size = box.getSize(new THREE.Vector3()).length();
  p.userData.baseScale = p.scale.clone();
  const e = p.userData.explode;
  p.userData.hideDir = e.lengthSq() > 0 ? e.clone().normalize() : new THREE.Vector3(0, 1, 0);
}

// Group parts by rules card
const byInfo = new Map();
for (const p of parts) {
  const id = p.userData.infoId;
  if (!byInfo.has(id)) byInfo.set(id, []);
  byInfo.get(id).push(p);
}

const dims = createDimensions(car);
dims.group.visible = false;

/* ------------------------------------------------------------------ */
/* Post-processing                                                    */
/* ------------------------------------------------------------------ */

const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outline.edgeStrength = 5;
outline.edgeGlow = 0.6;
outline.edgeThickness = 1.6;
outline.visibleEdgeColor.set('#ffffff');
outline.hiddenEdgeColor.set('#3a4452');
composer.addPass(outline);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

const state = {
  explode: 0,
  explodeTarget: 0,
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, true])),
  view: 'real',
  xray: false,
  aeroT: 0,
  aeroTarget: 0,
  hover: null, // part group
  hoverInfo: null,
  pinned: null, // info id
  pinnedPart: null,
  categoryHover: null,
  spin: false,
};

/* ------------------------------------------------------------------ */
/* Material management (realistic / rule colours / x-ray / highlight) */
/* ------------------------------------------------------------------ */

const catMats = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, c]) => [
    k,
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(c.color).multiplyScalar(0.62),
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.6,
      side: THREE.DoubleSide,
    }),
  ]),
);
const ghostMat = new THREE.MeshPhysicalMaterial({
  color: 0xa8d8ff,
  roughness: 0.15,
  metalness: 0,
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const hiCache = new Map();
function highlighted(mat, color) {
  const k = mat.uuid + color;
  let h = hiCache.get(k);
  if (!h) {
    h = mat.clone();
    if (mat.onBeforeCompile) {
      h.onBeforeCompile = mat.onBeforeCompile;
      h.customProgramCacheKey = mat.customProgramCacheKey;
    }
    if (h.emissive) {
      h.emissive = new THREE.Color(color);
      h.emissiveIntensity = mat === ghostMat ? 0.6 : 0.28;
    }
    if (mat === ghostMat) h.opacity = 0.35;
    hiCache.set(k, h);
  }
  return h;
}

function isGhost(p) {
  return state.xray && p.userData.xray;
}

function refreshMaterials() {
  const hotInfo = new Set();
  if (state.hoverInfo) hotInfo.add(state.hoverInfo);
  if (state.pinned) hotInfo.add(state.pinned);
  for (const p of parts) {
    const info = PARTS[p.userData.infoId];
    const cat = info?.cat ?? 'LTC';
    const ghost = isGhost(p);
    const hot = hotInfo.has(p.userData.infoId) || (state.categoryHover && state.categoryHover === cat);
    p.traverse((o) => {
      if (!o.isMesh) return;
      let m = o.userData.baseMaterial;
      if (state.view === 'category' && !m.emissiveMap && !(m.emissiveIntensity > 1)) m = catMats[cat];
      if (ghost) m = ghostMat;
      if (hot) m = highlighted(m, CATEGORIES[cat].color);
      o.material = m;
      o.castShadow = !ghost;
    });
  }
  const sel = [];
  for (const id of hotInfo) for (const p of byInfo.get(id) ?? []) if (p.visible) sel.push(p);
  if (state.categoryHover) for (const p of parts) if (PARTS[p.userData.infoId]?.cat === state.categoryHover && p.visible) sel.push(p);
  outline.selectedObjects = sel;
  const col = state.categoryHover ? CATEGORIES[state.categoryHover].color : CATEGORIES[PARTS[state.hoverInfo ?? state.pinned]?.cat]?.color;
  outline.visibleEdgeColor.set(col ?? '#ffffff');
}

/* ------------------------------------------------------------------ */
/* Picking                                                            */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let pointerDirty = false;
let downPos = null;

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerInside = true;
  pointerDirty = true;
});
renderer.domElement.addEventListener('pointerleave', () => {
  pointerInside = false;
  setHover(null);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 5) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = pick();
  if (hit) pin(hit.part, hit.point);
  else unpin();
});

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  for (const p of parts) {
    if (!p.visible || isGhost(p)) continue;
    p.traverse((o) => o.isMesh && meshes.push(o));
  }
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const h = hits[0];
  const part = reg.parts.get(h.object.userData.partId);
  return { part, point: h.point };
}

const callout = new Callout({
  card: document.getElementById('card'),
  svg: document.getElementById('callout-svg'),
  camera,
  renderer,
  onClose: () => unpin(),
});

function setHover(part, point) {
  const info = part?.userData.infoId ?? null;
  const changed = part !== state.hover;
  state.hover = part;
  if (changed || info !== state.hoverInfo) {
    state.hoverInfo = info;
    stage.classList.toggle('hovering', !!part);
    refreshMaterials();
    ui.markHot(info);
  }
  if (!state.pinned) {
    if (part) callout.show(PARTS[info], info, part, point, false);
    else callout.hide();
  }
}

function pin(part, point) {
  state.pinned = part.userData.infoId;
  state.pinnedPart = part;
  callout.show(PARTS[state.pinned], state.pinned, part, point, true);
  refreshMaterials();
  ui.markSelected(state.pinned);
  hideToast();
}

function unpin() {
  state.pinned = null;
  state.pinnedPart = null;
  callout.hide();
  refreshMaterials();
  ui.markSelected(null);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unpin();
});

/* ------------------------------------------------------------------ */
/* Camera animation                                                   */
/* ------------------------------------------------------------------ */

const CAMS = {
  hero: { pos: [5.6, 2.3, 5.2], target: [0, 0.4, 0] },
  side: { pos: [0, 0.7, 8.2], target: [0, 0.45, 0] },
  top: { pos: [0, 9.5, 0.01], target: [0, 0.3, 0] },
  front: { pos: [7.8, 1.0, 0], target: [0, 0.45, 0] },
  rear: { pos: [-6.8, 1.6, 1.4], target: [0, 0.45, 0] },
  under: { pos: [3.2, 0.12, 4.0], target: [0, 0.6, 0] },
};
let camTween = null;
/** Pull the camera back on tall/narrow screens so the whole car fits. */
function aspectScale() {
  const a = window.innerWidth / window.innerHeight;
  return a < 1.3 ? Math.min(2.6, 1.35 / a) : 1;
}
function framed(pos, target) {
  const t = new THREE.Vector3(...target);
  return new THREE.Vector3(...pos).sub(t).multiplyScalar(aspectScale()).add(t).toArray();
}
function flyTo(pos, target, dur = 1.0) {
  camTween = {
    t: 0,
    dur,
    p0: camera.position.clone(),
    p1: new THREE.Vector3(...pos),
    t0: controls.target.clone(),
    t1: new THREE.Vector3(...target),
  };
}
function flyToPart(infoId) {
  const group = byInfo.get(infoId);
  if (!group?.length) return;
  const b = new THREE.Box3();
  for (const p of group) b.expandByObject(p);
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(0.35, b.getSize(new THREE.Vector3()).length() * 0.5);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.2) dir.y = 0.35;
  dir.normalize();
  const dist = THREE.MathUtils.clamp(r * 3.2 + 0.6, 1.4, 9);
  const camPos = c.clone().addScaledVector(dir, dist);
  flyTo(camPos.toArray(), c.toArray(), 0.9);
  return camPos;
}

/** A point on the part's surface near its centre, on the side facing `viewPos`. */
function surfacePoint(part, viewPos) {
  const c = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3());
  const toCam = viewPos.clone().sub(c).normalize();
  const v = new THREE.Vector3();
  let best = null;
  let bestScore = Infinity;
  part.updateMatrixWorld(true);
  part.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const d = v.clone().sub(c);
      const score = d.length() - 1.5 * d.dot(toCam);
      if (score < bestScore) {
        bestScore = score;
        best = v.clone();
      }
    }
  });
  return best ?? c;
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const PRESETS = {
  assembled: { explode: 0, off: [] },
  shell: { explode: 0, off: ['body'] },
  wheels: { explode: 0, off: ['wheels'] },
  bare: { explode: 0, off: ['body', 'wheels', 'aero', 'corners'] },
  pu: { explode: 0, off: ['body', 'wheels', 'aero', 'corners', 'cockpit', 'electronics'], xray: true },
  exploded: { explode: 1, off: [] },
};

const ui = initUI({
  state,
  onExplode(v) {
    state.explodeTarget = v;
  },
  onLayer(id, on) {
    state.layers[id] = on;
  },
  onPreset(name) {
    const p = PRESETS[name];
    state.explodeTarget = p.explode;
    for (const l of LAYERS) state.layers[l.id] = !p.off.includes(l.id);
    state.xray = !!p.xray;
    ui.sync();
    refreshMaterials();
    if (name === 'exploded') flyTo(framed([9.6, 4.6, 9.0], [0, 1.05, 0]), [0, 1.05, 0], 1.2);
    else if (state.explode > 0.5) flyTo(framed(CAMS.hero.pos, CAMS.hero.target), CAMS.hero.target, 1.2);
  },
  onView(v) {
    state.view = v;
    refreshMaterials();
  },
  onXray(v) {
    state.xray = v;
    refreshMaterials();
  },
  onDims(v) {
    dims.group.visible = v;
    if (v && state.explodeTarget > 0) {
      state.explodeTarget = 0;
      ui.sync();
    }
  },
  onSpin(v) {
    state.spin = v;
    controls.autoRotate = v;
    controls.autoRotateSpeed = 0.8;
  },
  onAero(mode) {
    state.aeroTarget = mode === 'straight' ? 1 : 0;
  },
  onCompound(c) {
    M.compound.color.set(c);
  },
  onLivery(l) {
    liveryUniforms.uPrimary.value.set(l.primary);
    liveryUniforms.uAccent.value.set(l.accent);
    liveryUniforms.uDark.value.set(l.dark);
    M.helmetAccent.color.set(l.accent);
  },
  onCam(name) {
    const c = CAMS[name];
    flyTo(framed(c.pos, c.target), c.target);
  },
  onPick(infoId) {
    const group = byInfo.get(infoId);
    if (!group) return;
    // make sure its layer is visible
    const layer = group[0].userData.layer;
    if (!state.layers[layer]) {
      state.layers[layer] = true;
      ui.sync();
      // snap the layer back in so the callout anchor is computed at full scale
      for (const p of parts) if (p.userData.layer === layer) p.userData.hideT = 0;
      update(0);
    }
    // turn x-ray off for the picked part's own layer so it's visible
    if (state.xray && group[0].userData.xray) {
      state.xray = false;
      ui.sync();
    }
    const camPos = flyToPart(infoId);
    // prefer the instance nearest the camera (e.g. the near-side tyre)
    const part = group.reduce((a, b) =>
      new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3()).distanceTo(camPos) <=
      new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3()).distanceTo(camPos) ? a : b,
    );
    pin(part, surfacePoint(part, camPos));
  },
  onHoverInfo(infoId) {
    state.hoverInfo = infoId;
    refreshMaterials();
  },
  onCategoryHover(cat) {
    state.categoryHover = cat;
    refreshMaterials();
  },
  counts: Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, Object.values(PARTS).filter((p) => p.cat === k).length])),
});

function hideToast() {
  document.getElementById('toast').classList.add('gone');
}
setTimeout(hideToast, 9000);

/* ------------------------------------------------------------------ */
/* Animation                                                          */
/* ------------------------------------------------------------------ */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let frame = 0;

function update(dt) {
  // explode
  const k = 1 - Math.exp(-dt * 3.2);
  state.explode += (state.explodeTarget - state.explode) * k;
  if (Math.abs(state.explode - state.explodeTarget) < 1e-4) state.explode = state.explodeTarget;
  const lift = ease(Math.min(1, state.explode * 1.6)) * 1.0;
  car.position.y = lift;
  blob.material.opacity = 1 - state.explode * 0.6;
  dims.setOpacity(1 - Math.min(1, state.explode * 10));

  for (const p of parts) {
    const u = p.userData;
    const d = u.delay * 0.5;
    const t = ease(THREE.MathUtils.clamp((state.explode - d) / (1 - d), 0, 1));
    // layer hide animation (scale around the part's own centre)
    const want = state.layers[u.layer] ? 0 : 1;
    u.hideT += (want - u.hideT) * (1 - Math.exp(-dt * 7));
    if (Math.abs(u.hideT - want) < 0.002) u.hideT = want;
    const h = ease(u.hideT);
    const s = 1 - h * 0.999;
    p.visible = u.hideT < 0.995;
    tmp.copy(u.centre).multiplyScalar(1 - s);
    tmp.addScaledVector(u.explode, t);
    tmp.addScaledVector(u.hideDir, h * 0.5);
    p.position.copy(tmp);
    p.scale.copy(u.baseScale).multiplyScalar(s);
  }

  // active aero
  state.aeroT += (state.aeroTarget - state.aeroT) * (1 - Math.exp(-dt * 6));
  const a = ease(state.aeroT);
  aero.frontWing.flapPivots.forEach((pv, i) => (pv.rotation.z = a * aero.frontWing.flapAngles[i]));
  aero.rearWing.flapPivots.forEach((pv, i) => (pv.rotation.z = a * aero.rearWing.flapAngles[i]));

  // camera tween
  if (camTween) {
    camTween.t += dt / camTween.dur;
    const e = ease(Math.min(1, camTween.t));
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();

  // hover picking (throttled)
  if (pointerInside && pointerDirty && !downPos && frame % 2 === 0) {
    pointerDirty = false;
    const hit = pick();
    if (hit) setHover(hit.part, hit.point);
    else setHover(null);
  } else if (!pointerInside && state.hover) {
    setHover(null);
  }
  if (!pointerInside) pointerDirty = false;

  callout.update();
}

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  frame++;
  update(dt);
  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  outline.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// Mark picks from camera orbit changes as dirty so the hover target stays accurate
controls.addEventListener('change', () => (pointerDirty = true));

refreshMaterials();
requestAnimationFrame(() => {
  loop();
  document.getElementById('loading').classList.add('done');
});

// handy for debugging in the console
window.__f1 = {
  THREE, scene, car, reg, state, camera, controls,
  // advance the simulation deterministically (useful when rAF is throttled)
  advance(seconds = 1) {
    for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    composer.render();
    labelRenderer.render(scene, camera);
  },
};
