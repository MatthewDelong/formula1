import * as THREE from 'three';
import { wingElement, mirrorSections, plateXY, smoothOutline, strut, loftRings } from './geometry.js';
import { addMesh } from './registry.js';
import { FW_HALF_SPAN, RW_HALF_SPAN, REF_Y, PLANK_T } from './dims.js';

/* ------------------------------------------------------------------ */
/* Front wing: three elements, the rear two are movable (active aero) */
/* ------------------------------------------------------------------ */

const S = FW_HALF_SPAN;

const FW_MAIN = [
  { z: 0, x: 2.775, y: 0.158, chord: 0.3, angle: -3, t: 0.075, m: 0.02 },
  { z: 0.1, x: 2.775, y: 0.14, chord: 0.31, angle: 0, t: 0.075, m: 0.035 },
  { z: 0.2, x: 2.77, y: 0.1, chord: 0.33, angle: 4, t: 0.08, m: 0.06 },
  { z: 0.42, x: 2.76, y: 0.088, chord: 0.31, angle: 6, t: 0.08, m: 0.065 },
  { z: 0.62, x: 2.73, y: 0.092, chord: 0.27, angle: 8, t: 0.08, m: 0.065 },
  { z: S - 0.06, x: 2.68, y: 0.11, chord: 0.21, angle: 11, t: 0.08, m: 0.06 },
  { z: S - 0.004, x: 2.64, y: 0.13, chord: 0.17, angle: 14, t: 0.08, m: 0.05 },
];

const FW_FLAP1 = [
  { z: 0, x: 2.48, y: 0.172, chord: 0.13, angle: 10, t: 0.09, m: 0.04 },
  { z: 0.12, x: 2.475, y: 0.155, chord: 0.15, angle: 16, t: 0.09, m: 0.06 },
  { z: 0.3, x: 2.465, y: 0.13, chord: 0.165, angle: 22, t: 0.09, m: 0.07 },
  { z: 0.52, x: 2.45, y: 0.138, chord: 0.165, angle: 25, t: 0.09, m: 0.07 },
  { z: 0.68, x: 2.43, y: 0.158, chord: 0.15, angle: 27, t: 0.09, m: 0.07 },
  { z: S - 0.004, x: 2.4, y: 0.195, chord: 0.12, angle: 31, t: 0.09, m: 0.06 },
];

const FW_FLAP2 = [
  { z: 0, x: 2.36, y: 0.2, chord: 0.1, angle: 20, t: 0.09, m: 0.05 },
  { z: 0.12, x: 2.355, y: 0.19, chord: 0.115, angle: 26, t: 0.09, m: 0.06 },
  { z: 0.3, x: 2.345, y: 0.182, chord: 0.13, angle: 32, t: 0.09, m: 0.07 },
  { z: 0.52, x: 2.325, y: 0.196, chord: 0.135, angle: 36, t: 0.09, m: 0.07 },
  { z: 0.68, x: 2.3, y: 0.215, chord: 0.13, angle: 38, t: 0.09, m: 0.07 },
  { z: S - 0.004, x: 2.27, y: 0.255, chord: 0.1, angle: 40, t: 0.09, m: 0.06 },
];

/** Build a flap in a hinge pivot so it can rotate for Straight Mode. */
function flapPivot(parent, sections, mat, hinge) {
  const pivot = new THREE.Object3D();
  pivot.position.set(hinge.x, hinge.y, 0);
  parent.add(pivot);
  const geo = wingElement(mirrorSections(sections), { steps: 5, around: 28 });
  geo.translate(-hinge.x, -hinge.y, 0);
  addMesh(pivot, geo, mat);
  return pivot;
}

