import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  plateXY,
  smoothOutline,
  cylinderBetween,
  loftStations,
  tubeThrough,
} from "./geometry.js";
import { addMesh } from "./registry.js";
import { ROLL_HOOP_TOP } from "./dims.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function limb(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14);
  const q = new THREE.Quaternion().setFromUnitVectors(
    V(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* ------------------------------------------------------------------ */
/* Helmet                                                             */
/* ------------------------------------------------------------------ */

// Head centre and pitch (a slight chin-down attitude, as when driving)
/** Tapered limb segment from a (radius ra) to b (radius rb), with a rounded joint at each end. */
function taperedLimb(a, b, ra, rb) {
  const geos = [];
  const cyl = new THREE.CylinderGeometry(rb, ra, a.distanceTo(b), 20, 1, true);
  cyl.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      V(0, 1, 0),
      b.clone().sub(a).normalize(),
    ),
  );
  const m = a.clone().add(b).multiplyScalar(0.5);
  cyl.translate(m.x, m.y, m.z);
  geos.push(cyl);
  for (const [p, r] of [
    [a, ra],
    [b, rb],
  ]) {
    const j = new THREE.SphereGeometry(r, 20, 14);
    j.translate(p.x, p.y, p.z);
    geos.push(j);
  }
  return geos;
}

export const HELMET = { x: 0.06, y: 0.71, pitch: -0.08 };

const smooth = THREE.MathUtils.smoothstep;

/**
 * Sculpt a point on the unit sphere into a modern closed-face F1 helmet
 * (about 300 mm long, 240 mm wide, 275 mm tall): a slightly boxy shell with a
 * flattened crown, a chin bar that juts forward and down, a nape that tucks
 * in toward the neck, and a flat neck opening that is lower at the chin than
 * at the back. `out` lifts overlays (visor, paint) off the shell.
 */
function helmetPoint(u, out = 0) {
  // superellipse-style boxiness: pushes the shell out on the diagonals
  const box = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.82);
  const bx = box(u.x);
  const by = box(u.y);
  const bz = box(u.z);
  const front = smooth(u.x, 0.15, 0.85);
  const back = smooth(-u.x, 0.25, 0.9);
  const low = smooth(-u.y, 0.0, 0.75);
  let x = bx * (u.x > 0 ? 0.142 : 0.138);
  let y = by * 0.122 * (1 - 0.08 * smooth(u.y, 0.55, 1));
  let z = bz * 0.112;
  x += 0.036 * front * low; // chin bar forward...
  y -= 0.02 * front * low; // ...and down
  x *= 1 - 0.14 * back * low; // nape tucks in toward the neck
  z *= 1 - 0.1 * low * (1 - front); // cheeks narrow toward the neck opening
  const base = -0.098 - 0.05 * smooth(u.x, -0.2, 0.8);
  if (y < base) y = base + (y - base) * 0.12;
  return new THREE.Vector3(x + u.x * out, y + u.y * out, z + u.z * out);
}

/** A patch of the helmet surface (angles as in THREE.SphereGeometry; phi = PI faces forward). */
function helmetPatch(
  out,
  phiStart = 0,
  phiLength = Math.PI * 2,
  thetaStart = 0,
  thetaLength = Math.PI,
  segs = [64, 48],
) {
  let g = new THREE.SphereGeometry(
    1,
    segs[0],
    segs[1],
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );
  const p = g.attributes.position;
  const u = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i).normalize();
    const q = helmetPoint(u, out);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  if (phiLength >= Math.PI * 2) {
    // weld the sphere's seam so the sculpted normals are smooth
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);
  }
  g.computeVertexNormals();
  g.rotateZ(HELMET.pitch);
  g.translate(HELMET.x, HELMET.y, 0);
  return g;
}

/** Car-space position of a point on the helmet shell. */
function onHelmet(ux, uy, uz, out = 0) {
  const p = helmetPoint(new THREE.Vector3(ux, uy, uz).normalize(), out);
  return p
    .applyAxisAngle(V(0, 0, 1), HELMET.pitch)
    .add(V(HELMET.x, HELMET.y, 0));
}

