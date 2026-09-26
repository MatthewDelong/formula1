import * as THREE from 'three';
import { PartRegistry } from './registry.js';
import { createMaterials } from './materials.js';
import { buildChassis, buildBodywork } from './body.js';
import { buildFrontWing, buildRearWing, buildFloor } from './aero.js';
import { buildCorners } from './corners.js';
import { buildPowerUnit, buildInternals } from './internals.js';
import { buildCockpit } from './cockpit.js';

/**
 * Build the complete car. Returns the root group, the part registry, the
 * material library and handles to animated sub-assemblies.
 */
export function buildCar() {
  const M = createMaterials();
  const root = new THREE.Group();
  root.name = 'car';
  const reg = new PartRegistry(root);

  buildChassis(reg, M);
  buildBodywork(reg, M);
  const frontWing = buildFrontWing(reg, M);
  const rearWing = buildRearWing(reg, M);
  buildFloor(reg, M);
  buildCorners(reg, M);
  buildPowerUnit(reg, M);
  buildInternals(reg, M);
  buildCockpit(reg, M);

  // make sure every mesh knows which part it belongs to
  for (const [id, g] of reg.parts) {
    g.traverse((o) => {
      if (o.isMesh) {
        o.userData.partId = id;
        o.userData.baseMaterial ??= o.material;
      }
    });
  }

  return { root, reg, M, aero: { frontWing, rearWing } };
}