export function buildFrontWing(reg, M) {
  const fw = reg.part({ id: 'front-wing', info: 'front-wing', layer: 'aero', explode: [1.55, 0.05, 0], delay: 0.15 });
  addMesh(fw, wingElement(mirrorSections(FW_MAIN), { steps: 5, around: 32 }), M.carbon);

  // endplates
  const ep = smoothOutline(
    [
      [2.8, 0.07], [2.815, 0.12], [2.76, 0.21], [2.6, 0.26], [2.4, 0.285],
      [2.24, 0.285], [2.19, 0.24], [2.21, 0.075], [2.45, 0.058], [2.7, 0.055],
    ],
    90,
  );
  for (const z of [S, -S]) addMesh(fw, plateXY(ep, 0.01, z, 0.003), M.carbon);
  // endplate foot / dive plane
  for (const side of [1, -1]) {
    const foot = plateXY(smoothOutline([[2.78, 0.06], [2.6, 0.05], [2.3, 0.055], [2.25, 0.07], [2.6, 0.075]], 40), 0.06, 0, 0.002);
    foot.rotateX(Math.PI / 2);
    foot.translate(0, 0.065 + 0.03, side * (S - 0.028));
    addMesh(fw, foot, M.carbon);
  }

  const flaps = reg.part({ id: 'front-wing-flaps', info: 'front-wing-flaps', layer: 'aero', explode: [1.75, 0.35, 0], delay: 0.2 });
  const p1 = flapPivot(flaps, FW_FLAP1, M.carbon, { x: 2.46, y: 0.15 });
  const p2 = flapPivot(flaps, FW_FLAP2, M.carbon, { x: 2.46, y: 0.15 });
  // actuator fairing where the movable flaps meet the nose
  for (const z of [0.06, -0.06]) {
    const act = new THREE.CapsuleGeometry(0.012, 0.09, 4, 8);
    act.rotateZ(Math.PI / 2 - 0.5);
    act.translate(2.4, 0.2, z);
    addMesh(flaps, act, M.satinBlack);
  }
  return { flapPivots: [p1, p2], flapAngles: [0.22, 0.34] };
}

/* ------------------------------------------------------------------ */
/* Rear wing: main plane + two movable flaps, endplate lights          */
/* ------------------------------------------------------------------ */

const R = RW_HALF_SPAN;
const RW_MAIN = [
  { z: 0, x: -2.03, y: 0.79, chord: 0.33, angle: 12, t: 0.1, m: 0.08 },
  { z: 0.2, x: -2.03, y: 0.795, chord: 0.32, angle: 14, t: 0.1, m: 0.08 },
  { z: 0.38, x: -2.04, y: 0.81, chord: 0.29, angle: 18, t: 0.1, m: 0.08 },
  { z: R - 0.004, x: -2.06, y: 0.84, chord: 0.24, angle: 24, t: 0.1, m: 0.07 },
];
const RW_FLAP1 = [
  { z: 0, x: -2.3, y: 0.87, chord: 0.14, angle: 36, t: 0.1, m: 0.07 },
  { z: 0.2, x: -2.3, y: 0.872, chord: 0.14, angle: 37, t: 0.1, m: 0.07 },
  { z: 0.38, x: -2.295, y: 0.88, chord: 0.135, angle: 40, t: 0.1, m: 0.07 },
  { z: R - 0.004, x: -2.285, y: 0.9, chord: 0.12, angle: 44, t: 0.1, m: 0.06 },
];
const RW_FLAP2 = [
  { z: 0, x: -2.39, y: 0.945, chord: 0.085, angle: 55, t: 0.11, m: 0.06 },
  { z: 0.2, x: -2.39, y: 0.946, chord: 0.085, angle: 56, t: 0.11, m: 0.06 },
  { z: 0.38, x: -2.385, y: 0.95, chord: 0.08, angle: 58, t: 0.11, m: 0.06 },
  { z: R - 0.004, x: -2.375, y: 0.96, chord: 0.07, angle: 60, t: 0.11, m: 0.05 },
];

