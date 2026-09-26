import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FRONT_AXLE_X, REAR_AXLE_X, REAR_WHEEL, FRONT_WHEEL, FW_HALF_SPAN, EXHAUST_EXIT, ROLL_HOOP_TOP, REF_Y } from './car/dims.js';

/**
 * Dimension overlay: measurement lines with tick marks and labels for the
 * key regulated dimensions.
 */
export function createDimensions(parent) {
  const group = new THREE.Group();
  group.name = 'dimensions';
  parent.add(group);
  const mat = new THREE.LineBasicMaterial({ color: 0xf5f7fa, transparent: true, opacity: 0.9, depthTest: false });
  const dash = new THREE.LineDashedMaterial({ color: 0xf5f7fa, dashSize: 0.03, gapSize: 0.025, transparent: true, opacity: 0.55, depthTest: false });
  const labels = [];

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const line = (pts, m = mat) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, m);
    if (m === dash) l.computeLineDistances();
    l.renderOrder = 999;
    group.add(l);
    return l;
  };
  const label = (pos, title, sub) => {
    const el = document.createElement('div');
    el.className = 'dim-label';
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    group.add(o);
    labels.push(el);
  };
  /** Measurement a→b with end ticks perpendicular to `tick`. */
  const measure = (a, b, tick, title, sub, labelOffset = V(0, 0, 0)) => {
    line([a, b]);
    const t = tick.clone().multiplyScalar(0.05);
    line([a.clone().sub(t), a.clone().add(t)]);
    line([b.clone().sub(t), b.clone().add(t)]);
    // arrow heads
    const d = b.clone().sub(a).normalize().multiplyScalar(0.05);
    const n = tick.clone().multiplyScalar(0.022);
    line([a.clone().add(d).add(n), a, a.clone().add(d).sub(n)]);
    line([b.clone().sub(d).add(n), b, b.clone().sub(d).sub(n)]);
    label(a.clone().add(b).multiplyScalar(0.5).add(labelOffset), title, sub);
  };

  // Overall width (rear tyres)
  const wy = 0.012;
  const wx = REAR_AXLE_X;
  measure(V(wx, wy, -0.95), V(wx, wy, 0.95), V(1, 0, 0), '1900 mm', 'Max. overall width');
  line([V(wx, wy, 0.95), V(wx, REAR_WHEEL.cy, 0.95)], dash);
  line([V(wx, wy, -0.95), V(wx, REAR_WHEEL.cy, -0.95)], dash);

  // Wheelbase
  const bz = 1.15;
  measure(V(REAR_AXLE_X, wy, bz), V(FRONT_AXLE_X, wy, bz), V(0, 0, 1), '3400 mm', 'Max. wheelbase');
  line([V(REAR_AXLE_X, wy, bz), V(REAR_AXLE_X, REAR_WHEEL.cy, REAR_WHEEL.z + 0.19)], dash);
  line([V(FRONT_AXLE_X, wy, bz), V(FRONT_AXLE_X, FRONT_WHEEL.cy, FRONT_WHEEL.z + 0.14)], dash);

  // Roll hoop reference height
  const hx = -0.31;
  const hz = -1.15;
  measure(V(hx, REF_Y, hz), V(hx, ROLL_HOOP_TOP, hz), V(1, 0, 0), '968 mm', 'Roll-hoop structure above reference plane', V(0, 0.1, 0));
  line([V(hx, ROLL_HOOP_TOP, hz), V(hx, ROLL_HOOP_TOP, 0)], dash);
  line([V(hx, REF_Y, hz), V(hx, REF_Y, -0.3)], dash);

  // Front wing span note
  const fy = 0.42;
  measure(V(2.5, fy, -FW_HALF_SPAN), V(2.5, fy, FW_HALF_SPAN), V(1, 0, 0), 'Front wing', '100 mm narrower than 2025', V(0, 0.08, 0));

  // Exhaust exit position
  measure(V(REAR_AXLE_X, EXHAUST_EXIT.y + 0.12, 0), V(EXHAUST_EXIT.x, EXHAUST_EXIT.y + 0.12, 0), V(0, 1, 0), '390–400 mm', 'Tailpipe behind rear axle', V(-0.1, 0.1, 0));
  line([V(REAR_AXLE_X, EXHAUST_EXIT.y + 0.12, 0), V(REAR_AXLE_X, REAR_WHEEL.cy, 0)], dash);
  line([V(EXHAUST_EXIT.x, EXHAUST_EXIT.y + 0.12, 0), V(EXHAUST_EXIT.x, EXHAUST_EXIT.y, 0)], dash);

  // Tyre diameter
  const tx = FRONT_AXLE_X - FRONT_WHEEL.r - 0.06;
  const tz = FRONT_WHEEL.z + FRONT_WHEEL.w / 2;
  measure(V(tx, 0.0, tz), V(tx, FRONT_WHEEL.r * 2, tz), V(1, 0, 0), '18″ rims', 'Tyres 25 mm (F) / 30 mm (R) narrower', V(-0.05, 0, 0.12));

  // Plank
  label(V(0.4, REF_Y - 0.02, 0.3), 'Plank 10 mm', 'Min. 8 mm after wear');

  return {
    group,
    setOpacity(o) {
      mat.opacity = 0.9 * o;
      dash.opacity = 0.55 * o;
      for (const el of labels) el.style.opacity = o;
    },
  };
}
