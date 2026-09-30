import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

/*
 * A dark photographic "infinity" studio: the car sits on a satin floor that
 * is lit only by a pool of light around it and fades seamlessly into the
 * background, so there is no visible horizon. The car is grounded by
 *   - a studio environment map (soft-box reflections on the paint),
 *   - spotlights whose pools fall off into darkness,
 *   - blurred contact shadows rendered from beneath the car,
 *   - a faint, blurred floor reflection.
 */

export const STUDIO_BG = 0x000000;

/* ------------------------------------------------------------------ */
/* Environment: black room with a few soft boxes                       */
/* ------------------------------------------------------------------ */

function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const box = new THREE.BoxGeometry(1, 1, 1);

  // dark room so reflections of "nothing" stay deep
  const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x020204, side: THREE.BackSide }));
  room.scale.set(30, 14, 30);
  room.position.y = 6;
  env.add(room);

  // dim floor, so lower surfaces pick up a hint of ground bounce
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x0c0c10) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.99;
  env.add(ground);

  const softbox = (w, h, intensity, pos, lookAt, tint = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(new THREE.Vector3(...lookAt));
    env.add(m);
  };
  // long overhead soft box: the signature highlight running down the car
  softbox(9, 2.4, 14, [0, 5.5, 0], [0, 0, 0]);
  // side strip lights for crisp flank highlights
  softbox(7, 0.5, 10, [0, 1.8, 5.5], [0, 1.2, 0], 0xfaf7f2);
  softbox(7, 0.5, 10, [0, 1.8, -5.5], [0, 1.2, 0], 0xfaf7f2);
  // front/rear kickers, both near-neutral
  softbox(2.5, 1.4, 5, [7, 1.6, 2], [0, 0.4, 0], 0xfff1e0);
  softbox(2.5, 1.4, 4, [-7, 2.2, -2], [0, 0.4, 0], 0xf2eee8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

/* ------------------------------------------------------------------ */
/* Contact shadows (depth from below, blurred)                         */
/* ------------------------------------------------------------------ */

function createContactShadows(renderer, { width = 7.2, depth = 3.6, height = 1.2, res = 1024, blur = 1.6 } = {}) {
  const rtOpts = { type: THREE.HalfFloatType };
  const resY = Math.round((res * depth) / width);
  const rt = new THREE.WebGLRenderTarget(res, resY, rtOpts);
  const rtBlur = new THREE.WebGLRenderTarget(res, resY, rtOpts);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;

  // looks straight up from the floor
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  cam.rotation.x = Math.PI / 2; // screen right = +x, screen up = +z
  cam.updateMatrixWorld();

  // darkness grows with proximity to the floor
  const depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depthMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'float k = 1.0 - fragCoordZ; gl_FragColor = vec4( vec3( 0.0 ), k * k );',
    );
  };
  depthMat.depthTest = depthMat.depthWrite = false;
  depthMat.blending = THREE.CustomBlending;
  depthMat.blendEquation = THREE.MaxEquation;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quadScene.add(quad);
  const blurMat = (def) => new THREE.ShaderMaterial({ ...def, uniforms: THREE.UniformsUtils.clone(def.uniforms) });
  const hBlur = blurMat(HorizontalBlurShader);
  const vBlur = blurMat(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;

  const blurPass = (src, dst, amount) => {
    quad.material = hBlur;
    hBlur.uniforms.tDiffuse.value = src.texture;
    hBlur.uniforms.h.value = amount / res;
    renderer.setRenderTarget(rtBlur);
    renderer.render(quadScene, quadCam);
    quad.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / resY;
    renderer.setRenderTarget(dst);
    renderer.render(quadScene, quadCam);
  };

  return {
    texture: rt.texture,
    size: new THREE.Vector2(width, depth),
    render(scene, hide) {
      const prev = {
        target: renderer.getRenderTarget(),
        bg: scene.background,
        override: scene.overrideMaterial,
        clearColor: renderer.getClearColor(new THREE.Color()),
        clearAlpha: renderer.getClearAlpha(),
        auto: renderer.shadowMap.autoUpdate,
        needs: renderer.shadowMap.needsUpdate,
      };
      const wasVisible = hide.map((o) => o.visible);
      for (const o of hide) o.visible = false;
      scene.background = null;
      scene.overrideMaterial = depthMat;
      // shadows are irrelevant here; leave any pending shadow update to the main pass
      renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = prev.override;
      // two blur iterations: a wide soft penumbra, then a smoothing pass
      blurPass(rt, rt, blur);
      blurPass(rt, rt, blur * 0.45);
      hide.forEach((o, i) => (o.visible = wasVisible[i]));
      scene.background = prev.bg;
      renderer.shadowMap.autoUpdate = prev.auto;
      renderer.shadowMap.needsUpdate = prev.needs;
      renderer.setClearColor(prev.clearColor, prev.clearAlpha);
      renderer.setRenderTarget(prev.target);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Floor                                                              */
/* ------------------------------------------------------------------ */

// The floor reflection is blurred, so it is rendered well below screen resolution
const REFLECTION_SCALE = 0.35;

function createFloor(contact, bg) {
  const reflRes = Math.min(2048, Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 2) * REFLECTION_SCALE));
  const floor = new Reflector(new THREE.CircleGeometry(60, 96), {
    textureWidth: reflRes,
    textureHeight: Math.round((reflRes * window.innerHeight) / window.innerWidth),
    clipBias: 0.002,
    multisample: 0,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  // keep the mirror's texture matrix but draw it with a lit, shadow-receiving material
  const mirrorUniforms = floor.material.uniforms;
  const uniforms = {
    tRefl: { value: floor.getRenderTarget().texture },
    uTexMatrix: mirrorUniforms.textureMatrix,
    tContact: { value: contact.texture },
    uContactSize: { value: contact.size },
    uContactStrength: { value: 0.92 },
    uReflMin: { value: 0.03 },
    uReflMax: { value: 0.2 },
    uBg: { value: new THREE.Color(bg) },
    uFade: { value: new THREE.Vector2(2.6, 8.5) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.05 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uTexMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vFloorPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvReflUv = uTexMatrix * vec4( position, 1.0 );\nvFloorPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRefl; uniform sampler2D tContact;
         uniform vec2 uContactSize; uniform float uContactStrength;
         uniform float uReflMin; uniform float uReflMax;
         uniform vec3 uBg; uniform vec2 uFade;
         varying vec4 vReflUv; varying vec3 vFloorPos;
         vec3 blurredReflection( vec2 uv, float r ) {
           // 12-tap Vogel disc: a glossy, slightly diffused mirror
           vec3 acc = vec3( 0.0 );
           for ( int i = 0; i < 12; i ++ ) {
             float fi = float( i );
             float rr = sqrt( ( fi + 0.5 ) / 12.0 ) * r;
             float th = fi * 2.39996;
             acc += texture2D( tRefl, uv + vec2( cos( th ), sin( th ) ) * rr ).rgb;
           }
           return acc / 12.0;
         }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           vec2 cuv = vFloorPos.xz / uContactSize + 0.5;
           float inside = step( 0.0, cuv.x ) * step( cuv.x, 1.0 ) * step( 0.0, cuv.y ) * step( cuv.y, 1.0 );
           float occ = texture2D( tContact, cuv ).a * inside;
           float contact = 1.0 - clamp( occ * 1.6, 0.0, 1.0 ) * uContactStrength;

           vec2 ruv = vReflUv.xy / vReflUv.w;
           vec3 refl = blurredReflection( ruv, 0.007 );
           float fres = pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 4.0 );
           float rs = mix( uReflMin, uReflMax, fres );

           outgoingLight = outgoingLight * contact + refl * rs * mix( 1.0, contact, 0.5 );

           // elliptical fade (the car is long) into the seamless background
           float r = length( vFloorPos.xz * vec2( 0.62, 1.0 ) );
           float fade = smoothstep( uFade.x, uFade.y, r );
           outgoingLight = mix( outgoingLight, uBg, fade );
         }
         #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'studio-floor';
  floor.material = mat;
  floor.uniforms = uniforms;

  // Only render the reflection for the main beauty pass (not for depth/normal
  // override passes such as the outline or AO), and only when something moved.
  const renderReflection = floor.onBeforeRender;
  const lastCam = new THREE.Matrix4();
  let dirty = true;
  floor.onBeforeRender = function (renderer, scene, camera, ...rest) {
    if (scene.overrideMaterial) return;
    if (!dirty && lastCam.equals(camera.matrixWorld)) return;
    lastCam.copy(camera.matrixWorld);
    dirty = false;
    renderReflection.call(this, renderer, scene, camera, ...rest);
  };
  floor.invalidate = () => (dirty = true);
  floor.resizeReflection = (w, h) => {
    const rw = Math.min(2048, Math.round(w * Math.min(window.devicePixelRatio, 2) * REFLECTION_SCALE));
    floor.getRenderTarget().setSize(rw, Math.round((rw * h) / w));
    dirty = true;
  };
  return floor;
}

/* ------------------------------------------------------------------ */
/* Lights                                                             */
/* ------------------------------------------------------------------ */

function spot(color, intensity, pos, target, { angle = 0.5, penumbra = 1, shadow = false } = {}) {
  const l = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2);
  l.position.set(...pos);
  l.target.position.set(...target);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.camera.near = 3;
    l.shadow.camera.far = 16;
    l.shadow.bias = -0.00012;
    l.shadow.normalBias = 0.015;
    l.shadow.radius = 9;
    l.shadow.focus = 0.9;
  }
  return l;
}

/* ------------------------------------------------------------------ */

export function createStudio(renderer, scene) {
  scene.background = new THREE.Color(STUDIO_BG);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.85;

  const lights = new THREE.Group();
  lights.name = 'studio-lights';
  // overhead key: a soft pool of light that only reaches the car
  const key = spot(0xffffff, 210, [0.6, 8.5, 1.2], [0, 0, 0], { angle: 0.44, penumbra: 0.9, shadow: true });
  // rim / kicker lights to separate the silhouette from the void
  const rimL = spot(0xf4efe8, 120, [-6.5, 3.2, -4.5], [0.2, 0.4, 0], { angle: 0.32, penumbra: 1 });
  const rimR = spot(0xfff0dc, 70, [5.5, 2.4, 5.5], [0, 0.4, 0], { angle: 0.3, penumbra: 1 });
  const front = spot(0xffffff, 45, [7.5, 1.4, -2.5], [0.4, 0.35, 0], { angle: 0.3, penumbra: 1 });
  // underside lights, only lit while the camera is below the floor (kept in the
  // scene at zero intensity so toggling them doesn't recompile materials):
  // an even fill from the ground plus a soft, wide spot for some shape
  const underFill = new THREE.HemisphereLight(0x000000, 0xeae6e0, 0);
  const under = spot(0xffffff, 0, [2.5, -9, 1.5], [0, 0.3, 0], { angle: 0.9, penumbra: 1 });
  for (const l of [key, rimL, rimR, front, under]) lights.add(l, l.target);
  lights.add(underFill);
  scene.add(lights);

  const contact = createContactShadows(renderer);
  const floor = createFloor(contact, STUDIO_BG);
  // an explicit envMap so the floor's own (low) envMapIntensity is honoured;
  // scene.environment would otherwise override it with environmentIntensity
  floor.material.envMap = scene.environment;
  scene.add(floor);

  let contactDirty = true;
  return {
    floor,
    lights: { key, rimL, rimR, front, under },
    contact,
    underside: false,
    /** Hide the floor and light the car from below, for views from underneath. */
    setUnderside(on) {
      this.underside = on;
      floor.visible = !on;
      underFill.intensity = on ? 5 : 0;
      under.intensity = on ? 170 : 0;
    },
    /** Mark the car as changed so shadows and reflections are refreshed. */
    invalidate() {
      contactDirty = true;
      floor.invalidate();
    },
    /** Call once per frame before rendering the main scene. */
    update(hide = []) {
      if (!contactDirty) return;
      contactDirty = false;
      contact.render(scene, [floor, ...hide]);
    },
    setSize(w, h) {
      floor.resizeReflection(w, h);
    },
  };
}
