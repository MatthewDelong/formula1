import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loftStations, tubeThrough, latheX, cylinderBetween } from './geometry.js';
import { addMesh } from './registry.js';
import { EXHAUST_EXIT, REAR_AXLE_X } from './dims.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Collects many small detail pieces for a part and adds them as a single
 * mesh per material, so fine detail doesn't cost hundreds of draw calls.
 */
function detailer(part, M) {
  const byMat = new Map();
  const d = {
    add(geo, mat) {
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(geo);
    },
    /** A bolt head standing on point p, facing along axis. */
    bolt(p, axis, r = 0.0055, h = 0.007) {
      d.add(cylinderBetween(p, p.clone().addScaledVector(axis, h), r, r, 6), M.steel);
    },
    /** n bolts evenly spaced on a circle of radius R around centre c. */
    boltRing(c, axis, R, n, r) {
      const u = Math.abs(axis.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
      u.addScaledVector(axis, -u.dot(axis)).normalize();
      const w = axis.clone().cross(u);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        d.bolt(c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(w, Math.sin(a) * R), axis, r);
      }
    },
    done() {
      for (const [mat, geos] of byMat) {
        const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
        const keepUv = flat.every((g) => g.attributes.uv);
        for (const g of flat) {
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
          g.clearGroups();
        }
        addMesh(part, mergeGeometries(flat), mat);
      }
    },
  };
  return d;
}

