import * as THREE from 'three';
import { latheZ, strut, cylinderBetween } from './geometry.js';
import { addMesh } from './registry.js';
import { FRONT_AXLE_X, REAR_AXLE_X, FRONT_WHEEL, REAR_WHEEL, RIM_R, FRONT_DISC_R, REAR_DISC_R, DISC_T } from './dims.js';

/* ------------------------------------------------------------------ */
/* Wheel-local geometry (axis = z, outboard = +z, centred at origin)   */
/* ------------------------------------------------------------------ */

function tyreGeometry(r, w) {
  const h = w / 2;
  const sw = r - RIM_R; // sidewall height
  const prof = [
    [RIM_R - 0.004, -h * 0.9],
    [RIM_R + sw * 0.15, -h * 0.985],
    [RIM_R + sw * 0.5, -h * 1.0],
    [RIM_R + sw * 0.8, -h * 0.975],
    [r - 0.012, -h * 0.9],
    [r - 0.002, -h * 0.78],
    [r, -h * 0.6],
    [r, h * 0.6],
    [r - 0.002, h * 0.78],
    [r - 0.012, h * 0.9],
    [RIM_R + sw * 0.8, h * 0.975],
    [RIM_R + sw * 0.5, h * 1.0],
    [RIM_R + sw * 0.15, h * 0.985],
    [RIM_R - 0.004, h * 0.9],
  ];
  // smooth the profile with a spline
  const curve = new THREE.SplineCurve(prof.map(([a, b]) => new THREE.Vector2(a, b)));
  const pts = curve.getPoints(60).map((v) => [v.x, v.y]);
  return latheZ(pts, 96);
}

function compoundBand(r, w) {
  const h = w / 2;
  const sw = r - RIM_R;
  const inner = RIM_R + sw * 0.42;
  const outer = RIM_R + sw * 0.58;
  const group = [];
  for (const side of [1, -1]) {
    const g = new THREE.RingGeometry(inner, outer, 96, 1);
    g.translate(0, 0, side * (h + 0.0015));
    group.push(g);
  }
  return group;
}

function rimGeometry(w) {
  const h = w / 2;
  // barrel + outer and inner flanges
  const prof = [
    [RIM_R + 0.004, -h * 0.9],
    [RIM_R + 0.004, -h * 0.84],
    [RIM_R - 0.006, -h * 0.8],
    [RIM_R - 0.014, -h * 0.55],
    [RIM_R - 0.018, h * 0.3],
    [RIM_R - 0.012, h * 0.8],
    [RIM_R + 0.004, h * 0.84],
    [RIM_R + 0.004, h * 0.9],
    [RIM_R - 0.004, h * 0.92],
  ];
  return latheZ(prof, 96);
}

function spokes(w, count = 10) {
  const h = w / 2;
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.018, RIM_R - 0.075, 0.014);
    g.translate(0, 0.055 + (RIM_R - 0.075) / 2, 0);
    g.rotateY(0.22); // slight twist
    g.rotateZ(a);
    g.translate(0, 0, h * 0.62);
    geos.push(g);
  }
  const hub = new THREE.CylinderGeometry(0.062, 0.07, 0.06, 32);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, h * 0.6);
  geos.push(hub);
  return geos;
}

function wheelCover(w) {
  const h = w / 2;
  // annular outboard disc, slightly dished
  const prof = [
    [0.07, h * 0.86],
    [0.12, h * 0.87],
    [RIM_R - 0.02, h * 0.89],
    [RIM_R - 0.004, h * 0.9],
  ];
  return latheZ(prof, 96);
}

function wheelNut(w) {
  const h = w / 2;
  const nut = new THREE.CylinderGeometry(0.046, 0.05, 0.05, 6);
  nut.rotateX(Math.PI / 2);
  nut.translate(0, 0, h * 0.86 + 0.018);
  const axle = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20);
  axle.rotateX(Math.PI / 2);
  axle.translate(0, 0, h * 0.86 + 0.05);
  return [nut, axle];
}

/* ------------------------------------------------------------------ */
/* Corner assembly                                                    */
/* ------------------------------------------------------------------ */