/** Alpha mask giving the visor and its seal a rounded eye-port outline (uv spans the patch). */
function eyePortMask() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#fff";
  g.beginPath();
  g.roundRect(4, 4, 504, 120, 56);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function buildHelmet(drv, M) {
  const theta = (y) => Math.acos(y); // polar angle for a given unit-sphere height
  // plain white shell
  addMesh(drv, helmetPatch(0), M.helmet);
  // visor: a wide eye-port across the front, wrapping round to the cheeks,
  // framed by a black rubber seal
  const vy0 = theta(0.36);
  const vy1 = theta(-0.1);
  const mask = eyePortMask();
  const seal = M.satinBlack.clone();
  const visor = M.visor.clone();
  for (const m of [seal, visor])
    Object.assign(m, { alphaMap: mask, alphaTest: 0.5 });
  addMesh(
    drv,
    helmetPatch(
      0.0016,
      Math.PI - 1.3,
      2.6,
      vy0 - 0.06,
      vy1 - vy0 + 0.12,
      [64, 10],
    ),
    seal,
  );
  addMesh(
    drv,
    helmetPatch(0.0045, Math.PI - 1.2, 2.4, vy0, vy1 - vy0, [64, 10]),
    visor,
  );
  // brow air intake above the visor
  addMesh(
    drv,
    helmetPatch(0.004, Math.PI - 0.24, 0.48, 0.68, 0.1, [16, 3]),
    M.inlet,
  );
}

/* ------------------------------------------------------------------ */
/* Driver                                                             */
/* ------------------------------------------------------------------ */