export function buildRearWing(reg, M) {
  const rw = reg.part({ id: 'rear-wing', info: 'rear-wing', layer: 'aero', explode: [-1.2, 0.6, 0], delay: 0.15 });
  addMesh(rw, wingElement(mirrorSections(RW_MAIN), { steps: 5, around: 32 }), M.carbon);

  const ep = smoothOutline(
    [
      [-1.95, 0.68], [-1.94, 0.86], [-1.99, 0.95], [-2.1, 0.99], [-2.36, 0.995],
      [-2.46, 0.955], [-2.475, 0.78], [-2.42, 0.63], [-2.26, 0.57], [-2.06, 0.6],
    ],
    90,
  );
  for (const z of [R + 0.006, -(R + 0.006)]) {
    addMesh(rw, plateXY(ep, 0.012, z, 0.003), M.carbon);
    // mandatory endplate rain light (2026), between Z = 700 and 870 mm
    const l = new THREE.BoxGeometry(0.1, 0.03, 0.004);
    l.translate(-2.43, 0.8, z + Math.sign(z) * 0.0075);
    addMesh(rw, l, M.lightRed, { cast: false });
  }

  const flaps = reg.part({ id: 'rear-wing-flaps', info: 'rear-wing-flaps', layer: 'aero', explode: [-1.45, 1.0, 0], delay: 0.2 });
  const hinge = { x: -2.3, y: 0.875 };
  const p1 = flapPivot(flaps, RW_FLAP1, M.carbon, hinge);
  const p2 = flapPivot(flaps, RW_FLAP2, M.carbon, hinge);
  // central actuator pod
  const pod = new THREE.CapsuleGeometry(0.018, 0.1, 4, 10);
  pod.rotateZ(Math.PI / 2);
  pod.translate(-2.24, 0.965, 0);
  addMesh(flaps, pod, M.satinBlack);

  // twin swan-neck pylons, straddling the exhaust
  const py = reg.part({ id: 'rear-wing-pylons', info: 'rear-wing-pylons', layer: 'aero', explode: [-0.9, 0.3, 0], delay: 0.1 });
  for (const z of [0.055, -0.055]) {
    addMesh(py, strut(new THREE.Vector3(-2.17, 0.35, z), new THREE.Vector3(-2.12, 0.78, z), { chord: 0.12, thick: 0.016 }), M.carbon);
  }
  return { flapPivots: [p1, p2], flapAngles: [0.55, 0.85] };
}

/* ------------------------------------------------------------------ */
/* Floor, fences, edge, diffuser, plank                               */
/* ------------------------------------------------------------------ */

// Floor half-width (z) as a function of x — 150 mm narrower for 2026
const FLOOR_OUTLINE = [
  [1.2, 0.2], [1.14, 0.36], [1.0, 0.5], [0.8, 0.6], [0.55, 0.655], [0.25, 0.675],
  [-0.6, 0.675], [-0.95, 0.66], [-1.15, 0.6], [-1.3, 0.52], [-1.36, 0.5],
];
function floorHalfWidth(x) {
  const o = FLOOR_OUTLINE;
  if (x >= o[0][0]) return o[0][1];
  for (let i = 0; i < o.length - 1; i++) {
    if (x <= o[i][0] && x >= o[i + 1][0]) {
      const t = (o[i][0] - x) / (o[i][0] - o[i + 1][0]);
      return THREE.MathUtils.lerp(o[i][1], o[i + 1][1], THREE.MathUtils.smoothstep(t, 0, 1) * 0.5 + t * 0.5);
    }
  }
  return o[o.length - 1][1];
}

const FLOOR_Y = REF_Y + 0.006;

/** Underfloor roof height: raised tunnel inlets at the front, rising toward the diffuser. */
function floorHeight(x, z) {
  const az = Math.abs(z);
  const inTunnel = THREE.MathUtils.smoothstep(az, 0.1, 0.16) * (1 - THREE.MathUtils.smoothstep(az, 0.5, 0.58));
  const frontRise = THREE.MathUtils.smoothstep(x, 0.35, 1.18) * 0.1;
  const rearRise = (1 - THREE.MathUtils.smoothstep(x, -1.36, -0.95)) * 0.05;
  return FLOOR_Y + inTunnel * (frontRise + rearRise);
}