function corner(reg, M, { key, front, left }) {
  const W = front ? FRONT_WHEEL : REAR_WHEEL;
  const X = front ? FRONT_AXLE_X : REAR_AXLE_X;
  const side = left ? 1 : -1;
  const discR = front ? FRONT_DISC_R : REAR_DISC_R;
  const h = W.w / 2;
  const centre = new THREE.Vector3(X, W.cy, side * W.z);
  const out = (d) => [0, 0.05 * Math.abs(d), side * d];

  const mk = (id, info, explodeZ, delay, layer) => {
    const p = reg.part({ id: `${id}-${key}`, info, layer, explode: out(explodeZ), delay });
    const pivot = new THREE.Object3D();
    pivot.position.copy(centre);
    if (!left) pivot.scale.z = -1;
    p.add(pivot);
    return pivot;
  };

  // tyre
  const tyre = mk('tyre', 'tyres', 1.35, 0.3, 'wheels');
  addMesh(tyre, tyreGeometry(W.r, W.w), M.rubber);
  const tread = new THREE.CylinderGeometry(W.r + 0.0005, W.r + 0.0005, W.w * 0.6, 96, 1, true);
  tread.rotateX(Math.PI / 2);
  addMesh(tyre, tread, M.tread);
  for (const g of compoundBand(W.r, W.w)) addMesh(tyre, g, M.compound, { cast: false });

  // wheel cover (mandatory annular disc)
  const cover = mk('wheel-cover', 'wheel-covers', 1.75, 0.4, 'wheels');
  addMesh(cover, wheelCover(W.w), M.carbon);

  // rim + nut
  const rim = mk('rim', 'rims', 1.05, 0.35, 'wheels');
  addMesh(rim, rimGeometry(W.w), M.rim);
  for (const g of spokes(W.w)) addMesh(rim, g, M.rim);
  for (const g of wheelNut(W.w)) addMesh(rim, g, M.aluminium);

  // brake disc (inboard of the wheel centre)
  const disc = mk('disc', 'brake-discs', 0.62, 0.45, 'corners');
  const dz = -h * 0.35;
  for (const s of [1, -1]) {
    const face = new THREE.RingGeometry(discR * 0.62, discR, 64, 1);
    face.translate(0, 0, dz + (s * DISC_T) / 2);
    addMesh(disc, face, M.discCarbon);
  }
  const edge = new THREE.CylinderGeometry(discR, discR, DISC_T, 96, 1, true);
  edge.rotateX(Math.PI / 2);
  edge.translate(0, 0, dz);
  addMesh(disc, edge, M.discEdge);
  const bell = new THREE.CylinderGeometry(discR * 0.62, 0.06, 0.03, 32, 1, true);
  bell.rotateX(Math.PI / 2);
  bell.translate(0, 0, dz + 0.02);
  addMesh(disc, bell, M.titanium);

  // caliper — trailing edge for fronts, leading-low for rears
  const cal = mk('caliper', 'brake-calipers', 0.72, 0.5, 'corners');
  const a0 = front ? Math.PI * 0.62 : Math.PI * 1.1;
  const cs = new THREE.Shape();
  const r0 = discR * 0.66;
  const r1 = discR + 0.022;
  const span = 0.95;
  cs.absarc(0, 0, r1, a0, a0 + span, false);
  cs.absarc(0, 0, r0, a0 + span, a0, true);
  const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24 });
  cg.translate(0, 0, dz - 0.025);
  addMesh(cal, cg, M.caliper);

  // brake duct drum and inlet
  const duct = mk('brake-duct', 'brake-ducts', 0.5, 0.55, 'corners');
  const drum = new THREE.CylinderGeometry(discR + 0.035, discR + 0.03, 0.1, 64, 1, true, 0.4, Math.PI * 2 - 0.8);
  drum.rotateX(Math.PI / 2);
  drum.translate(0, 0, dz - 0.03);
  addMesh(duct, drum, M.carbon);
  const back = new THREE.RingGeometry(0.07, discR + 0.035, 64);
  back.translate(0, 0, dz - 0.08);
  addMesh(duct, back, M.carbon);
  const scoop = new THREE.BoxGeometry(0.12, 0.08, 0.06);
  scoop.translate(front ? discR + 0.07 : discR + 0.05, -0.06, dz - 0.05);
  addMesh(duct, scoop, M.carbon);
  const mouth = new THREE.PlaneGeometry(0.058, 0.07);
  mouth.rotateY(Math.PI / 2);
  mouth.translate((front ? discR + 0.07 : discR + 0.05) + 0.061, -0.06, dz - 0.05);
  addMesh(duct, mouth, M.inlet);

  // upright + hub
  const up = mk('upright', 'uprights', 0.42, 0.6, 'corners');
  const ub = new THREE.BoxGeometry(0.075, 0.37, 0.05);
  ub.translate(0, 0, -h * 0.72);
  addMesh(up, ub, M.titanium);
  const hub = new THREE.CylinderGeometry(0.045, 0.05, h * 1.2, 24);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, -h * 0.1);
  addMesh(up, hub, M.steel);
  if (front) {
    const arm = new THREE.BoxGeometry(0.12, 0.03, 0.03);
    arm.translate(0.08, -0.02, -h * 0.72);
    addMesh(up, arm, M.titanium);
  }

  return { centre, h };
}