/** Ring of cooling fins / bands around the X axis. */
function bandX(x, y, z, r, tube = 0.004) {
  const g = new THREE.TorusGeometry(r, tube, 6, 36);
  g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function rbox(w, h, d, r, x, y, z) {
  const g = new RoundedBoxGeometry(w, h, d, 3, r);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------------ */
/* Power unit                                                         */
/* ------------------------------------------------------------------ */

const ICE_X0 = -0.47; // front face of the engine
const ICE_X1 = -1.02; // bell-housing
const CRANK_Y = 0.2;
const ICE_CX = (ICE_X0 + ICE_X1) / 2;
const BANK = Math.PI / 4; // 90° vee

export function buildPowerUnit(reg, M) {
  /* Internal combustion engine */
  const ice = reg.part({ id: 'ice', info: 'ice', layer: 'pu', explode: [0, 0.35, 0], delay: 0.35 });
  const len = ICE_X0 - ICE_X1;
  addMesh(ice, rbox(len, 0.2, 0.26, 0.03, ICE_CX, CRANK_Y - 0.02, 0), M.engineBlack);
  // sump
  addMesh(ice, rbox(len * 0.9, 0.06, 0.2, 0.02, ICE_CX, CRANK_Y - 0.13, 0), M.magnesium);
  for (const s of [1, -1]) {
    const dir = V(0, Math.cos(BANK), s * Math.sin(BANK));
    const bank = new RoundedBoxGeometry(len * 0.92, 0.2, 0.12, 3, 0.02);
    bank.rotateX(s * BANK);
    const c = V(ICE_CX, CRANK_Y, 0).addScaledVector(dir, 0.125);
    bank.translate(c.x, c.y, c.z);
    addMesh(ice, bank, M.engineBlack);
    // cam cover
    const cam = new RoundedBoxGeometry(len * 0.88, 0.045, 0.105, 3, 0.018);
    cam.rotateX(s * BANK);
    const cc = V(ICE_CX, CRANK_Y, 0).addScaledVector(dir, 0.235);
    cam.translate(cc.x, cc.y, cc.z);
    addMesh(ice, cam, M.camCover);
    // coil packs along each cam cover
    for (let i = 0; i < 3; i++) {
      const x = ICE_X0 - 0.09 - i * 0.175;
      const coil = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10);
      coil.rotateX(s * BANK);
      const p = V(x, CRANK_Y, 0).addScaledVector(dir, 0.265);
      coil.translate(p.x, p.y, p.z);
      addMesh(ice, coil, M.satinBlack);
    }
  }
  // intake plenum in the vee + airbox trunk
  addMesh(
    ice,
    loftStations(
      [
        { x: ICE_X0 - 0.02, cy: 0.43, w: 0.07, hT: 0.05, hB: 0.05, n: 3 },
        { x: ICE_CX, cy: 0.45, w: 0.09, hT: 0.07, hB: 0.06, n: 3 },
        { x: ICE_X1 + 0.03, cy: 0.44, w: 0.08, hT: 0.06, hB: 0.05, n: 3 },
      ],
      { steps: 8, around: 32 },
    ),
    M.carbon,
  );
  addMesh(ice, tubeThrough([[-0.3, 0.86, 0], [-0.36, 0.72, 0], [-0.46, 0.52, 0], [-0.52, 0.47, 0]], 0.055, { tubular: 32 }), M.carbon);
  // exhaust primaries (outboard of each bank, running back to the turbine)
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const x = ICE_X0 - 0.09 - i * 0.175;
      const pts = [
        V(x, 0.3, s * 0.19),
        V(x - 0.03, 0.26, s * 0.25),
        V(x - 0.12, 0.2, s * 0.25),
        V(-0.95, 0.2, s * (0.22 - i * 0.012)),
        V(-1.08, 0.3, s * 0.14),
        V(-1.13, 0.4, s * 0.06),
      ];
      addMesh(ice, tubeThrough(pts, 0.017, { tubular: 40, radial: 10 }), M.exhaust);
    }
  }
  // oil tank between engine and fuel cell
  addMesh(ice, rbox(0.05, 0.3, 0.3, 0.02, ICE_X0 + 0.015, 0.3, 0), M.aluminium);

  /* Engine detail */
  const d = detailer(ice, M);
  const CYL_X = [0, 1, 2].map((i) => ICE_X0 - 0.09 - i * 0.175);
  for (const s of [1, -1]) {
    const dir = V(0, Math.cos(BANK), s * Math.sin(BANK)); // up the bank
    const out = V(0, -Math.sin(BANK), s * Math.cos(BANK)); // away from the vee
    const at = (x, up, side) => V(x, CRANK_Y, 0).addScaledVector(dir, up).addScaledVector(out, side);
    // cam-cover bolts along both edges
    for (let i = 0; i < 7; i++) {
      const x = ICE_X0 - 0.035 - (i / 6) * (len - 0.07);
      for (const side of [0.043, -0.043]) d.bolt(at(x, 0.257, side), dir);
    }
    // cooling ribs cast into the outer face of the cylinder head
    for (let i = 0; i < 8; i++) {
      const rib = new THREE.BoxGeometry(0.008, 0.15, 0.012);
      rib.rotateX(s * BANK);
      const c = at(ICE_X0 - 0.04 - (i / 7) * (len - 0.08), 0.13, 0.064);
      rib.translate(c.x, c.y, c.z);
      d.add(rib, M.engineBlack);
    }
    for (const x of CYL_X) {
      // coil-pack connector and the loom that feeds it
      d.add(cylinderBetween(at(x, 0.279, 0), at(x, 0.279, 0.026), 0.006, 0.006, 8), M.satinBlack);
      // intake runner from the plenum down into the head
      d.add(tubeThrough([at(x, 0.215, -0.05), V(x, 0.43, s * 0.085), V(x, 0.41, s * 0.03)], 0.013, { tubular: 16, radial: 10 }), M.magnesium);
      // fuel injector at the port
      d.add(cylinderBetween(at(x, 0.2, -0.062), at(x, 0.2, -0.062).add(V(0, 0.035, 0)), 0.007, 0.005, 8), M.steel);
    }
    d.add(
      tubeThrough([at(ICE_X0 + 0.01, 0.27, 0.03), at(CYL_X[0], 0.28, 0.028), at(CYL_X[1], 0.28, 0.028), at(CYL_X[2], 0.28, 0.028), at(ICE_X1 + 0.03, 0.26, 0.03)], 0.0055, { tubular: 40, radial: 6 }),
      M.satinBlack,
    );
    // fuel rail feeding the injectors
    d.add(tubeThrough(CYL_X.map((x) => at(x, 0.232, -0.062)), 0.006, { tubular: 24, radial: 8 }), M.aluminium);
    // exhaust collector: the three primaries merge before the turbine
    d.add(cylinderBetween(V(-1.05, 0.25, s * 0.2), V(-1.12, 0.38, s * 0.08), 0.03, 0.036, 16), M.exhaust);
  }
  // bell-housing flange where the gearbox bolts on
  d.add(bandX(ICE_X1, 0.24, 0, 0.125, 0.012), M.magnesium);
  d.boltRing(V(ICE_X1 - 0.008, 0.24, 0), V(-1, 0, 0), 0.125, 14, 0.006);
  // oil scavenge pump stack along the left of the sump, with its lines to the tank
  d.add(cylinderBetween(V(-0.56, 0.1, -0.152), V(-0.88, 0.1, -0.152), 0.026, 0.026, 18), M.aluminium);
  for (let i = 0; i < 5; i++) d.add(bandX(-0.59 - i * 0.065, 0.1, -0.152, 0.027), M.steel);
  d.add(tubeThrough([[-0.56, 0.1, -0.152], [-0.51, 0.13, -0.16], [-0.47, 0.2, -0.13]], 0.007, { tubular: 16, radial: 8 }), M.steel);
  d.add(tubeThrough([[-0.88, 0.1, -0.152], [-0.84, 0.07, -0.18], [-0.6, 0.07, -0.19], [-0.47, 0.28, -0.14]], 0.007, { tubular: 32, radial: 8 }), M.steel);
  // water pump, piped to the right-hand radiator
  d.add(cylinderBetween(V(-0.52, 0.14, -0.125), V(-0.52, 0.14, -0.19), 0.034, 0.034, 20), M.aluminium);
  d.boltRing(V(-0.52, 0.14, -0.19), V(0, 0, -1), 0.025, 6, 0.004);
  d.add(tubeThrough([[-0.52, 0.14, -0.19], [-0.5, 0.24, -0.215], [-0.46, 0.34, -0.2]], 0.013, { tubular: 16, radial: 10 }), M.aluminium);
  d.done();

  /* Turbocharger (single, on the centreline behind the engine) */
  const tc = reg.part({ id: 'turbo', info: 'turbo', layer: 'pu', explode: [-0.2, 0.7, 0], delay: 0.4 });
  const TY = 0.44;
  const turb = new THREE.TorusGeometry(0.062, 0.036, 16, 40);
  turb.rotateY(Math.PI / 2);
  turb.translate(-1.16, TY, 0);
  addMesh(tc, turb, M.foil);
  const comp = new THREE.TorusGeometry(0.058, 0.03, 16, 40);
  comp.rotateY(Math.PI / 2);
  comp.translate(-1.03, TY, 0);
  addMesh(tc, comp, M.aluminium);
  const shaft = latheX([[0.001, -1.2], [0.05, -1.2], [0.05, -0.99], [0.001, -0.99]], 32);
  shaft.translate(0, TY, 0);
  addMesh(tc, shaft, M.steel);
  // compressor outlet to plenum
  addMesh(tc, tubeThrough([[-1.03, TY + 0.05, 0.03], [-1.0, 0.5, 0.06], [-0.97, 0.47, 0.04]], 0.028), M.aluminium);
  const td = detailer(tc, M);
  // compressor intake bellmouth
  const bell = latheX([[0.046, -0.99], [0.048, -0.972], [0.055, -0.96], [0.066, -0.955]], 32);
  bell.translate(0, TY, 0);
  td.add(bell, M.aluminium);
  // V-band clamps joining the housings
  for (const x of [-1.09, -1.2]) td.add(bandX(x, TY, 0, 0.052, 0.006), M.steel);
  // wastegate and its actuator on the turbine inlet
  td.add(cylinderBetween(V(-1.18, TY + 0.06, -0.05), V(-1.18, TY + 0.12, -0.07), 0.018, 0.018, 16), M.foil);
  td.add(cylinderBetween(V(-1.18, TY + 0.12, -0.07), V(-1.18, TY + 0.14, -0.078), 0.026, 0.026, 18), M.aluminium);
  td.done();

  /* Exhaust tailpipe */
  const ex = reg.part({ id: 'exhaust', info: 'exhaust', layer: 'pu', explode: [-0.6, 0.55, 0], delay: 0.45 });
  addMesh(
    ex,
    tubeThrough(
      [
        [-1.2, TY, 0],
        [-1.45, 0.45, 0],
        [-1.8, EXHAUST_EXIT.y, 0],
        [EXHAUST_EXIT.x, EXHAUST_EXIT.y, 0],
      ],
      0.045,
      { tubular: 48, radial: 20 },
    ),
    M.exhaust,
  );
  const lip = new THREE.TorusGeometry(0.045, 0.004, 8, 32);
  lip.rotateY(Math.PI / 2);
  lip.translate(EXHAUST_EXIT.x, EXHAUST_EXIT.y, 0);
  addMesh(ex, lip, M.exhaust);

  /* MGU-K */
  const k = reg.part({ id: 'mgu-k', info: 'mgu-k', layer: 'pu', explode: [0.1, 0.1, 0.6], delay: 0.4 });
  const motor = latheX([[0.001, -0.53], [0.05, -0.53], [0.058, -0.55], [0.058, -0.7], [0.05, -0.72], [0.02, -0.74], [0.001, -0.74]], 32);
  motor.translate(0, 0.12, 0.2);
  addMesh(k, motor, M.aluminium);
  // orange high-voltage cable to the control electronics
  addMesh(k, tubeThrough([[-0.53, 0.12, 0.2], [-0.5, 0.18, 0.24], [-0.4, 0.23, 0.3]], 0.01), M.hv);
  const kd = detailer(k, M);
  // cooling fins around the stator housing
  for (let i = 0; i < 8; i++) kd.add(bandX(-0.565 - i * 0.017, 0.12, 0.2, 0.059, 0.0035), M.magnesium);
  // mounting flange to the engine's front gear case
  kd.add(cylinderBetween(V(-0.528, 0.12, 0.2), V(-0.538, 0.12, 0.2), 0.072, 0.072, 32), M.magnesium);
  kd.boltRing(V(-0.528, 0.12, 0.2), V(1, 0, 0), 0.064, 8, 0.0045);
  // coolant feed and return
  for (const dz of [0.02, -0.02]) kd.add(tubeThrough([[-0.62, 0.176, 0.2 + dz], [-0.56, 0.21, 0.19 + dz], [-0.49, 0.23, 0.13 + dz]], 0.0055, { tubular: 16, radial: 8 }), M.steel);
  kd.done();

  /* Energy store (battery), in the floor of the survival cell */
  const es = reg.part({ id: 'energy-store', info: 'energy-store', layer: 'pu', explode: [0, -0.45, 0], delay: 0.5 });
  addMesh(es, rbox(0.38, 0.075, 0.44, 0.012, -0.26, 0.118, 0), M.battery);
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.BoxGeometry(0.36, 0.004, 0.012);
    rib.translate(-0.26, 0.157, -0.16 + i * 0.08);
    addMesh(es, rib, M.aluminium);
  }
  const conn = new THREE.BoxGeometry(0.04, 0.03, 0.08);
  conn.translate(-0.45, 0.13, 0.12);
  addMesh(es, conn, M.hv);

  /* Control electronics */
  const ce = reg.part({ id: 'control-electronics', info: 'control-electronics', layer: 'pu', explode: [0, 0.25, 0.7], delay: 0.5 });
  addMesh(ce, rbox(0.16, 0.1, 0.1, 0.01, -0.32, 0.24, 0.36), M.electronics);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.BoxGeometry(0.15, 0.004, 0.08);
    fin.translate(-0.32, 0.295 + i * 0.006, 0.36);
    addMesh(ce, fin, M.aluminium);
  }
  addMesh(ce, tubeThrough([[-0.4, 0.22, 0.34], [-0.44, 0.15, 0.25], [-0.46, 0.13, 0.14]], 0.01), M.hv);
}

