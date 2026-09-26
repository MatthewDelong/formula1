import * as THREE from 'three';

/**
 * A "part" is a THREE.Group that can be hovered, highlighted, exploded and
 * hidden as a unit. Several parts may share one `info` id (e.g. the four
 * tyres all point at the same rules card).
 *
 * Geometry is authored in car space and parts sit at the origin when the car
 * is assembled, so a part's position is purely its explode offset.
 */
export class PartRegistry {
  constructor(root) {
    this.root = root;
    this.parts = new Map();
  }

  /**
   * @param {object} o
   * @param {string} o.id      unique part id
   * @param {string} o.info    rules card id (see data/parts.js)
   * @param {string} o.layer   visibility layer id
   * @param {number[]} o.explode  offset at full explode
   * @param {number} [o.delay] 0..1 stagger for the explode animation
   * @param {boolean} [o.xray] made transparent in X-ray mode
   */
  part({ id, info, layer, explode = [0, 0, 0], delay = 0, xray = false }) {
    const g = new THREE.Group();
    g.name = id;
    g.userData = {
      isPart: true,
      partId: id,
      infoId: info ?? id,
      layer,
      explode: new THREE.Vector3(...explode),
      delay,
      xray,
      hideT: 0,
    };
    this.root.add(g);
    this.parts.set(id, g);
    return g;
  }

  /** Create a mirrored (right-hand) copy of a left-hand part. */
  mirror(src, id) {
    const u = src.userData;
    const g = this.part({
      id,
      info: u.infoId,
      layer: u.layer,
      explode: [u.explode.x, u.explode.y, -u.explode.z],
      delay: u.delay,
      xray: u.xray,
    });
    g.scale.z = -1;
    for (const child of src.children) g.add(cloneTree(child, id));
    return g;
  }
}

function cloneTree(obj, partId) {
  const c = obj.clone(false);
  if (c.isMesh) c.userData = { ...obj.userData, partId };
  for (const ch of obj.children) c.add(cloneTree(ch, partId));
  return c;
}

/** Add a mesh to a part group (or a sub-object of one). */
export function addMesh(parent, geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  let p = parent;
  while (p && !p.userData?.isPart) p = p.parent;
  m.userData.partId = p?.userData.partId;
  m.userData.baseMaterial = mat;
  parent.add(m);
  return m;
}
