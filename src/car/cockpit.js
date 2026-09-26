import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { plateXY, smoothOutline, cylinderBetween, loftStations } from './geometry.js';
import { addMesh } from './registry.js';
import { ROLL_HOOP_TOP } from './dims.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function limb(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

export const HELMET = { x: 0.06, y: 0.8, r: 0.125 };

export function buildCockpit(reg, M) {
  /* Driver */
  const drv = reg.part({ id: 'driver', info: 'driver', layer: 'cockpit', explode: [0, 1.85, 0], delay: 0.55 });
  // helmet shell
  const shell = new THREE.SphereGeometry(HELMET.r, 48, 32);
  shell.scale(1.1, 1.0, 0.94);
  shell.translate(HELMET.x, HELMET.y, 0);
  addMesh(drv, shell, M.helmet);
  const crown = new THREE.SphereGeometry(HELMET.r + 0.0015, 48, 16, 0, Math.PI * 2, 0, 0.55);
  crown.scale(1.1, 1.0, 0.94);
  crown.translate(HELMET.x, HELMET.y, 0);
  addMesh(drv, crown, M.helmetAccent);
  const visor = new THREE.SphereGeometry(HELMET.r + 0.003, 48, 16, Math.PI - 0.95, 1.9, 1.2, 0.42);
  visor.scale(1.1, 1.0, 0.94);
  visor.translate(HELMET.x, HELMET.y, 0);
  addMesh(drv, visor, M.visor);
  // HANS device
  const hans = new THREE.TorusGeometry(0.11, 0.022, 10, 28, Math.PI * 1.1);
  hans.rotateX(Math.PI / 2);
  hans.rotateY(Math.PI / 2 + Math.PI * 0.05);
  hans.translate(HELMET.x - 0.03, 0.655, 0);
  addMesh(drv, hans, M.carbonMatte);
  // body (reclined)
  const sh = V(0.03, 0.56, 0);
  const hip = V(0.3, 0.17, 0);
  addMesh(drv, limb(sh, hip, 0.135), M.suit);
  addMesh(drv, limb(V(0.05, 0.66, 0), V(0.05, 0.6, 0), 0.05), M.suit); // neck
  for (const s of [1, -1]) {
    const shoulder = V(0.04, 0.58, s * 0.17);
    const elbow = V(0.26, 0.46, s * 0.21);
    const hand = V(0.43, 0.555, s * 0.125);
    addMesh(drv, limb(shoulder, elbow, 0.045), M.suit);
    addMesh(drv, limb(elbow, hand, 0.04), M.suit);
    const glove = new THREE.SphereGeometry(0.035, 16, 12);
    glove.translate(hand.x, hand.y, hand.z);
    addMesh(drv, glove, M.satinBlack);
    const knee = V(0.8, 0.33, s * 0.09);
    const foot = V(1.3, 0.28, s * 0.07);
    addMesh(drv, limb(V(0.3, 0.16, s * 0.09), knee, 0.068), M.suit);
    addMesh(drv, limb(knee, foot, 0.052), M.suit);
    const boot = new RoundedBoxGeometry(0.11, 0.1, 0.07, 3, 0.02);
    boot.translate(foot.x + 0.04, foot.y + 0.02, foot.z);
    addMesh(drv, boot, M.satinBlack);
  }

  /* Seat (extractable, moulded to the driver) */
  const seat = reg.part({ id: 'seat', info: 'seat', layer: 'cockpit', explode: [0, 1.1, 0], delay: 0.5 });
  const prof = smoothOutline(
    [
      [-0.08, 0.66], [-0.05, 0.66], [0.12, 0.22], [0.2, 0.1], [0.45, 0.1],
      [0.5, 0.12], [0.45, 0.08], [0.18, 0.075], [0.08, 0.2], [-0.1, 0.62],
    ],
    80,
  );
  const sg = plateXY(prof, 0.42, 0, 0.01);
  addMesh(seat, sg, M.carbonMatte);
  for (const s of [1, -1]) {
    const bol = plateXY(smoothOutline([[-0.05, 0.6], [0.14, 0.2], [0.25, 0.1], [0.2, 0.2], [0.02, 0.62]], 40), 0.02, s * 0.215, 0.005);
    addMesh(seat, bol, M.carbonMatte);
  }

  /* Steering wheel */
  const sw = reg.part({ id: 'steering-wheel', info: 'steering-wheel', layer: 'cockpit', explode: [0.45, 1.35, 0], delay: 0.6 });
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
  const body = new THREE.ExtrudeGeometry(outline, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3 });
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
  const leds = [M.ledGreen, M.ledGreen, M.ledGreen, M.ledRed, M.ledRed, M.ledRed, M.ledBlue, M.ledBlue, M.ledBlue];
  leds.forEach((mat, i) => {
    const led = new THREE.BoxGeometry(0.004, 0.006, 0.008);
    led.translate(-0.022, 0.056, (i - 4) * 0.012);
    addMesh(pivot, led, mat, { cast: false });
  });
  const btnColors = [M.ledRed, M.ledBlue, M.helmetAccent, M.aluminium, M.aluminium, M.ledGreen];
  btnColors.forEach((mat, i) => {
    const b = new THREE.CylinderGeometry(0.007, 0.007, 0.008, 12);
    b.rotateZ(Math.PI / 2);
    const col = i % 3;
    const s = i < 3 ? 1 : -1;
    b.translate(-0.022, -0.02 - col * 0.018 + 0.03, s * (0.075 + (col % 2) * 0.012));
    addMesh(pivot, b, mat, { cast: false });
  });
  // quick-release hub & column
  const qr = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16);
  qr.rotateZ(Math.PI / 2);
  qr.translate(0.035, 0, 0);
  addMesh(pivot, qr, M.aluminium);
  addMesh(sw, cylinderBetween(V(0.5, 0.54, 0), V(0.9, 0.46, 0), 0.014), M.steel);

  /* Headrest / cockpit padding */
  const pad = reg.part({ id: 'headrest', info: 'headrest', layer: 'cockpit', explode: [0.1, 0.42, 0], delay: 0.5 });
  const rear = new RoundedBoxGeometry(0.1, 0.13, 0.46, 4, 0.03);
  rear.translate(-0.13, 0.66, 0);
  addMesh(pad, rear, M.padding);
  for (const s of [1, -1]) {
    const side = new RoundedBoxGeometry(0.34, 0.1, 0.075, 4, 0.03);
    side.translate(0.1, 0.665, s * 0.205);
    addMesh(pad, side, M.padding);
  }

  /* FIA camera housings: T-cam on the roll hoop + nose cameras */
  const cam = reg.part({ id: 'camera-tcam', info: 'cameras', layer: 'electronics', explode: [-0.15, 2.25, 0], delay: 0.55 });
  const noseCam = reg.part({ id: 'camera-nose', info: 'cameras', layer: 'electronics', explode: [1.05, 0.4, 0], delay: 0.5 });
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
        { x: 2.1, cy: 0.36, cz: s * 0.108, w: 0.004, hT: 0.004, hB: 0.004, n: 2 },
        { x: 2.08, cy: 0.36, cz: s * 0.11, w: 0.016, hT: 0.014, hB: 0.014, n: 2.2 },
        { x: 1.98, cy: 0.355, cz: s * 0.108, w: 0.018, hT: 0.016, hB: 0.016, n: 2.4 },
        { x: 1.92, cy: 0.35, cz: s * 0.1, w: 0.008, hT: 0.008, hB: 0.008, n: 2 },
      ],
      { steps: 6, around: 20 },
    );
    addMesh(noseCam, pod, M.tcam);
  }
}