/* ------------------------------------------------------------------ */
/* Drivetrain, fuel, cooling, structures, electronics                 */
/* ------------------------------------------------------------------ */

export function buildInternals(reg, M) {
  /* Gearbox */
  const gb = reg.part({ id: 'gearbox', info: 'gearbox', layer: 'pu', explode: [-0.55, 0.2, 0], delay: 0.4 });
  addMesh(
    gb,
    loftStations(
      [
        { x: -1.0, cy: 0.25, w: 0.14, hT: 0.11, hB: 0.12, n: 3.2 },
        { x: -1.35, cy: 0.26, w: 0.115, hT: 0.105, hB: 0.1, n: 3.2 },
        { x: -1.7, cy: 0.3, w: 0.11, hT: 0.095, hB: 0.1, n: 3 },
        { x: -1.97, cy: 0.305, w: 0.08, hT: 0.065, hB: 0.07, n: 3 },
      ],
      { steps: 8, around: 40 },
    ),
    M.titanium,
  );
  // differential side covers
  for (const s of [1, -1]) {
    const c = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24);
    c.rotateX(Math.PI / 2);
    c.translate(REAR_AXLE_X, 0.355, s * 0.105);
    addMesh(gb, c, M.magnesium);
  }
  const gd = detailer(gb, M);
  // bolts round the bell-housing face and the diff covers
  gd.boltRing(V(-1.0, 0.24, 0), V(1, 0, 0), 0.105, 12, 0.006);
  for (const s of [1, -1]) gd.boltRing(V(REAR_AXLE_X, 0.355, s * 0.12), V(0, 0, s), 0.048, 8, 0.0045);
  // hydraulic control block with its servo valves and lines
  gd.add(rbox(0.2, 0.045, 0.11, 0.008, -1.2, 0.382, 0), M.aluminium);
  for (let i = 0; i < 4; i++) gd.add(cylinderBetween(V(-1.13 - i * 0.045, 0.4, 0.025), V(-1.13 - i * 0.045, 0.43, 0.025), 0.011, 0.011, 12), M.satinBlack);
  for (const s of [1, -1]) gd.add(tubeThrough([[-1.3, 0.39, s * 0.04], [-1.5, 0.4, s * 0.07], [-1.64, 0.39, s * 0.09]], 0.0045, { tubular: 20, radial: 6 }), M.steel);
  // gear-shift actuator along the left of the casing
  gd.add(cylinderBetween(V(-1.05, 0.2, -0.14), V(-1.24, 0.2, -0.13), 0.017, 0.017, 14), M.aluminium);
  // stiffening ribs down the sides of the casing
  for (const s of [1, -1]) {
    for (const [x, hw] of [[-1.15, 0.128], [-1.3, 0.119], [-1.45, 0.114], [-1.58, 0.112]]) {
      const rib = new THREE.BoxGeometry(0.01, 0.13, 0.016);
      rib.translate(x, 0.26, s * hw);
      gd.add(rib, M.titanium);
    }
  }
  // rear-suspension pick-up brackets
  for (const s of [1, -1]) {
    for (const [x, y, z] of [[-1.3, 0.2, 0.13], [-1.82, 0.2, 0.085], [-1.55, 0.2, 0.095], [-1.86, 0.31, 0.095]]) {
      gd.add(rbox(0.03, 0.026, 0.024, 0.004, x, y, s * z), M.steel);
    }
  }
  gd.done();

  /* Rear impact structure + central rear light */
  const ris = reg.part({ id: 'rear-impact-structure', info: 'rear-impact-structure', layer: 'chassis', explode: [-0.95, 0.05, 0], delay: 0.3 });
  addMesh(
    ris,
    loftStations(
      [
        { x: -1.95, cy: 0.31, w: 0.075, hT: 0.06, hB: 0.06, n: 2.8 },
        { x: -2.2, cy: 0.305, w: 0.058, hT: 0.045, hB: 0.045, n: 2.8 },
        { x: -2.33, cy: 0.3, w: 0.048, hT: 0.036, hB: 0.036, n: 3 },
      ],
      { steps: 8, around: 32 },
    ),
    M.carbon,
  );
  const light = reg.part({ id: 'rear-light', info: 'rear-light', layer: 'electronics', explode: [-1.2, -0.05, 0], delay: 0.35 });
  addMesh(light, rbox(0.022, 0.05, 0.08, 0.006, -2.338, 0.3, 0), M.satinBlack);
  const lens = new THREE.PlaneGeometry(0.07, 0.04);
  lens.rotateY(-Math.PI / 2);
  lens.translate(-2.35, 0.3, 0);
  addMesh(light, lens, M.lightRed, { cast: false });

  /* Fuel cell */
  const fc = reg.part({ id: 'fuel-cell', info: 'fuel-cell', layer: 'pu', explode: [0, 0.7, 0], delay: 0.45 });
  addMesh(fc, rbox(0.34, 0.42, 0.52, 0.06, -0.27, 0.375, 0), M.fuelCell);
  const cap = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20);
  cap.translate(-0.3, 0.595, 0.18);
  addMesh(fc, cap, M.aluminium);

  /* Radiators in each sidepod */
  const rad = reg.part({ id: 'radiator-L', info: 'radiators', layer: 'pu', explode: [0, 0.45, 0.55], delay: 0.35 });
  // mounted high and inboard, clear of the sidepod undercut
  const RY = 0.355;
  const RZ = 0.42;
  const core = new THREE.BoxGeometry(0.44, 0.24, 0.05);
  core.rotateX(0.32);
  core.translate(0.1, RY, RZ);
  addMesh(rad, core, M.radiator);
  for (const dy of [0.135, -0.135]) {
    const tank = new THREE.BoxGeometry(0.46, 0.03, 0.06);
    tank.rotateX(0.32);
    tank.translate(0.1, RY + dy * Math.cos(0.32), RZ - dy * Math.sin(0.32));
    addMesh(rad, tank, M.aluminium);
  }
  addMesh(rad, tubeThrough([[-0.12, 0.38, 0.4], [-0.3, 0.34, 0.31], [-0.46, 0.34, 0.2]], 0.016), M.aluminium);
  reg.mirror(rad, 'radiator-R');

  /* Side impact structures (upper and lower) */
  const sis = reg.part({ id: 'sis-L', info: 'side-impact', layer: 'chassis', explode: [0, -0.1, 0.8], delay: 0.3 });
  for (const [x, y, z1] of [[0.42, 0.5, 0.6], [0.3, 0.21, 0.47]]) {
    const g = new THREE.CylinderGeometry(0.035, 0.04, z1 - 0.27, 20);
    g.rotateX(Math.PI / 2);
    g.scale(1.5, 0.75, 1);
    g.translate(x, y, (z1 + 0.27) / 2);
    addMesh(sis, g, M.carbon);
  }
  reg.mirror(sis, 'sis-R');

  /* Standard ECU */
  const ecu = reg.part({ id: 'ecu', info: 'ecu', layer: 'electronics', explode: [0, 0.3, -0.7], delay: 0.5 });
  addMesh(ecu, rbox(0.2, 0.05, 0.14, 0.008, -0.28, 0.22, -0.36), M.aluminium);
  const lbl = new THREE.BoxGeometry(0.12, 0.002, 0.07);
  lbl.translate(-0.28, 0.246, -0.36);
  addMesh(ecu, lbl, M.satinBlack);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12);
    c.rotateZ(Math.PI / 2);
    c.translate(-0.39, 0.22, -0.4 + i * 0.04);
    addMesh(ecu, c, M.satinBlack);
  }
}

