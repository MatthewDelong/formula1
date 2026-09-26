import * as THREE from 'three';
import { loftRings, loftStations, resampleStations, superRing, superPoint, tubeThrough, strut, plateXY, smoothOutline } from './geometry.js';
import { addMesh } from './registry.js';
import { EXHAUST_EXIT, ROLL_HOOP_TOP } from './dims.js';

/* ------------------------------------------------------------------ */
/* Survival cell + nose                                               */
/* ------------------------------------------------------------------ */

const NOSE_KEYS = [
  { x: 2.665, cy: 0.212, w: 0.028, hT: 0.02, hB: 0.024, n: 2.2, tw: 1 },
  { x: 2.61, cy: 0.218, w: 0.062, hT: 0.043, hB: 0.048, n: 2.4, tw: 0.95 },
  { x: 2.42, cy: 0.248, w: 0.094, hT: 0.064, hB: 0.064, n: 2.8, tw: 0.9 },
  { x: 2.16, cy: 0.292, w: 0.114, hT: 0.08, hB: 0.08, n: 3, tw: 0.86 },
  { x: 1.94, cy: 0.338, w: 0.128, hT: 0.094, hB: 0.098, n: 3, tw: 0.84 },
  { x: 1.8, cy: 0.37, w: 0.135, hT: 0.1, hB: 0.11, n: 3, tw: 0.82 },
];

const TUB_KEYS = [
  { x: 1.8, cy: 0.37, w: 0.135, hT: 0.1, hB: 0.11, n: 3, tw: 0.82, bw: 0.9 },
  { x: 1.56, cy: 0.42, w: 0.15, hT: 0.135, hB: 0.17, n: 3.2, tw: 0.8, bw: 0.85 },
  { x: 1.22, cy: 0.44, w: 0.19, hT: 0.17, hB: 0.27, n: 3.5, tw: 0.76, bw: 0.8 },
  { x: 0.86, cy: 0.4, w: 0.25, hT: 0.22, hB: 0.31, n: 3.6, tw: 0.72, bw: 0.82 },
  { x: 0.56, cy: 0.38, w: 0.3, hT: 0.25, hB: 0.31, n: 3.8, tw: 0.72, bw: 0.85 },
  { x: 0.2, cy: 0.37, w: 0.315, hT: 0.26, hB: 0.3, n: 4, tw: 0.76, bw: 0.88 },
  { x: -0.1, cy: 0.37, w: 0.315, hT: 0.26, hB: 0.3, n: 4, tw: 0.8, bw: 0.9 },
  { x: -0.46, cy: 0.37, w: 0.29, hT: 0.25, hB: 0.3, n: 4, tw: 0.8, bw: 0.9 },
];

// Cockpit opening half-width as a function of x
const COCKPIT_FRONT = 0.66;
const COCKPIT_REAR = -0.08;
function openingHalfWidth(x) {
  const t = THREE.MathUtils.clamp((COCKPIT_FRONT - x) / 0.2, 0, 1);
  const front = Math.sin((t * Math.PI) / 2); // rounded front
  const r = THREE.MathUtils.clamp((x - COCKPIT_REAR) / 0.06, 0, 1);
  return 0.215 * front * (0.35 + 0.65 * Math.sqrt(r));
}

