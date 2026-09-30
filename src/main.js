import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { buildCar } from "./car/build.js";
import { setLiveryColor } from "./car/materials.js";
import { TYRE_SQUASH } from "./car/dims.js";
import { PARTS, CATEGORIES, LAYERS } from "./data/parts.js";
import { createDimensions } from "./dimensions.js";
import { createStudio } from "./studio.js";
import { Callout } from "./ui/callout.js";
import { initUI } from "./ui/panels.js";

/* ------------------------------------------------------------------ */
/* Renderer, scene, camera                                            */
/* ------------------------------------------------------------------ */

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the lights are static, so the shadow map is only redrawn when the car changes
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({
  element: document.getElementById("labels"),
});
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const studio = createStudio(renderer, scene);

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.05,
  100,
);
camera.position.set(5.6, 2.3, 5.2);
{
  const a = window.innerWidth / window.innerHeight;
  if (a < 1.3)
    camera.position
      .sub(new THREE.Vector3(0, 0.4, 0))
      .multiplyScalar(Math.min(3.2, Math.max(1, 1.2 / a)))
      .add(new THREE.Vector3(0, 0.4, 0));
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 28; // portrait phones pull well back to fit the whole car
// keep the camera above the floor, except in the underside view
const MAX_POLAR = Math.PI * 0.495;
controls.maxPolarAngle = MAX_POLAR;
controls.update();

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
  p.userData.bounds = box.clone();
  p.userData.size = box.getSize(new THREE.Vector3()).length();
  p.userData.baseScale = p.scale.clone();
  const e = p.userData.explode;
  p.userData.hideDir =
    e.lengthSq() > 0 ? e.clone().normalize() : new THREE.Vector3(0, 1, 0);
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

const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  samples: 4,
  type: THREE.HalfFloatType,
});
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
// ambient occlusion: grounds the car and darkens crevices (sidepod undercut, wheel wells)
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
// body panels are lofted with mixed winding and rely on DoubleSide
gtao.normalMaterial.side = THREE.DoubleSide;
// AO is soft and low-frequency, so compute it at half resolution (about a
// quarter of the cost); the blend step upsamples it over the full-res image
const GTAO_SCALE = 0.5;
const gtaoSetSize = gtao.setSize.bind(gtao);
gtao.setSize = (w, h) =>
  gtaoSetSize(
    Math.max(1, Math.round(w * GTAO_SCALE)),
    Math.max(1, Math.round(h * GTAO_SCALE)),
  );
gtao.updateGtaoMaterial({
  radius: 0.35,
  distanceExponent: 1.5,
  thickness: 1,
  scale: 1.2,
  samples: 16,
});
gtao.updatePdMaterial({
  lumaPhi: 10,
  depthPhi: 2,
  normalPhi: 3,
  radius: 6,
  rings: 2,
  samples: 16,
});
gtao.blendIntensity = 0.9;
gtao.enabled = !window.matchMedia("(pointer: coarse)").matches; // too heavy for most phones
composer.addPass(gtao);
const outline = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera,
);
outline.edgeStrength = 5;
outline.edgeGlow = 0.6;
outline.edgeThickness = 1.6;
outline.visibleEdgeColor.set('#60a5fa');
outline.hiddenEdgeColor.set('#1e3a5f');
composer.addPass(outline);
composer.addPass(new OutputPass());
// final grade in display space: gentle vignette + dithering to hide banding in the dark falloff
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: window.innerWidth / window.innerHeight },
  },
  vertexShader:
    "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAspect; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(1.25, 0.35, length(d));
      c.rgb *= mix(0.55, 1.0, v);
      c.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

const state = {
  explode: 0,
  explodeTarget: 0,
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, true])),
  view: "real",
  xray: false,
  frame: false, // ghost the painted chassis shells so the internals show through
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
  color: 0xd0d0d0,
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
      // a neutral (white) glow reads much brighter than a category colour, so keep it subtle
      h.emissiveIntensity =
        mat === ghostMat ? 0.6 : color === "#ffffff" ? 0.08 : 0.28;
    }
    if (mat === ghostMat) h.opacity = 0.35;
    hiCache.set(k, h);
  }
  return h;
}