export function buildFloor(reg, M) {
  const floor = reg.part({ id: 'floor', info: 'floor', layer: 'aero', explode: [0, -0.75, 0], delay: 0.0 });
  const rings = [];
  const nz = 48;
  for (let i = 0; i <= 60; i++) {
    const x = 1.2 - (i / 60) * 2.56;
    const hw = floorHalfWidth(x);
    const ring = [];
    for (let j = 0; j <= nz; j++) {
      const z = -hw + (j / nz) * 2 * hw;
      ring.push(new THREE.Vector3(x, floorHeight(x, z), z));
    }
    rings.push(ring);
  }
  addMesh(floor, loftRings(rings, { closed: false }), M.carbon);
  // thin top skin, slightly above, for visual thickness
  const top = rings.map((r) => r.map((p) => new THREE.Vector3(p.x, p.y + 0.01, p.z)));
  addMesh(floor, loftRings(top, { closed: false }), M.carbonMatte);

  // floor edge: upturned lip with a slot
  for (const side of [1, -1]) {
    const edge = [];
    for (let i = 0; i <= 50; i++) {
      const x = 0.95 - (i / 50) * 2.2;
      const z = side * floorHalfWidth(x);
      const y0 = floorHeight(x, z);
      edge.push([new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y0 + 0.045, z + side * 0.004)]);
    }
    addMesh(floor, loftRings(edge, { closed: false }), M.carbon);
    // edge wing
    const ew = [];
    for (let i = 0; i <= 20; i++) {
      const x = 0.3 - (i / 20) * 0.75;
      const z = side * (floorHalfWidth(x) - 0.03);
      const y = FLOOR_Y + 0.065 + 0.01 * Math.sin((i / 20) * Math.PI);
      ew.push([new THREE.Vector3(x, y, z - side * 0.05), new THREE.Vector3(x, y + 0.012, z + side * 0.02)]);
    }
    addMesh(floor, loftRings(ew, { closed: false }), M.carbon);
  }

  // underfloor fences at the tunnel inlets
  for (const zf of [0.17, 0.27, 0.37, 0.47]) {
    for (const side of [1, -1]) {
      const x0 = 1.18;
      const hTop = floorHeight(x0, zf) - FLOOR_Y;
      const outline = [
        [x0, FLOOR_Y - 0.004],
        [x0 + 0.005, FLOOR_Y + hTop],
        [0.3, FLOOR_Y + 0.004],
        [0.55, FLOOR_Y - 0.004],
      ];
      const fence = plateXY(outline, 0.006, 0, 0.001);
      fence.rotateY(side * 0.08 * (zf / 0.47));
      fence.translate(0, 0, side * zf);
      addMesh(floor, fence, M.carbon);
    }
  }

  /* Diffuser */
  const diff = reg.part({ id: 'diffuser', info: 'diffuser', layer: 'aero', explode: [-0.55, -0.55, 0], delay: 0.05 });
  const drings = [];
  const X0 = -1.3;
  const X1 = -2.08;
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const x = X0 + (X1 - X0) * t;
    const ring = [];
    const hw = 0.5 - 0.02 * t;
    for (let j = 0; j <= 48; j++) {
      const z = -hw + (j / 48) * 2 * hw;
      const az = Math.abs(z);
      const tunnel = THREE.MathUtils.smoothstep(az, 0.08, 0.16) * (1 - THREE.MathUtils.smoothstep(az, 0.44, 0.5));
      const rise = t * t * (0.24 * tunnel + 0.1 * (1 - tunnel));
      ring.push(new THREE.Vector3(x, FLOOR_Y + 0.02 + rise + tunnel * 0.03 * (1 - t) * 0, z));
    }
    drings.push(ring);
  }
  addMesh(diff, loftRings(drings, { closed: false }), M.carbon);
  // side walls and strakes
  for (const zs of [0.5, 0.33, 0.16]) {
    for (const side of [1, -1]) {
      const outline = [
        [X0, FLOOR_Y + 0.02],
        [X1, FLOOR_Y + 0.02],
        [X1, FLOOR_Y + 0.02 + (zs > 0.4 ? 0.3 : 0.26)],
        [X0 - 0.2, FLOOR_Y + 0.06],
      ];
      const w = plateXY(outline, zs > 0.4 ? 0.01 : 0.006, side * (zs > 0.4 ? 0.49 : zs), 0.001);
      addMesh(diff, w, M.carbon);
    }
  }

  /* Plank and skids */
  const plank = reg.part({ id: 'plank', info: 'plank', layer: 'aero', explode: [0, -1.05, 0], delay: 0.0 });
  const pg = new THREE.BoxGeometry(2.25, PLANK_T, 0.3);
  pg.translate(-0.12, REF_Y - PLANK_T / 2, 0);
  addMesh(plank, pg, M.plank);
  // three 34 mm inspection holes, front one with a mandatory metal skid
  const holes = [0.85, -0.2, -1.05];
  holes.forEach((x, i) => {
    const skid = new THREE.CylinderGeometry(0.03, 0.03, PLANK_T + 0.002, 24);
    skid.translate(x, REF_Y - PLANK_T / 2, 0);
    addMesh(plank, skid, i === 0 ? M.titanium : M.satinBlack);
    for (const z of [0.1, -0.1]) {
      const pad = new THREE.BoxGeometry(0.12, PLANK_T + 0.001, 0.035);
      pad.translate(x, REF_Y - PLANK_T / 2, z);
      addMesh(plank, pad, M.titanium);
    }
  });
}