export function buildCockpit(reg, M) {
  const drv = reg.part({
    id: "driver",
    info: "driver",
    layer: "cockpit",
    explode: [0, 1.85, 0],
    delay: 0.55,
  });
  buildHelmet(drv, M);

  // HANS device: a carbon yoke on the shoulders with a collar and back plate
  // behind the helmet, tethered to its sides
  const yokeSide = (s) => [
    V(0.17, 0.495, s * 0.12),
    V(0.07, 0.545, s * 0.135),
    V(-0.02, 0.565, s * 0.09),
  ];
  const hansPath = [
    ...yokeSide(1),
    V(-0.05, 0.575, 0),
    ...yokeSide(-1).reverse(),
  ];
  const yoke = tubeThrough(hansPath, 0.02, { tubular: 64, radial: 10 });
  // flatten the section about the yoke's own height
  yoke.translate(0, -0.55, 0);
  yoke.scale(1, 0.6, 1);
  yoke.translate(0, 0.55, 0);
  addMesh(drv, yoke, M.carbonMatte);
  const plate = new RoundedBoxGeometry(0.03, 0.11, 0.1, 3, 0.012);
  plate.rotateZ(0.25);
  plate.translate(-0.055, 0.61, 0);
  addMesh(drv, plate, M.carbonMatte);
  for (const s of [1, -1])
    addMesh(
      drv,
      tubeThrough(
        [V(-0.045, 0.64, s * 0.04), onHelmet(-0.15, -0.5, s * 0.85, 0.004)],
        0.005,
        { tubular: 8, radial: 6 },
      ),
      M.satinBlack,
    );

  // torso, lofted along the reclined spine (hips to shoulders)
  const hip = V(0.3, 0.17, 0);
  const sh = V(0.03, 0.47, 0);
  const spine = Math.atan2(sh.y - hip.y, sh.x - hip.x);
  // local +y points to the back (seat side), -y to the chest
  const torso = loftStations(
    [
      { x: -0.04, cy: 0, w: 0.15, hT: 0.09, hB: 0.1, n: 2.6 },
      { x: 0.1, cy: 0, w: 0.138, hT: 0.09, hB: 0.1, n: 2.6 },
      { x: 0.26, cy: 0, w: 0.165, hT: 0.1, hB: 0.12, n: 2.8 },
      { x: 0.38, cy: 0, w: 0.2, hT: 0.095, hB: 0.105, n: 3 },
      { x: 0.46, cy: 0, w: 0.165, hT: 0.075, hB: 0.08, n: 3 },
      { x: 0.53, cy: 0, w: 0.058, hT: 0.048, hB: 0.048, n: 2 },
    ],
    { steps: 6, around: 40 },
  );
  torso.rotateZ(spine);
  torso.translate(hip.x, hip.y, 0);
  addMesh(drv, torso, M.suit);
  addMesh(drv, limb(V(0.04, 0.51, 0), V(0.055, 0.59, 0), 0.048), M.suit); // neck / balaclava

  for (const s of [1, -1]) {
    // shoulders, arms and gloves on the wheel
    const shoulder = V(0.05, 0.485, s * 0.175);
    const elbow = V(0.25, 0.4, s * 0.215);
    const wrist = V(0.405, 0.54, s * 0.14);
    for (const g of taperedLimb(shoulder, elbow, 0.056, 0.04))
      addMesh(drv, g, M.suit);
    for (const g of taperedLimb(elbow, wrist, 0.042, 0.03))
      addMesh(drv, g, M.suit);
    const glove = new RoundedBoxGeometry(0.075, 0.085, 0.045, 3, 0.018);
    glove.rotateZ(0.32);
    glove.translate(0.43, 0.555, s * 0.132);
    addMesh(drv, glove, M.satinBlack);
    // legs: raised knees, feet up on the pedals, and boots
    const hipJ = V(0.3, 0.17, s * 0.09);
    const knee = V(0.78, 0.37, s * 0.1);
    const ankle = V(1.25, 0.3, s * 0.075);
    for (const g of taperedLimb(hipJ, knee, 0.085, 0.056))
      addMesh(drv, g, M.suit);
    // calf: fuller just below the knee, slim at the ankle
    const calf = knee.clone().lerp(ankle, 0.3);
    for (const g of taperedLimb(knee, calf, 0.056, 0.058))
      addMesh(drv, g, M.suit);
    for (const g of taperedLimb(calf, ankle, 0.058, 0.038))
      addMesh(drv, g, M.suit);
    const boot = loftStations(
      [
        {
          x: ankle.x - 0.03,
          cy: ankle.y,
          cz: ankle.z,
          w: 0.042,
          hT: 0.045,
          hB: 0.045,
          n: 2.4,
        },
        {
          x: ankle.x + 0.04,
          cy: ankle.y + 0.01,
          cz: ankle.z,
          w: 0.042,
          hT: 0.06,
          hB: 0.04,
          n: 2.6,
        },
        {
          x: ankle.x + 0.12,
          cy: ankle.y + 0.04,
          cz: ankle.z,
          w: 0.04,
          hT: 0.04,
          hB: 0.035,
          n: 2.6,
        },
        {
          x: ankle.x + 0.15,
          cy: ankle.y + 0.05,
          cz: ankle.z,
          w: 0.025,
          hT: 0.022,
          hB: 0.02,
          n: 2.2,
        },
      ],
      { steps: 5, around: 24 },
    );
    addMesh(drv, boot, M.satinBlack);
  }

  /* Seat (extractable, moulded to the driver) */
  const seat = reg.part({
    id: "seat",
    info: "seat",
    layer: "cockpit",
    explode: [0, 1.1, 0],
    delay: 0.5,
  });
  const prof = smoothOutline(
    [
      [-0.08, 0.57],
      [-0.05, 0.57],
      [0.12, 0.22],
      [0.2, 0.1],
      [0.45, 0.1],
      [0.5, 0.12],
      [0.45, 0.08],
      [0.18, 0.075],
      [0.08, 0.2],
      [-0.1, 0.53],
    ],
    80,
  );
  const sg = plateXY(prof, 0.42, 0, 0.01);
  addMesh(seat, sg, M.carbonMatte);
  for (const s of [1, -1]) {
    const bol = plateXY(
      smoothOutline(
        [
          [-0.05, 0.51],
          [0.14, 0.2],
          [0.25, 0.1],
          [0.2, 0.2],
          [0.02, 0.53],
        ],
        40,
      ),
      0.02,
      s * 0.215,
      0.005,
    );
    addMesh(seat, bol, M.carbonMatte);
  }

  /* Steering wheel */
  const sw = reg.part({
    id: "steering-wheel",
    info: "steering-wheel",
    layer: "cockpit",
    explode: [0.45, 1.35, 0],
    delay: 0.6,
  });
  const pivot = new THREE.Object3D();
  pivot.position.set(0.45, 0.555, 0);
  pivot.rotation.z = 0.32;
  sw.add(pivot);
  const outline = new THREE.Shape();
  const W = 0.14;
  const Hh = 0.075;
  outline.moveTo(-W + 0.03, -Hh);
  outline.lineTo(W - 0.03, -Hh);
  outline.quadraticCurveTo(W + 0.01, -Hh, W + 0.012, -Hh + 0.04);
  outline.lineTo(W + 0.01, Hh - 0.02);
  outline.quadraticCurveTo(W, Hh + 0.005, W - 0.04, Hh);
  outline.lineTo(-W + 0.04, Hh);
  outline.quadraticCurveTo(-W, Hh + 0.005, -W - 0.01, Hh - 0.02);
  outline.lineTo(-W - 0.012, -Hh + 0.04);
  outline.quadraticCurveTo(-W - 0.01, -Hh, -W + 0.03, -Hh);
  const body = new THREE.ExtrudeGeometry(outline, {
    depth: 0.025,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 3,
  });
  body.rotateY(Math.PI / 2);
  body.translate(-0.012, 0, 0);
  addMesh(pivot, body, M.carbon);
  for (const s of [1, -1]) {
    const grip = new THREE.CapsuleGeometry(0.02, 0.09, 6, 12);
    grip.translate(0.005, -0.005, s * (W - 0.005));
    addMesh(pivot, grip, M.padding);
  }
  const scr = new THREE.PlaneGeometry(0.09, 0.05);
  scr.rotateY(-Math.PI / 2);
  scr.translate(-0.022, 0.012, 0);
  addMesh(pivot, scr, M.screen, { cast: false });
  const leds = [
    M.ledGreen,
    M.ledGreen,
    M.ledGreen,
    M.ledRed,
    M.ledRed,
    M.ledRed,
    M.ledBlue,
    M.ledBlue,
    M.ledBlue,
  ];
  leds.forEach((mat, i) => {
    const led = new THREE.BoxGeometry(0.004, 0.006, 0.008);
    led.translate(-0.022, 0.056, (i - 4) * 0.012);
    addMesh(pivot, led, mat, { cast: false });
  });
  const btnColors = [
    M.ledRed,
    M.ledBlue,
    M.helmetAccent,
    M.aluminium,
    M.aluminium,
    M.ledGreen,
  ];
  btnColors.forEach((mat, i) => {
    const b = new THREE.CylinderGeometry(0.007, 0.007, 0.008, 12);
    b.rotateZ(Math.PI / 2);
    const col = i % 3;
    const s = i < 3 ? 1 : -1;
    b.translate(
      -0.022,
      -0.02 - col * 0.018 + 0.03,
      s * (0.075 + (col % 2) * 0.012),
    );
    addMesh(pivot, b, mat, { cast: false });
  });
  // quick-release hub & column
  const qr = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16);
  qr.rotateZ(Math.PI / 2);
  qr.translate(0.035, 0, 0);
  addMesh(pivot, qr, M.aluminium);
  addMesh(
    sw,
    cylinderBetween(V(0.5, 0.54, 0), V(0.9, 0.46, 0), 0.014),
    M.steel,
  );

  /* Headrest / cockpit padding */
  const pad = reg.part({
    id: "headrest",
    info: "headrest",
    layer: "cockpit",
    explode: [0.1, 0.42, 0],
    delay: 0.5,
  });
  const rear = new RoundedBoxGeometry(0.1, 0.13, 0.46, 4, 0.03);
  rear.translate(-0.13, 0.57, 0);
  addMesh(pad, rear, M.padding);
  for (const s of [1, -1]) {
    const side = new RoundedBoxGeometry(0.34, 0.1, 0.075, 4, 0.03);
    side.translate(0.1, 0.575, s * 0.205);
    addMesh(pad, side, M.padding);
  }

  /* FIA camera housings: T-cam on the roll hoop + nose cameras */
  const cam = reg.part({
    id: "camera-tcam",
    info: "cameras",
    layer: "electronics",
    explode: [-0.15, 2.25, 0],
    delay: 0.55,
  });
  const noseCam = reg.part({
    id: "camera-nose",
    info: "cameras",
    layer: "electronics",
    explode: [1.05, 0.4, 0],
    delay: 0.5,
  });
  const tpost = new RoundedBoxGeometry(0.035, 0.035, 0.03, 2, 0.008);
  tpost.translate(-0.31, ROLL_HOOP_TOP + 0.005, 0);
  addMesh(cam, tpost, M.tcam);
  const tbar = new RoundedBoxGeometry(0.045, 0.028, 0.2, 3, 0.012);
  tbar.translate(-0.31, ROLL_HOOP_TOP + 0.03, 0);
  addMesh(cam, tbar, M.tcam);
  for (const s of [1, -1]) {
    const lens = new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16);
    lens.rotateZ(Math.PI / 2);
    lens.translate(-0.286, ROLL_HOOP_TOP + 0.03, s * 0.07);
    addMesh(cam, lens, M.lens);
    // nose cameras
    const pod = loftStations(
      [
        {
          x: 2.1,
          cy: 0.36,
          cz: s * 0.108,
          w: 0.004,
          hT: 0.004,
          hB: 0.004,
          n: 2,
        },
        {
          x: 2.08,
          cy: 0.36,
          cz: s * 0.11,
          w: 0.016,
          hT: 0.014,
          hB: 0.014,
          n: 2.2,
        },
        {
          x: 1.98,
          cy: 0.355,
          cz: s * 0.108,
          w: 0.018,
          hT: 0.016,
          hB: 0.016,
          n: 2.4,
        },
        {
          x: 1.92,
          cy: 0.35,
          cz: s * 0.1,
          w: 0.008,
          hT: 0.008,
          hB: 0.008,
          n: 2,
        },
      ],
      { steps: 6, around: 20 },
    );
    addMesh(noseCam, pod, M.tcam);
  }
}
