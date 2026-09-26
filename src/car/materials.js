import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Procedural textures                                                */
/* ------------------------------------------------------------------ */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

/** 2x2 twill carbon weave. Returns { map, rough, bump }. */
function carbonTextures() {
  const size = 512;
  const cells = 16;
  const cs = size / cells;
  const [c, g] = canvas(size);
  const [cb, gb] = canvas(size);
  g.fillStyle = '#0c0c0e';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      // twill: orientation shifts by one cell each row
      const horizontal = Math.floor((i + j) / 2) % 2 === 0;
      const x = i * cs;
      const y = j * cs;
      const grad = horizontal ? g.createLinearGradient(x, y, x, y + cs) : g.createLinearGradient(x, y, x + cs, y);
      grad.addColorStop(0, '#0d0d10');
      grad.addColorStop(0.5, '#2a2b30');
      grad.addColorStop(1, '#0d0d10');
      g.fillStyle = grad;
      g.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      const gg = horizontal ? gb.createLinearGradient(x, y, x, y + cs) : gb.createLinearGradient(x, y, x + cs, y);
      gg.addColorStop(0, '#303030');
      gg.addColorStop(0.5, '#f0f0f0');
      gg.addColorStop(1, '#303030');
      gb.fillStyle = gg;
      gb.fillRect(x, y, cs, cs);
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(cb);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(9, 9);
    t.anisotropy = 8;
  }
  return { map, bump };
}

/** Radiator core: fine fins. */
function finTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#6e7278';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 4) {
    g.fillStyle = x % 8 === 0 ? '#9aa0a8' : '#3a3d42';
    g.fillRect(x, 0, 2, 256);
  }
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = '#2a2c30';
    g.fillRect(0, y, 256, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 3);
  return t;
}

