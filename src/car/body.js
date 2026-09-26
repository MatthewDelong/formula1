import * as THREE from 'three';
import { loftRings, loftStations, resampleStations, superRing, superPoint, tubeThrough, strut, plateXY, smoothOutline } from './geometry.js';
import { addMesh } from './registry.js';
import { EXHAUST_EXIT, ROLL_HOOP_TOP } from './dims.js';

/* ------------------------------------------------------------------ */
/* Survival cell + nose                                               */
/* ------------------------------------------------------------------ */

// Ground-effect era nose: long, low and flat-bottomed, with a blunt, wide
// tip that sits on the front wing's mainplane rather than floating above it.
const NOSE_KEYS = [
  { x: 2.738, cy: 0.186, w: 0.05, hT: 0.022, hB: 0.02, n: 3.2 },
  { x: 2.71, cy: 0.19, w: 0.074, hT: 0.036, hB: 0.028, n: 3.4, nB: 4 },
  { x: 2.56, cy: 0.207, w: 0.088, hT: 0.05, hB: 0.042, n: 3.4, nB: 4, tw: 0.92 },
  { x: 2.35, cy: 0.238, w: 0.1, hT: 0.066, hB: 0.06, n: 3.2, nB: 3.8, tw: 0.88 },
  { x: 2.12, cy: 0.292, w: 0.115, hT: 0.082, hB: 0.08, n: 3, nB: 3.4, tw: 0.86 },
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

// Modern (2022+) sidepod, described per station by a handful of section
// landmarks (left side, car-space metres):
//   zi / zo    inner edge (buried in the chassis) / outer shoulder
//   yti / yto  top surface height at the inner edge / at the shoulder — the
//              drop between them is the "downwash" ramp
//   ys         height of the widest point
//   zu / yb    the undercut: the lowest outer point sits well inboard of the
//              shoulder, so the bodywork tucks in sharply beneath the inlet
// The inlet is a wide, high letterbox; behind it the top ramps down toward
// the floor and the whole pod tapers into a tight coke-bottle ahead of the
// rear tyres.
const SIDEPOD_LIP = { x: 0.565, zi: 0.22, zo: 0.64, yti: 0.565, yto: 0.555, ys: 0.535, zu: 0.52, yb: 0.43 };
const SIDEPOD_KEYS = [
  SIDEPOD_LIP,
  { x: 0.52, zi: 0.2, zo: 0.655, yti: 0.58, yto: 0.565, ys: 0.54, zu: 0.48, yb: 0.39 },
  { x: 0.4, zi: 0.19, zo: 0.665, yti: 0.575, yto: 0.555, ys: 0.525, zu: 0.42, yb: 0.27 },
  { x: 0.15, zi: 0.19, zo: 0.665, yti: 0.56, yto: 0.525, ys: 0.49, zu: 0.4, yb: 0.12 },
  { x: -0.22, zi: 0.19, zo: 0.63, yti: 0.53, yto: 0.47, ys: 0.435, zu: 0.4, yb: 0.08 },
  { x: -0.62, zi: 0.18, zo: 0.57, yti: 0.485, yto: 0.4, ys: 0.36, zu: 0.38, yb: 0.07 },
  { x: -1.0, zi: 0.17, zo: 0.47, yti: 0.415, yto: 0.34, ys: 0.3, zu: 0.33, yb: 0.07 },
  { x: -1.3, zi: 0.16, zo: 0.36, yti: 0.345, yto: 0.29, ys: 0.26, zu: 0.27, yb: 0.07 },
  { x: -1.48, zi: 0.16, zo: 0.26, yti: 0.29, yto: 0.255, ys: 0.23, zu: 0.21, yb: 0.07 },
];

/** Section control points (z, y) for a sidepod station, in loft order. */
function sidepodControl(s) {
  const { zi, zo, yti, yto, ys, zu, yb } = s;
  return [
    [zi, yti], // top, inner (inside the chassis)
    [zi + 0.5 * (zo - zi), yti + 0.55 * (yto - yti)], // downwash ramp
    [zo - 0.035, yto], // shoulder
    [zo, ys], // widest point
    [zo - 0.03, ys - 0.35 * (ys - yb)], // outer wall rolls under...
    [zu + 0.25 * (zo - zu), yb + 0.2 * (ys - yb)], // ...into the undercut
    [zu, yb], // lowest outer point
    [zi, yb], // bottom, inner
    [zi - 0.01, 0.5 * (yti + yb)], // inner wall (hidden)
  ];
}

/** Smooth closed sidepod section; points correspond between stations so lofts don't twist. */
function sidepodRing(s, count = 72) {
  const ctrl = sidepodControl(s).map(([z, y]) => new THREE.Vector3(s.x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const pts = [];
  for (let i = 0; i < count; i++) pts.push(curve.getPoint(i / count));
  return pts;
}

/** Shrink a ring toward its centroid (used for recessed inlet ducts). */
function insetRing(ring, scale, dx) {
  const c = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  return ring.map((p) => p.clone().sub(c).multiplyScalar(scale).add(c).add(new THREE.Vector3(dx, 0, 0)));
}

// Tightly wrapped engine cover: a narrow, near-triangular spine (small tw)
// that descends gently from the airbox to the rear wing, and a pronounced
// coke-bottle waist tapering into the single central tailpipe.
const ENGINE_COVER_KEYS = [
  { x: -0.2, cy: 0.47, w: 0.2, hT: 0.16, hB: 0.3, n: 3, tw: 0.5 },
  { x: -0.45, cy: 0.52, w: 0.23, hT: 0.3, hB: 0.36, n: 3, tw: 0.3 },
  { x: -0.72, cy: 0.52, w: 0.235, hT: 0.36, hB: 0.36, n: 3, tw: 0.26 },
  { x: -1.05, cy: 0.48, w: 0.2, hT: 0.32, hB: 0.3, n: 3, tw: 0.28 },
  { x: -1.42, cy: 0.44, w: 0.135, hT: 0.24, hB: 0.26, n: 2.8, tw: 0.35 },
  { x: -1.78, cy: 0.445, w: 0.07, hT: 0.12, hB: 0.2, n: 2.6, tw: 0.6 },
  { x: EXHAUST_EXIT.x + 0.02, cy: EXHAUST_EXIT.y, w: 0.062, hT: 0.062, hB: 0.07, n: 2.2 },
];

const H = ROLL_HOOP_TOP; // ~1.013
// Roll structure + airbox: a near-triangular intake right behind the driver's
// head, flowing into a narrow spine that blends down into the engine cover.
// (bw > 1 flares the base so the airbox blends into the engine cover
// instead of standing on it like a snorkel)
const AIRBOX_KEYS = [
  { x: -0.19, cy: H - 0.088, w: 0.07, hT: 0.072, hB: 0.058, n: 2.4, tw: 0.34 },
  { x: -0.3, cy: H - 0.12, w: 0.1, hT: 0.12, hB: 0.2, n: 2.6, tw: 0.3, bw: 1.5 },
  { x: -0.46, cy: H - 0.2, w: 0.13, hT: 0.18, hB: 0.3, n: 2.8, tw: 0.28, bw: 1.6 },
  { x: -0.64, cy: H - 0.3, w: 0.15, hT: 0.26, hB: 0.3, n: 3, tw: 0.26, bw: 1.3 },
  { x: -0.84, cy: 0.62, w: 0.17, hT: 0.3, hB: 0.25, n: 3, tw: 0.26 },
  // ends just under the engine-cover spine so its end cap stays hidden
  { x: -1.05, cy: 0.55, w: 0.16, hT: 0.24, hB: 0.2, n: 3, tw: 0.28 },
];

export function buildBodywork(reg, M) {
  /* Sidepods (left, then mirrored) */
  const sp = reg.part({ id: 'sidepod-L', info: 'sidepods', layer: 'body', explode: [0, 0.35, 1.0], delay: 0.05, xray: true });
  addMesh(sp, loftStations(SIDEPOD_KEYS, { steps: 10, around: 72, capStart: false, capEnd: true, ring: sidepodRing }), M.livery);
  // inlet duct (dark) with recessed back face
  const lipRing = sidepodRing(SIDEPOD_LIP);
  addMesh(sp, loftRings([lipRing, insetRing(lipRing, 0.86, -0.03), insetRing(lipRing, 0.7, -0.12)], { capEnd: true }), M.inlet);
  // thin lip bead around the letterbox
  addMesh(sp, tubeThrough(lipRing, 0.006, { closed: true, tubular: 96, radial: 6 }), M.livery);
  // cooling louvres on the downwash ramp
  const pod = resampleStations(SIDEPOD_KEYS, 10);
  for (let i = 0; i < 6; i++) {
    const x = -0.3 - i * 0.07;
    const [z, y] = sidepodControl(interpStation(pod, x))[1];
    const box = new THREE.BoxGeometry(0.022, 0.008, 0.08 - i * 0.007);
    box.rotateX(-0.3);
    box.translate(x, y + 0.001, z);
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
  // small shark fin along the engine-cover spine
  const fin = plateXY(
    smoothOutline([[-0.95, 0.83], [-1.2, 0.845], [-1.6, 0.765], [-1.74, 0.72], [-1.76, 0.58], [-1.42, 0.66], [-1.06, 0.78]], 60),
    0.006,
    0,
    0.0015,
  );
  addMesh(ec, fin, M.livery);
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