/** Angle (from +z towards top) where the superRing's z equals `halfW` on the upper half. */
function angleForHalfWidth(s, halfW) {
  let lo = 0.0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const z = superPoint(s, mid).z;
    if (z > halfW) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** U-shaped cockpit cross-section with wall thickness. */
function cockpitRing(s, count = 64) {
  const ow = Math.max(0.02, openingHalfWidth(s.x));
  const a0 = angleForHalfWidth(s, ow); // right rim (z>0 side), measured from +z
  const th = 0.022;
  const inner = { ...s, w: s.w - th, hT: s.hT - th, hB: s.hB - th * 1.4 };
  const a1 = angleForHalfWidth(inner, ow - 0.004);
  const half = count / 2;
  const pts = [];
  // outer: from left rim (PI - a0) sweeping down through the bottom to right rim (2PI + a0)
  for (let i = 0; i < half; i++) {
    const t = i / (half - 1);
    pts.push(superPoint(s, Math.PI - a0 + t * (Math.PI + 2 * a0)));
  }
  // inner: back from right rim to left rim
  for (let i = 0; i < half; i++) {
    const t = i / (half - 1);
    pts.push(superPoint(inner, 2 * Math.PI + a1 - t * (Math.PI + 2 * a1)));
  }
  return pts;
}

export function buildChassis(reg, M) {
  // Nose / front impact structure
  const nose = reg.part({ id: 'nose', info: 'nose', layer: 'chassis', explode: [0.95, 0.12, 0], delay: 0.1, xray: true });
  addMesh(nose, loftStations(NOSE_KEYS, { steps: 10, around: 48, capStart: true, capEnd: true }), M.livery);

  // Survival cell: front closed section, open cockpit, rear closed section
  const cell = reg.part({ id: 'survival-cell', info: 'survival-cell', layer: 'chassis', explode: [0, 0, 0], xray: true });
  const st = resampleStations(TUB_KEYS, 10);
  const front = st.filter((s) => s.x >= COCKPIT_FRONT - 0.001);
  const cockpit = st.filter((s) => s.x <= COCKPIT_FRONT + 0.03 && s.x >= COCKPIT_REAR - 0.03);
  const rear = st.filter((s) => s.x <= COCKPIT_REAR + 0.001);
  addMesh(cell, loftRings(front.map((s) => superRing(s, 64)), { capStart: false, capEnd: true }), M.livery);
  addMesh(cell, loftRings(cockpit.map((s) => cockpitRing(s, 64)), { capStart: false, capEnd: false }), M.livery);
  addMesh(cell, loftRings(rear.map((s) => superRing(s, 64)), { capStart: true, capEnd: true }), M.livery);

  // cockpit rim trim (dark edge) to emphasise the opening
  const rimPts = [];
  for (let i = 0; i <= 40; i++) {
    const x = COCKPIT_FRONT - (i / 40) * (COCKPIT_FRONT - COCKPIT_REAR + 0.01);
    const s = interpStation(st, x);
    const ow = Math.max(0.02, openingHalfWidth(x));
    const a = angleForHalfWidth(s, ow);
    rimPts.push(superPoint(s, a));
  }
  const rimL = rimPts;
  const rimR = rimPts.map((p) => new THREE.Vector3(p.x, p.y, -p.z)).reverse();
  addMesh(cell, tubeThrough([...rimL, ...rimR], 0.012, { tubular: 120, radial: 8, closed: true }), M.padding);

  return { cell, nose };
}

function interpStation(stations, x) {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if ((x <= a.x && x >= b.x) || (x >= a.x && x <= b.x)) {
      const t = (x - a.x) / (b.x - a.x || 1);
      const o = { ...a };
      for (const k of Object.keys(a)) if (typeof a[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * t;
      return o;
    }
  }
  return stations[stations.length - 1];
}

/* ------------------------------------------------------------------ */
/* Bodywork                                                           */
/* ------------------------------------------------------------------ */

const SIDEPOD_LIP = { x: 0.535, cz: 0.47, w: 0.165, cy: 0.445, hT: 0.09, hB: 0.095, n: 4.5, nB: 4 };
const SIDEPOD_KEYS = [
  SIDEPOD_LIP,
  { x: 0.44, cz: 0.476, w: 0.188, cy: 0.405, hT: 0.142, hB: 0.25, n: 4, nB: 2.4 },
  { x: 0.16, cz: 0.47, w: 0.22, cy: 0.38, hT: 0.158, hB: 0.3, n: 3.4, nB: 2.2 },
  { x: -0.24, cz: 0.43, w: 0.208, cy: 0.34, hT: 0.14, hB: 0.27, n: 3.2, nB: 2.2 },
  { x: -0.64, cz: 0.36, w: 0.15, cy: 0.295, hT: 0.11, hB: 0.225, n: 3, nB: 2.2 },
  { x: -1.0, cz: 0.28, w: 0.09, cy: 0.245, hT: 0.085, hB: 0.175, n: 2.8, nB: 2.2 },
  { x: -1.3, cz: 0.215, w: 0.045, cy: 0.215, hT: 0.06, hB: 0.13, n: 2.5, nB: 2.2 },
];

const ENGINE_COVER_KEYS = [
  { x: -0.2, cy: 0.47, w: 0.2, hT: 0.16, hB: 0.3, n: 3, tw: 0.55 },
  { x: -0.45, cy: 0.5, w: 0.25, hT: 0.23, hB: 0.34, n: 3, tw: 0.52 },
  { x: -0.72, cy: 0.5, w: 0.265, hT: 0.235, hB: 0.34, n: 3, tw: 0.5 },
  { x: -1.05, cy: 0.47, w: 0.225, hT: 0.2, hB: 0.3, n: 3, tw: 0.5 },
  { x: -1.42, cy: 0.445, w: 0.145, hT: 0.14, hB: 0.26, n: 3, tw: 0.55 },
  { x: -1.78, cy: 0.445, w: 0.08, hT: 0.09, hB: 0.2, n: 2.6, tw: 0.7 },
  { x: EXHAUST_EXIT.x + 0.02, cy: EXHAUST_EXIT.y, w: 0.062, hT: 0.062, hB: 0.07, n: 2.2 },
];

const H = ROLL_HOOP_TOP; // ~1.013
const AIRBOX_KEYS = [
  { x: -0.2, cy: H - 0.11, w: 0.064, hT: 0.068, hB: 0.064, n: 2.6, tw: 0.62 },
  { x: -0.3, cy: H - 0.12, w: 0.088, hT: 0.11, hB: 0.13, n: 2.6, tw: 0.55 },
  { x: -0.44, cy: H - 0.18, w: 0.13, hT: 0.16, hB: 0.2, n: 2.8, tw: 0.5 },
  { x: -0.62, cy: H - 0.26, w: 0.17, hT: 0.17, hB: 0.26, n: 3, tw: 0.5 },
  { x: -0.82, cy: H - 0.36, w: 0.2, hT: 0.14, hB: 0.3, n: 3, tw: 0.5 },
];

export function buildBodywork(reg, M) {
  /* Sidepods (left, then mirrored) */
  const sp = reg.part({ id: 'sidepod-L', info: 'sidepods', layer: 'body', explode: [0, 0.35, 1.0], delay: 0.05, xray: true });
  addMesh(sp, loftStations(SIDEPOD_KEYS, { steps: 10, around: 56, capStart: false, capEnd: true }), M.livery);
  // inlet duct (dark) with recessed back face
  const lipRing = superRing(SIDEPOD_LIP, 56);
  const innerRing = superRing({ ...SIDEPOD_LIP, x: 0.44, w: SIDEPOD_LIP.w * 0.82, hT: SIDEPOD_LIP.hT * 0.75, hB: SIDEPOD_LIP.hB * 0.75 }, 56);
  addMesh(sp, loftRings([lipRing, innerRing], { capEnd: true }), M.inlet);
  // lip bead
  addMesh(sp, tubeThrough(lipRing, 0.008, { closed: true, tubular: 80, radial: 6 }), M.livery);
  // cooling louvres on the sidepod shoulder
  for (let i = 0; i < 6; i++) {
    const x = -0.28 - i * 0.07;
    const s = interpStation(resampleStations(SIDEPOD_KEYS, 10), x);
    const p = superPoint(s, Math.PI * 0.42);
    const box = new THREE.BoxGeometry(0.022, 0.008, 0.09 - i * 0.008);
    box.rotateX(-0.35);
    box.translate(p.x, p.y + 0.002, p.z - 0.005);
    addMesh(sp, box, M.inlet);
  }
  reg.mirror(sp, 'sidepod-R');

  /* Wheel-wake control boards (new for 2026) */
  const wb = reg.part({ id: 'wake-board-L', info: 'wake-boards', layer: 'body', explode: [0.2, 0.15, 0.85], delay: 0.1 });
  const board = plateXY(smoothOutline([[0.98, 0.075], [0.97, 0.2], [0.9, 0.25], [0.78, 0.24], [0.72, 0.15], [0.74, 0.07]], 60), 0.008, 0, 0.0015);
  board.rotateY(-0.12);
  board.translate(0, 0, 0.6);
  addMesh(wb, board, M.carbon);
  reg.mirror(wb, 'wake-board-R');

  /* Engine cover */
  const ec = reg.part({ id: 'engine-cover', info: 'engine-cover', layer: 'body', explode: [-0.35, 1.25, 0], delay: 0.0, xray: true });
  addMesh(ec, loftStations(ENGINE_COVER_KEYS, { steps: 10, around: 64, capStart: true, capEnd: false }), M.livery);
  // exhaust exit opening
  const exitRing = superRing({ x: EXHAUST_EXIT.x + 0.02, cy: EXHAUST_EXIT.y, w: 0.062, hT: 0.062, hB: 0.07, n: 2.2 }, 64);
  addMesh(ec, loftRings([exitRing, exitRing.map((p) => p.clone().add(new THREE.Vector3(0.03, 0, 0)).lerp(new THREE.Vector3(p.x + 0.03, EXHAUST_EXIT.y, 0), 0.15))], { capEnd: true }), M.inlet);

  /* Roll structure / airbox */
  const rs = reg.part({ id: 'roll-structure', info: 'roll-structure', layer: 'chassis', explode: [-0.15, 1.95, 0], delay: 0.1, xray: true });
  addMesh(rs, loftStations(AIRBOX_KEYS, { steps: 10, around: 48, capStart: false, capEnd: true }), M.livery);
  const aLip = superRing(AIRBOX_KEYS[0], 48);
  const aIn = superRing({ ...AIRBOX_KEYS[0], x: -0.26, w: 0.046, hT: 0.048, hB: 0.045 }, 48);
  addMesh(rs, loftRings([aLip, aIn], { capEnd: true }), M.inlet);
  addMesh(rs, tubeThrough(aLip, 0.006, { closed: true, tubular: 64, radial: 6 }), M.livery);

  /* Halo */
  const halo = reg.part({ id: 'halo', info: 'halo', layer: 'chassis', explode: [0.5, 0.9, 0], delay: 0.2, xray: true });
  const hp = [
    [-0.06, 0.62, 0.262],
    [0.06, 0.745, 0.268],
    [0.26, 0.8, 0.228],
    [0.42, 0.818, 0.13],
    [0.5, 0.824, 0.0],
    [0.42, 0.818, -0.13],
    [0.26, 0.8, -0.228],
    [0.06, 0.745, -0.268],
    [-0.06, 0.62, -0.262],
  ];
  addMesh(halo, tubeThrough(hp, 0.021, { tubular: 140, radial: 16 }), M.livery);
  addMesh(halo, strut(new THREE.Vector3(0.49, 0.83, 0), new THREE.Vector3(0.72, 0.6, 0), { chord: 0.07, thick: 0.035, flow: new THREE.Vector3(0, 0, 1) }), M.livery);
  // mounting feet
  for (const z of [0.262, -0.262]) {
    const f = new THREE.BoxGeometry(0.07, 0.03, 0.05);
    f.translate(-0.06, 0.615, z);
    addMesh(halo, f, M.titanium);
  }

  /* Mirrors (with 2026 lateral energy-status lights) */
  const mir = reg.part({ id: 'mirror-L', info: 'mirrors', layer: 'body', explode: [0.15, 0.55, 0.6], delay: 0.25 });
  const mk = [
    { x: 0.575, cy: 0.71, cz: 0.405, w: 0.06, hT: 0.032, hB: 0.032, n: 3.2 },
    { x: 0.53, cy: 0.71, cz: 0.405, w: 0.068, hT: 0.036, hB: 0.036, n: 3.5 },
    { x: 0.49, cy: 0.71, cz: 0.405, w: 0.068, hT: 0.036, hB: 0.036, n: 4 },
  ];
  addMesh(mir, loftStations(mk, { steps: 6, around: 40, capStart: true, capEnd: false }), M.livery);
  const glass = new THREE.PlaneGeometry(0.125, 0.06);
  glass.rotateY(-Math.PI / 2);
  glass.translate(0.492, 0.71, 0.405);
  addMesh(mir, glass, M.mirror);
  addMesh(mir, strut(new THREE.Vector3(0.53, 0.68, 0.39), new THREE.Vector3(0.49, 0.56, 0.33), { chord: 0.05, thick: 0.012 }), M.livery);
  const lat = new THREE.BoxGeometry(0.03, 0.012, 0.004);
  lat.translate(0.53, 0.71, 0.405 + 0.071);
  addMesh(mir, lat, M.ledGreen);
  reg.mirror(mir, 'mirror-R');
}