/* ------------------------------------------------------------------ */
/* Suspension                                                         */
/* ------------------------------------------------------------------ */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function buildSuspension(reg, M, { front, left }) {
  const s = left ? 1 : -1;
  const key = `${front ? 'F' : 'R'}${left ? 'L' : 'R'}`;
  const p = reg.part({ id: `suspension-${key}`, info: 'suspension', layer: 'corners', explode: [0, 0.03, s * 0.22], delay: 0.65 });
  const arm = (a, b, chord = 0.05, thick = 0.016) => addMesh(p, strut(a, b, { chord, thick }), M.carbon);
  const W = front ? FRONT_WHEEL : REAR_WHEEL;
  const uz = W.z - W.w / 2 * 0.72; // upright plane

  if (front) {
    const topApex = V(1.705, W.cy + 0.18, s * uz);
    const botApex = V(1.695, W.cy - 0.175, s * uz);
    arm(V(1.9, 0.47, s * 0.1), topApex);
    arm(V(1.5, 0.53, s * 0.14), topApex);
    arm(V(1.93, 0.27, s * 0.1), botApex);
    arm(V(1.42, 0.24, s * 0.16), botApex);
    // pushrod
    arm(V(1.67, W.cy - 0.15, s * (uz - 0.03)), V(1.6, 0.55, s * 0.13), 0.035, 0.02);
    // track rod
    arm(V(1.8, 0.33, s * 0.11), V(1.79, W.cy - 0.02, s * uz), 0.04, 0.014);
  } else {
    const topApex = V(-1.7, W.cy + 0.19, s * uz);
    const botApex = V(-1.7, W.cy - 0.18, s * uz);
    arm(V(-1.45, 0.49, s * 0.1), topApex);
    arm(V(-1.86, 0.5, s * 0.09), topApex);
    arm(V(-1.3, 0.2, s * 0.14), botApex);
    arm(V(-1.82, 0.2, s * 0.09), botApex);
    // pullrod
    arm(V(-1.69, W.cy + 0.16, s * (uz - 0.03)), V(-1.55, 0.2, s * 0.1), 0.035, 0.02);
    // toe link
    arm(V(-1.86, 0.31, s * 0.1), V(-1.86, 0.31, s * uz), 0.04, 0.014);
  }
  // rocker / inboard mounts (visible only with bodywork off)
  const mount = new THREE.SphereGeometry(0.018, 12, 8);
  mount.translate(front ? 1.6 : -1.55, front ? 0.55 : 0.2, s * (front ? 0.13 : 0.1));
  addMesh(p, mount, M.titanium);
}

function buildDriveshaft(reg, M, left) {
  const s = left ? 1 : -1;
  const p = reg.part({ id: `driveshaft-R${left ? 'L' : 'R'}`, info: 'driveshafts', layer: 'corners', explode: [0, 0, s * 0.32], delay: 0.6 });
  const y = REAR_WHEEL.cy;
  const z0 = 0.11;
  const z1 = REAR_WHEEL.z - REAR_WHEEL.w / 2 * 0.72;
  addMesh(p, cylinderBetween(V(-1.7, y, s * z0), V(-1.7, y, s * z1), 0.022, 0.022, 16), M.steel);
  for (const z of [z0 + 0.03, z1 - 0.03]) {
    const cv = new THREE.SphereGeometry(0.042, 20, 14);
    cv.scale(1, 1, 1.3);
    cv.translate(-1.7, y, s * z);
    addMesh(p, cv, M.satinBlack);
  }
}

export function buildCorners(reg, M) {
  for (const front of [true, false]) {
    for (const left of [true, false]) {
      const key = `${front ? 'F' : 'R'}${left ? 'L' : 'R'}`;
      corner(reg, M, { key, front, left });
      buildSuspension(reg, M, { front, left });
    }
  }
  buildDriveshaft(reg, M, true);
  buildDriveshaft(reg, M, false);
}
