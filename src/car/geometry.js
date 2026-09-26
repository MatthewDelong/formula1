import * as THREE from 'three';

// Coordinate convention for the whole car:
//   +x = forward (nose direction), +y = up, +z = driver's left.
// Units are metres. The ground plane is y = 0.

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Loft: skin a series of rings (arrays of Vector3 with equal length)  */
/* ------------------------------------------------------------------ */

/**
 * Build a BufferGeometry by connecting consecutive rings of points.
 * UVs are generated in metres (arc length around, distance along), so
 * tiling textures such as carbon weave keep a consistent physical scale.
 */
export function loftRings(rings, { closed = true, capStart = false, capEnd = false } = {}) {
  const nRing = rings.length;
  const nPts = rings[0].length;
  const cols = closed ? nPts + 1 : nPts; // duplicate seam column for clean UVs

  const positions = [];
  const uvs = [];
  const indices = [];

  // distance along (average of ring centroids)
  const centroids = rings.map(ringCentroid);
  const along = [0];
  for (let i = 1; i < nRing; i++) along.push(along[i - 1] + centroids[i].distanceTo(centroids[i - 1]));

  for (let i = 0; i < nRing; i++) {
    const ring = rings[i];
    let arc = 0;
    for (let j = 0; j < cols; j++) {
      const p = ring[j % nPts];
      if (j > 0) arc += p.distanceTo(ring[(j - 1) % nPts]);
      positions.push(p.x, p.y, p.z);
      uvs.push(arc, along[i]);
    }
  }
  for (let i = 0; i < nRing - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const addCap = (ringIdx, flip) => {
    const ring = rings[ringIdx];
    const c = centroids[ringIdx];
    const base = positions.length / 3;
    positions.push(c.x, c.y, c.z);
    uvs.push(0, 0);
    for (let j = 0; j < nPts; j++) {
      const p = ring[j];
      positions.push(p.x, p.y, p.z);
      uvs.push(p.z - c.z, p.y - c.y);
    }
    for (let j = 0; j < nPts; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % nPts);
      if (flip) indices.push(base, b, a);
      else indices.push(base, a, b);
    }
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(nRing - 1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function ringCentroid(ring) {
  const c = new THREE.Vector3();
  for (const p of ring) c.add(p);
  return c.multiplyScalar(1 / ring.length);
}

/* ------------------------------------------------------------------ */
/* Station interpolation                                              */
/* ------------------------------------------------------------------ */

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Smoothly resample a list of key stations (objects with numeric fields)
 * using Catmull-Rom interpolation on every numeric field.
 */
export function resampleStations(keys, stepsPerSpan = 8) {
  const out = [];
  // union of numeric fields; a field missing from a key inherits its neighbour's value
  const fields = [...new Set(keys.flatMap((k) => Object.keys(k).filter((f) => typeof k[f] === 'number')))];
  keys = keys.map((k) => ({ ...k }));
  for (const f of fields) {
    for (let i = 1; i < keys.length; i++) keys[i][f] ??= keys[i - 1][f];
    for (let i = keys.length - 2; i >= 0; i--) keys[i][f] ??= keys[i + 1][f];
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)];
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const k3 = keys[Math.min(keys.length - 1, i + 2)];
    for (let s = 0; s < stepsPerSpan; s++) {
      const t = s / stepsPerSpan;
      const st = { ...k1 };
      for (const f of fields) st[f] = catmull(k0[f], k1[f], k2[f], k3[f], t);
      out.push(st);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Cross sections                                                     */
/* ------------------------------------------------------------------ */

const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

/**
 * Superellipse ring in the YZ plane at station x.
 * s: { x, cy, cz, w (half width), hT (height above cy), hB (height below cy),
 *      n (squareness, 2 = ellipse), nB (optional squareness for the lower half),
 *      tw (top width factor: <1 narrows the top, giving a tapered "tub"),
 *      bw (bottom width factor: <1 tucks the lower half in, e.g. an undercut),
 *      tilt (shear dy/dz about cz: <0 slopes the top down outboard, e.g. a
 *            downwash sidepod) }
 */
export function superRing(s, count = 48) {
  const pts = [];
  const n = s.n ?? 2.5;
  const nB = s.nB ?? n;
  const tw = s.tw ?? 1;
  const bw = s.bw ?? 1;
  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const upper = sn >= 0;
    const e = 2 / (upper ? n : nB);
    // width factor blends between bottom and top width
    const wf = upper ? 1 + (tw - 1) * Math.pow(sn, 1.5) : 1 + (bw - 1) * Math.pow(-sn, 1.5);
    const dz = s.w * wf * sgnPow(c, e);
    const y = s.cy + (upper ? s.hT : s.hB) * sgnPow(sn, e) + (s.tilt ?? 0) * dz;
    pts.push(new THREE.Vector3(s.x, y, (s.cz ?? 0) + dz));
  }
  return pts;
}

/** Loft through key stations with smooth interpolation. */
export function loftStations(keys, { steps = 8, around = 48, capStart = true, capEnd = true, ring = superRing } = {}) {
  const st = resampleStations(keys, steps);
  const rings = st.map((s) => ring(s, around));
  return loftRings(rings, { closed: true, capStart, capEnd });
}

/* ------------------------------------------------------------------ */
/* Aerofoils and wings                                                */
/* ------------------------------------------------------------------ */

/**
 * Inverted (downforce-producing) NACA-4 style aerofoil ring.
 * sec: { z, x (leading edge), y (leading edge), chord, angle (deg, trailing
 *        edge up), t (thickness ratio), m (camber ratio) }
 */
export function aerofoilRing(sec, count = 28) {
  const half = count / 2;
  const { chord, t = 0.1, m = 0.06 } = sec;
  const p = 0.4;
  const a = THREE.MathUtils.degToRad(sec.angle ?? 0);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const upper = [];
  const lower = [];
  for (let i = 0; i <= half; i++) {
    // cosine spacing concentrates points at the leading edge
    const s = 0.5 * (1 - Math.cos((i / half) * Math.PI));
    const yt = 5 * t * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
    let yc = s < p ? (m / (p * p)) * (2 * p * s - s * s) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * s - s * s);
    yc = -yc; // inverted camber: convex side faces the ground
    upper.push([s, yc + yt]);
    lower.push([s, yc - yt]);
  }
  const pts = [];
  const push = ([s, yy]) => {
    const lx = -s * chord;
    const ly = yy * chord;
    pts.push(new THREE.Vector3(sec.x + lx * ca + ly * sa, sec.y - lx * sa + ly * ca, sec.z));
  };
  // go TE -> LE along upper, then LE -> TE along lower (skip duplicates)
  for (let i = half; i >= 0; i--) push(upper[i]);
  for (let i = 1; i < half; i++) push(lower[i]);
  return pts;
}

/** Wing element lofted along the span through aerofoil sections. */
export function wingElement(sections, { steps = 4, around = 28, caps = true } = {}) {
  const st = resampleStations(sections, steps);
  const rings = st.map((s) => aerofoilRing(s, around));
  return loftRings(rings, { closed: true, capStart: caps, capEnd: caps });
}

/** Mirror a list of half-span wing sections (z >= 0) into a full span. */
export function mirrorSections(half) {
  const pos = half.filter((s) => s.z > 0);
  const neg = pos.map((s) => ({ ...s, z: -s.z })).reverse();
  const centre = half.filter((s) => s.z === 0);
  return [...neg, ...centre, ...pos];
}

/* ------------------------------------------------------------------ */
/* Tubes / struts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Streamlined strut between two points. The cross-section is an ellipse
 * (or teardrop) whose long axis aligns with the airflow (car x axis).
 */
export function strut(a, b, { chord = 0.05, thick = 0.018, segments = 14, flow = new THREE.Vector3(1, 0, 0) } = {}) {
  const A = a.clone ? a : new THREE.Vector3(...a);
  const B = b.clone ? b : new THREE.Vector3(...b);
  const d = B.clone().sub(A).normalize();
  let u = flow.clone().sub(d.clone().multiplyScalar(flow.dot(d)));
  if (u.lengthSq() < 1e-6) u = new THREE.Vector3(0, 1, 0);
  u.normalize();
  const v = d.clone().cross(u).normalize();
  const ringAt = (P, scale) => {
    const r = [];
    for (let i = 0; i < segments; i++) {
      const th = (i / segments) * TAU;
      // teardrop: blunt leading edge (+u), sharper trailing edge (-u)
      const c = Math.cos(th);
      const s = Math.sin(th);
      const cu = c > 0 ? c * chord * 0.5 : c * chord * 0.5;
      const sv = s * thick * 0.5 * (c < 0 ? 1 + c * 0.55 : 1);
      r.push(P.clone().addScaledVector(u, cu * scale).addScaledVector(v, sv * scale));
    }
    return r;
  };
  const rings = [ringAt(A, 0.85), ringAt(A.clone().lerp(B, 0.08), 1), ringAt(A.clone().lerp(B, 0.92), 1), ringAt(B, 0.85)];
  return loftRings(rings, { closed: true, capStart: true, capEnd: true });
}

/** Round tube along a curve through points. */
export function tubeThrough(points, radius = 0.02, { tubular = 48, radial = 12, closed = false, tension = 0.5 } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Cylinder oriented between two points. */
export function cylinderBetween(a, b, rTop, rBottom = rTop, radial = 16, open = false) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radial, 1, open);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  geo.applyQuaternion(q);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

/* ------------------------------------------------------------------ */
/* Plates                                                             */
/* ------------------------------------------------------------------ */

/**
 * Extrude a 2D outline (array of [x, y]) into a thin plate lying in the
 * XY plane, centred on z. Useful for endplates, fences and strakes.
 */
export function plateXY(outline, thickness, z = 0, bevel = 0.002, curveSegments = 12) {
  const shape = new THREE.Shape();
  outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, thickness - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  geo.translate(0, 0, z - thickness / 2 + bevel);
  scaleUV(geo, 1);
  return geo;
}

/** Same as plateXY, but the outline is drawn in XZ (plan view) and extruded in y. */
export function plateXZ(outline, thickness, y = 0, bevel = 0.002) {
  const geo = plateXY(outline.map(([x, z]) => [x, -z]), thickness, 0, bevel);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** Smooth closed outline from control points using a Catmull-Rom curve. */
export function smoothOutline(points, samples = 80) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return curve.getPoints(samples).slice(0, -1).map((p) => [p.x, p.y]);
}

export function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return geo;
}

/** Lathe around the X axis (for axial parts such as MGU-K, turbo shafts). */
export function latheX(profile, segments = 32) {
  const geo = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

/** Lathe around the Z axis (wheels, discs). Profile: [radius, z]. */
export function latheZ(profile, segments = 64) {
  const geo = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Point on a superRing at angle th (0 = +z side, PI/2 = top). */
export function superPoint(s, th) {
  const n = s.n ?? 2.5;
  const nB = s.nB ?? n;
  const tw = s.tw ?? 1;
  const bw = s.bw ?? 1;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const upper = sn >= 0;
  const e = 2 / (upper ? n : nB);
  const wf = upper ? 1 + (tw - 1) * Math.pow(sn, 1.5) : 1 + (bw - 1) * Math.pow(-sn, 1.5);
  const dz = s.w * wf * sgnPow(c, e);
  const y = s.cy + (upper ? s.hT : s.hB) * sgnPow(sn, e) + (s.tilt ?? 0) * dz;
  return new THREE.Vector3(s.x, y, (s.cz ?? 0) + dz);
}