/** Brake disc edge: rows of tiny ventilation holes. */
function discEdgeTexture() {
  const [c, g] = canvas(1024);
  g.fillStyle = '#26272a';
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#060606';
  const rows = 6;
  const perRow = 64;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const x = (i + (r % 2) * 0.5) * (1024 / perRow);
      const y = (r + 0.5) * (1024 / rows);
      g.beginPath();
      g.ellipse(x, y, 5, 26, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

/** Heat-tinted exhaust metal (straw → bronze → blue). */
function heatTintTexture() {
  const [c, g] = canvas(256);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#b8a27a');
  grad.addColorStop(0.3, '#a0703a');
  grad.addColorStop(0.55, '#6b4a6e');
  grad.addColorStop(0.8, '#3c4f86');
  grad.addColorStop(1, '#8c8f96');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Crinkled gold heat-shield foil. */
function foilTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 90 + Math.random() * 120;
    g.fillStyle = `rgb(${v},${v},${v})`;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** Plank: laminated wood-composite grain. */
function plankTexture() {
  const [c, g] = canvas(512);
  g.fillStyle = '#9c7a4f';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) {
    const v = Math.random() * 30 - 15;
    g.fillStyle = `rgba(${90 + v},${62 + v},${34 + v},0.35)`;
    g.fillRect(0, y, 512, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/* ------------------------------------------------------------------ */
/* Livery material                                                    */
/* ------------------------------------------------------------------ */

// The livery colour is computed in the fragment shader from the car-space
// position of each fragment, so the paint scheme is continuous across
// separate body panels (nose, tub, sidepods, engine cover) and can be
// recoloured live via uniforms. Geometry is authored in car space, so
// the object-space position equals the assembled car-space position.
export const liveryUniforms = {
  uPrimary: { value: new THREE.Color('#e9ebef') },
  uAccent: { value: new THREE.Color('#00a7b5') },
  uDark: { value: new THREE.Color('#141518') },
};

function makeLiveryMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.15,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    side: THREE.DoubleSide,
  });
  mat.userData.livery = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, liveryUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLivPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLivPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLivPos;
         uniform vec3 uPrimary; uniform vec3 uAccent; uniform vec3 uDark;
         vec3 liveryColor(vec3 p, vec3 n) {
           float z = abs(p.z);
           vec3 col = uPrimary;
           float noseTip = smoothstep(2.40, 2.41, p.x);
           // dark lower body line, sweeping up toward the rear; dark undersides
           float lower = 0.30 + 0.035 * (p.x - 0.4);
           float dark = (1.0 - smoothstep(lower - 0.004, lower + 0.004, p.y)) * (1.0 - smoothstep(1.7, 1.8, p.x));
           dark = max(dark, 1.0 - smoothstep(-0.7, -0.45, n.y));
           // accent swoosh along the flanks (side-facing surfaces only)
           float band = 0.47 + 0.10 * (p.x - 0.2) - 0.03 * sin(p.x * 1.6);
           float accent = smoothstep(band - 0.004, band, p.y) * (1.0 - smoothstep(band + 0.034, band + 0.038, p.y));
           accent *= step(-1.3, p.x) * step(p.x, 1.2) * step(0.14, z);
           accent *= smoothstep(0.45, 0.7, abs(n.z));
           accent = max(accent, noseTip);
           col = mix(col, uAccent, accent);
           col = mix(col, uDark, dark * (1.0 - noseTip));
           return col;
         }`
      )
      // applied after the normal is known; convert the (face-corrected) view-space
      // normal back to car space so livery rules work regardless of winding
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n diffuseColor.rgb *= liveryColor(vLivPos, normalize(transpose(mat3(viewMatrix)) * normal));');
  };
  mat.customProgramCacheKey = () => 'livery';
  return mat;
}

/* ------------------------------------------------------------------ */
/* Material library                                                   */
/* ------------------------------------------------------------------ */

export function createMaterials() {
  const carbonTex = carbonTextures();

  const carbon = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: carbonTex.map,
    bumpMap: carbonTex.bump,
    bumpScale: 0.35,
    metalness: 0.2,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
  const carbonMatte = carbon.clone();
  carbonMatte.clearcoat = 0.15;
  carbonMatte.roughness = 0.6;

  const m = {
    livery: makeLiveryMaterial(),
    carbon,
    carbonMatte,
    satinBlack: new THREE.MeshPhysicalMaterial({ color: 0x0f1012, roughness: 0.45, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    inlet: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, side: THREE.DoubleSide }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x1b1b1d, roughness: 0.82, metalness: 0, sheen: 0.3, sheenColor: new THREE.Color(0x333333), side: THREE.DoubleSide }),
    tread: new THREE.MeshPhysicalMaterial({ color: 0x202022, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.85, clearcoat: 0.5, side: THREE.DoubleSide }),
    titanium: new THREE.MeshPhysicalMaterial({ color: 0x9a9ca2, roughness: 0.3, metalness: 1, side: THREE.DoubleSide }),
    aluminium: new THREE.MeshPhysicalMaterial({ color: 0xc4c8ce, roughness: 0.28, metalness: 1, side: THREE.DoubleSide }),
    magnesium: new THREE.MeshPhysicalMaterial({ color: 0x55585e, roughness: 0.45, metalness: 0.9, side: THREE.DoubleSide }),
    steel: new THREE.MeshPhysicalMaterial({ color: 0x7c8088, roughness: 0.25, metalness: 1, side: THREE.DoubleSide }),
    engineBlack: new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
    camCover: new THREE.MeshPhysicalMaterial({ color: 0x8b1a1a, roughness: 0.35, metalness: 0.5, clearcoat: 0.8, side: THREE.DoubleSide }),
    exhaust: new THREE.MeshPhysicalMaterial({ map: heatTintTexture(), roughness: 0.3, metalness: 1, side: THREE.DoubleSide }),
    foil: new THREE.MeshPhysicalMaterial({ color: 0xd9a93a, roughness: 0.25, metalness: 1, bumpMap: foilTexture(), bumpScale: 1.2, side: THREE.DoubleSide }),
    discCarbon: new THREE.MeshStandardMaterial({ color: 0x2b2c2f, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
    discEdge: new THREE.MeshStandardMaterial({ map: discEdgeTexture(), roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0x3b3e44, roughness: 0.3, metalness: 0.8, clearcoat: 0.5, side: THREE.DoubleSide }),
    radiator: new THREE.MeshStandardMaterial({ map: finTexture(), roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide }),
    plank: new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.75, metalness: 0, side: THREE.DoubleSide }),
    battery: new THREE.MeshPhysicalMaterial({ color: 0x23262b, roughness: 0.4, metalness: 0.5, clearcoat: 0.4, side: THREE.DoubleSide }),
    hv: new THREE.MeshPhysicalMaterial({ color: 0xff6a00, roughness: 0.45, metalness: 0, clearcoat: 0.3, side: THREE.DoubleSide }),
    fuelCell: new THREE.MeshPhysicalMaterial({ color: 0x2a2620, roughness: 0.75, metalness: 0, clearcoat: 0.2, side: THREE.DoubleSide }),
    electronics: new THREE.MeshPhysicalMaterial({ color: 0x3a3f47, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide }),
    mirror: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1, side: THREE.DoubleSide }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0a0c14, roughness: 0.05, metalness: 0.9, clearcoat: 1, side: THREE.DoubleSide }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.25, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide }),
    helmetAccent: new THREE.MeshPhysicalMaterial({ color: 0x00a7b5, roughness: 0.25, metalness: 0.3, clearcoat: 1, side: THREE.DoubleSide }),
    suit: new THREE.MeshPhysicalMaterial({ color: 0x2b2f36, roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color(0x667080), side: THREE.DoubleSide }),
    padding: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.95, side: THREE.DoubleSide }),
    lightRed: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1020, emissiveIntensity: 2.2, roughness: 0.3 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x1a2a3a, emissiveIntensity: 0.6, roughness: 0.2 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x20ff60, emissiveIntensity: 2 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2030, emissiveIntensity: 2 }),
    ledBlue: new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x3070ff, emissiveIntensity: 2 }),
    tcam: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0c, roughness: 0.4, clearcoat: 1, side: THREE.DoubleSide }),
    compound: new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.6, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.5, clearcoat: 1 }),
  };
  return m;
}