function isGhost(p) {
  return (
    p.userData.xray &&
    (state.xray || (state.frame && p.userData.layer === "chassis"))
  );
}

function refreshMaterials() {
  const hotInfo = new Set();
  if (state.hoverInfo) hotInfo.add(state.hoverInfo);
  if (state.pinned) hotInfo.add(state.pinned);
  for (const p of parts) {
    const info = PARTS[p.userData.infoId];
    const cat = info?.cat ?? "LTC";
    const ghost = isGhost(p);
    const hot =
      hotInfo.has(p.userData.infoId) ||
      (state.categoryHover && state.categoryHover === cat);
    p.traverse((o) => {
      if (!o.isMesh) return;
      let m = o.userData.baseMaterial;
      if (
        state.view === "category" &&
        !m.emissiveMap &&
        !(m.emissiveIntensity > 1)
      )
        m = catMats[cat];
      if (ghost) m = ghostMat;
      if (hot)
        m = highlighted(
          m,
          state.view === "category" || state.categoryHover
            ? CATEGORIES[cat].color
            : "#ffffff",
        );
      o.material = m;
      o.castShadow = !ghost;
    });
  }
  const sel = [];
  for (const id of hotInfo)
    for (const p of byInfo.get(id) ?? []) if (p.visible) sel.push(p);
  if (state.categoryHover)
    for (const p of parts)
      if (PARTS[p.userData.infoId]?.cat === state.categoryHover && p.visible)
        sel.push(p);
  outline.selectedObjects = sel;
  outline.visibleEdgeColor.set(
    state.categoryHover ? CATEGORIES[state.categoryHover].color : '#60a5fa',
  );
  studio.floor.invalidate();
  renderer.shadowMap.needsUpdate = true; // x-ray toggles shadow casting
  requestRender();
}

/* ------------------------------------------------------------------ */
/* Picking                                                            */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let pointerDirty = false;
let downPos = null;

renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return; // touch: no hover, a tap pins instead
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerInside = true;
  pointerDirty = true;
});
renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
  setHover(null);
});
renderer.domElement.addEventListener("pointerdown", (e) => {
  downPos = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener("pointerup", (e) => {
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
  card: document.getElementById("card"),
  svg: document.getElementById("callout-svg"),
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
    stage.classList.toggle("hovering", !!part);
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
}

function unpin() {
  state.pinned = null;
  state.pinnedPart = null;
  callout.hide();
  refreshMaterials();
  ui.markSelected(null);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unpin();
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
  under: { pos: [0, -8.9, 0.01], target: [0, 0.3, 0] },
  exploded: { pos: [9.6, 3.95, 9.0], target: [0, 0.4, 0] },
};
let camTween = null;
/** Pull the camera back on tall/narrow screens so the whole car fits. */
function aspectScale() {
  const a = window.innerWidth / window.innerHeight;
  return a < 1.3 ? Math.min(3.2, Math.max(1, 1.2 / a)) : 1;
}
function framed(pos, target) {
  const t = new THREE.Vector3(...target);
  return new THREE.Vector3(...pos)
    .sub(t)
    .multiplyScalar(aspectScale())
    .add(t)
    .toArray();
}
/** Animate the camera; `below` lets it (and the user) orbit under the floor. */
/**
 * How far the centre of the (visible) car has moved at explode amount `e`,
 * relative to the assembled car: parts fly outward and the whole car lifts.
 */
const _cb = new THREE.Box3();
const _pb = new THREE.Box3();
const _eo = new THREE.Vector3();
function explodeCentre(e, out) {
  _cb.makeEmpty();
  for (const p of parts) {
    const u = p.userData;
    if (!state.layers[u.layer]) continue;
    const d = u.delay * 0.5;
    const t = ease(THREE.MathUtils.clamp((e - d) / (1 - d), 0, 1));
    _cb.union(
      _pb.copy(u.bounds).translate(_eo.copy(u.explode).multiplyScalar(t)),
    );
  }
  _cb.getCenter(out);
  out.y += ease(Math.min(1, e * 1.6)) * 1.0; // the whole car lifts as it explodes
  return out;
}
const _c0 = new THREE.Vector3();
function explodeOffset(e) {
  return explodeCentre(e, new THREE.Vector3()).sub(explodeCentre(0, _c0));
}
/** A camera preset's [position, target], shifted to follow the exploded car. */
function pose({ pos, target }) {
  const off = explodeOffset(state.explode).toArray();
  const t = target.map((v, i) => v + off[i]);
  return [
    framed(
      pos.map((v, i) => v + off[i]),
      t,
    ),
    t,
  ];
}

function flyTo(pos, target, dur = 1.0, below = false) {
  if (below) controls.maxPolarAngle = Math.PI;
  const t0 = controls.target.clone();
  const t1 = new THREE.Vector3(...target);
  const o0 = camera.position.clone().sub(t0);
  const o1 = new THREE.Vector3(...pos).sub(t1);
  camTween = {
    t: 0,
    dur,
    below,
    t0,
    t1,
    // swing around the target instead of cutting straight through the car
    d0: o0.clone().normalize(),
    rot: new THREE.Quaternion().setFromUnitVectors(
      o0.clone().normalize(),
      o1.clone().normalize(),
    ),
    r0: o0.length(),
    r1: o1.length(),
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
  shell: { explode: 0, off: ["body"], frame: true },
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
    state.frame = !!p.frame;
    ui.sync();
    refreshMaterials();
    if (name === "exploded") flyTo(...pose(CAMS.exploded), 1.2);
    else if (state.explode > 0.5) flyTo(...pose(CAMS.hero), 1.2);
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
    studio.floor.invalidate();
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
  onCompound(c) {
    M.compound.color.set(c);
    studio.floor.invalidate();
  },
  onPaint(c) {
    setLiveryColor(c);
    studio.floor.invalidate();
  },
  onCam(name) {
    flyTo(...pose(CAMS[name]), 1.0, name === "under");
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
      for (const p of parts)
        if (p.userData.layer === layer) p.userData.hideT = 0;
      update(0);
    }
    // turn x-ray off for the picked part's own layer so it's visible
    if (isGhost(group[0])) {
      state.xray = false;
      state.frame = false;
      ui.sync();
    }
    const camPos = flyToPart(infoId);
    // prefer the instance nearest the camera (e.g. the near-side tyre)
    const part = group.reduce((a, b) =>
      new THREE.Box3()
        .setFromObject(a)
        .getCenter(new THREE.Vector3())
        .distanceTo(camPos) <=
      new THREE.Box3()
        .setFromObject(b)
        .getCenter(new THREE.Vector3())
        .distanceTo(camPos)
        ? a
        : b,
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
  counts: Object.fromEntries(
    Object.keys(CATEGORIES).map((k) => [
      k,
      Object.values(PARTS).filter((p) => p.cat === k).length,
    ]),
  ),
});

/* ------------------------------------------------------------------ */
/* Animation                                                          */
/* ------------------------------------------------------------------ */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let frame = 0;
let lastSig = NaN;

/*
 * Render on demand: the scene is only drawn when something visible changed
 * (camera, animation, hover, UI). An idle view costs no GPU time at all.
 */
let pendingFrames = 2;
function requestRender(frames = 1) {
  pendingFrames = Math.max(pendingFrames, frames);
}

/** Keep the orbit centred on the car as it explodes: move camera and target together. */
const _f0 = new THREE.Vector3();
const _f1 = new THREE.Vector3();
function followExplode(from, to) {
  const shift = explodeCentre(to, _f1).sub(explodeCentre(from, _f0));
  controls.target.add(shift);
  camera.position.add(shift);
  if (camTween) {
    camTween.t0.add(shift);
    camTween.t1.add(shift);
  }
}

function update(dt) {
  // explode
  const k = 1 - Math.exp(-dt * 3.2);
  const prevExplode = state.explode;
  state.explode += (state.explodeTarget - state.explode) * k;
  if (Math.abs(state.explode - state.explodeTarget) < 1e-4)
    state.explode = state.explodeTarget;
  if (state.explode !== prevExplode) followExplode(prevExplode, state.explode);
  const lift = ease(Math.min(1, state.explode * 1.6)) * 1.0;
  car.position.y = lift - TYRE_SQUASH;
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
  if (Math.abs(state.aeroT - state.aeroTarget) < 1e-4)
    state.aeroT = state.aeroTarget;
  const a = ease(state.aeroT);
  aero.frontWing.flapPivots.forEach(
    (pv, i) => (pv.rotation.z = a * aero.frontWing.flapAngles[i]),
  );
  aero.rearWing.flapPivots.forEach(
    (pv, i) => (pv.rotation.z = a * aero.rearWing.flapAngles[i]),
  );

  // refresh contact shadows / floor reflection only while the car is changing
  let sig = state.explode * 7.1 + state.aeroT * 3.3;
  for (const p of parts) sig += p.userData.hideT;
  if (sig !== lastSig) {
    lastSig = sig;
    studio.invalidate();
    renderer.shadowMap.needsUpdate = true;
    requestRender();
  }

  // camera tween
  if (camTween) {
    camTween.t += dt / camTween.dur;
    const e = ease(Math.min(1, camTween.t));
    const { t0, t1, d0, rot, r0, r1 } = camTween;
    controls.target.lerpVectors(t0, t1, e);
    const dir = d0
      .clone()
      .applyQuaternion(new THREE.Quaternion().slerp(rot, e));
    camera.position
      .copy(controls.target)
      .addScaledVector(dir, THREE.MathUtils.lerp(r0, r1, e));
    if (camTween.t >= 1) {
      if (!camTween.below) controls.maxPolarAngle = MAX_POLAR;
      camTween = null;
    }
    requestRender();
  }
  controls.update();

  // from below, drop the floor and light the underside
  const below = camera.position.y < 0.02;
  if (below !== studio.underside) {
    studio.setUnderside(below);
    requestRender();
  }

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

  // phones dock the card at the bottom: slide the view up so the pinned part stays visible
  const card = document.getElementById("card");
  const wantShift =
    window.innerWidth < 600 && state.pinned
      ? Math.min(card.offsetHeight * 0.5, window.innerHeight * 0.25)
      : 0;
  if (Math.abs(wantShift - viewShift) > 0.5) {
    viewShift += (wantShift - viewShift) * (1 - Math.exp(-dt * 8));
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(viewShift) < 0.5 && wantShift === 0) {
      viewShift = 0;
      camera.clearViewOffset();
    } else camera.setViewOffset(w, h, 0, viewShift, w, h);
    requestRender();
  }

  callout.update();
}
let viewShift = 0;

// Cap drawing at ~60 fps: high-refresh displays would otherwise double the GPU load
const MIN_FRAME_MS = 1000 / 61;
let lastRenderAt = 0;

function render() {
  studio.update([dims.group]);
  composer.render();
  labelRenderer.render(scene, camera);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  frame++;
  update(dt);
  if (pendingFrames > 0 && now - lastRenderAt >= MIN_FRAME_MS) {
    pendingFrames--;
    lastRenderAt = now;
    render();
  }
}

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  if (viewShift) camera.setViewOffset(w, h, 0, viewShift, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h); // also resizes every pass at the current pixel ratio
  labelRenderer.setSize(w, h);
  grade.uniforms.uAspect.value = w / h;
  studio.setSize(w, h);
  requestRender();
});

// Mark picks from camera orbit changes as dirty so the hover target stays accurate
controls.addEventListener("change", () => {
  pointerDirty = true;
  requestRender();
});
// any UI interaction (compound, toggles…) may change the picture
for (const type of ["input", "change", "click", "keydown"])
  document.addEventListener(type, () => requestRender(2), true);
// canvas textures (tyre lettering, race numbers) redraw once the web fonts load
document.fonts?.ready.then(() => requestRender());

refreshMaterials();
requestAnimationFrame((now) => {
  loop(now);
  document.getElementById("loading").classList.add("done");
});

// handy for debugging in the console
window.__f1 = {
  THREE,
  scene,
  car,
  reg,
  state,
  camera,
  controls,
  studio,
  renderer,
  composer,
  // advance the simulation deterministically (useful when rAF is throttled)
  explodeOffset,
  advance(seconds = 1) {
    for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    render();
  },
  exportCar() {
    const originalColors = new Map();
    let liveryMat = null;

    car.traverse((o) => {
      if (
        o.isMesh &&
        o.material &&
        o.material.userData &&
        o.material.userData.livery
      ) {
        liveryMat = o.material;
        const pos = o.geometry.attributes.position;
        const norm = o.geometry.attributes.normal;
        if (!pos || !norm) return;

        const colors = new Float32Array(pos.count * 3);
        const smoothstep = (edge0, edge1, x) => {
          const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
          return t * t * (3 - 2 * t);
        };

        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          const nx = norm.getX(i);
          const ny = norm.getY(i);
          const nz = norm.getZ(i);

          let r = 0.01,
            g = 0.15,
            b = 0.65; // telemetryBlue

          const spineWidth = 0.15 + smoothstep(1.5, 0.0, x) * 0.1;
          if (Math.abs(z) < spineWidth && y > 0.25) {
            r = 0.95;
            g = 0.95;
            b = 0.95;
          }

          const sweep = x + Math.abs(z) * 1.5;
          if (sweep > -0.5 && sweep < 0.5 && y > 0.3) {
            r = 0.95;
            g = 0.95;
            b = 0.95;
          }

          if (r === 0.01 && y > 0.2 && x < 1.0 && x > -1.0) {
            let px = (x * 10.0) % 1.0;
            if (px < 0) px += 1.0;
            px -= 0.5;
            let py = ((z + y) * 10.0) % 1.0;
            if (py < 0) py += 1.0;
            py -= 0.5;
            const d = Math.sqrt(px * px + py * py);
            const circuit = smoothstep(0.4, 0.45, d) * smoothstep(0.5, 0.45, d);
            const t = circuit * 0.3;
            r = r * (1 - t) + 0.2 * t;
            g = g * (1 - t) + 0.4 * t;
            b = b * (1 - t) + 0.9 * t;
          }

          const dark = 1.0 - smoothstep(-0.7, -0.45, ny);
          const dr = 0.051,
            dg = 0.043,
            db = 0.047; // #0d0b0c
          r = r * (1 - dark) + dr * dark;
          g = g * (1 - dark) + dg * dark;
          b = b * (1 - dark) + db * dark;

          const seam = 1.0 - smoothstep(0.0006, 0.0016, Math.abs(x - 1.8));
          const mult = 1.0 - 0.55 * seam;
          r *= mult;
          g *= mult;
          b *= mult;

          // convert from linear to srgb for export since GLTF expects sRGB vertex colors
          colors[i * 3] =
            r <= 0.0031308 ? r * 12.92 : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
          colors[i * 3 + 1] =
            g <= 0.0031308 ? g * 12.92 : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
          colors[i * 3 + 2] =
            b <= 0.0031308 ? b * 12.92 : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;
        }

        if (o.geometry.attributes.color) {
          originalColors.set(o, o.geometry.attributes.color);
        }
        o.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      }
    });

    const oldVc = liveryMat ? liveryMat.vertexColors : false;
    if (liveryMat) liveryMat.vertexColors = true;

    const exporter = new GLTFExporter();
    exporter.parse(
      car,
      (gltf) => {
        // cleanup
        car.traverse((o) => {
          if (
            o.isMesh &&
            o.material &&
            o.material.userData &&
            o.material.userData.livery
          ) {
            if (originalColors.has(o)) {
              o.geometry.setAttribute("color", originalColors.get(o));
            } else {
              o.geometry.deleteAttribute("color");
            }
          }
        });
        if (liveryMat) liveryMat.vertexColors = oldVc;

        const blob = new Blob([gltf], { type: "application/octet-stream" });
        const link = document.createElement("a");
        link.style.display = "none";
        link.href = URL.createObjectURL(blob);
        link.download = "f1_2026_model.glb";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      },
      (error) => console.error("An error happened during parsing", error),
      { binary: true },
    );
  },
};
