// TURKEY RUN 3D — world: renderer, lights, ground, scenery, GLB loading.
// Every GLB is loaded ONCE via loadAsync; clones are reused for repeats.
// A failed GLB falls back to a flat-colour primitive so the game never crashes.
//
// PERF (round 2): the renderer is tuned for software rendering (SwiftShader)
// and weak GPUs — pixelRatio capped at 1, no MSAA, 1024 shadow map with a
// tight frustum, and shadows cast ONLY by the heroes + near obstacles.
// Scenery never casts/receives shadows. See buildMesh / setShadowCaster.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.min.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.min.js';
import { STAGES } from './config.js';

// Opt-in shadow casting for a mesh tree (heroes + near obstacles + gate).
// Everything else (scenery, pickups, flame/shadow decals) stays unlit by
// the shadow pass so the shadow map stays small and cheap.
export function setShadowCaster(root, cast = true, receive = false) {
  root.traverse((child) => {
    if (child.isMesh) { child.castShadow = cast; child.receiveShadow = receive; }
  });
}

const ASSET_FILES = {
  turkey: 'assets/turkey.glb',
  farmer: 'assets/farmer.glb',
  fence: 'assets/fence.glb',
  hay: 'assets/hay.glb',
  beam: 'assets/beam.glb',
  knife: 'assets/knife.glb',
  pumpkin: 'assets/pumpkin.glb',
  oven: 'assets/oven.glb',
  pot: 'assets/pot.glb',
  tree: 'assets/tree.glb',
  barnwall: 'assets/barnwall.glb',
  gate: 'assets/gate.glb',
  corn: 'assets/corn.glb',
  feather: 'assets/feather.glb',
  pie: 'assets/pie.glb',
};

const FALLBACK_COLORS = {
  turkey: 0x8a5a2b, farmer: 0xb03030, fence: 0x9a7b4f, hay: 0xd8b545,
  beam: 0x7a5a38, knife: 0xc0c8d0, pumpkin: 0xe07820, oven: 0x505050,
  pot: 0x303030, tree: 0x3f7a35, barnwall: 0xa03a2a, gate: 0x5a7a3a,
  corn: 0xf0c020, feather: 0xf5d76e, pie: 0xc08040,
};

// Rough primitive stand-ins, sized to the real GLB footprints.
function fallbackMesh(name) {
  const color = FALLBACK_COLORS[name] || 0x888888;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  let mesh;
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  switch (name) {
    case 'turkey': {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat);
      body.position.y = 0.6; body.scale.set(1, 1.1, 1.2);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
      head.position.set(0, 1.05, 0.35);
      mesh.add(body, head);
      break;
    }
    case 'farmer': {
      mesh = new THREE.Group();
      const body = box(0.6, 1.1, 0.35); body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
      head.position.y = 1.75;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.12, 8), mat);
      hat.position.y = 1.95;
      mesh.add(body, head, hat);
      break;
    }
    case 'tree': {
      mesh = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }));
      trunk.position.y = 0.4;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 8), mat);
      top.position.y = 1.4;
      mesh.add(trunk, top);
      break;
    }
    case '__flame': {
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 8), flameMat);
      break;
    }
    case '__shadow': {
      const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });
      mesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), shMat);
      mesh.rotation.x = -Math.PI / 2;
      break;
    }
    case 'fence': mesh = box(1.94, 1.22, 0.14); mesh.position.y = 0.61; break;
    case 'hay': mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 10), mat); mesh.rotation.z = Math.PI / 2; mesh.position.y = 0.45; break;
    case 'beam': mesh = box(1.64, 0.55, 0.39); break;
    case 'knife': mesh = box(0.16, 0.16, 1.65); break;
    case 'pumpkin': mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat); mesh.position.y = 0.32; break;
    case 'oven': mesh = box(1.04, 1.24, 0.77); mesh.position.y = 0.62; break;
    case 'pot': mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.43, 10), mat); mesh.position.y = 0.22; break;
    case 'barnwall': mesh = box(4.3, 3.03, 0.4); mesh.position.y = 1.5; break;
    case 'gate': mesh = box(2.8, 3.25, 0.6); mesh.position.y = 1.6; break;
    case 'corn': mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), mat); mesh.rotation.z = Math.PI / 2; mesh.position.y = 0; break;
    case 'feather': mesh = box(0.2, 0.45, 0.04); break;
    case 'pie': mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), mat); break;
    default: mesh = box(1, 1, 1); mesh.position.y = 0.5;
  }
  mesh.traverse((child) => {
    if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
  });
  return mesh;
}

const FLOWER_COLORS = [0xff6fa5, 0xffd23e, 0xffffff, 0xff8a3c, 0xb678e0];

// PERF (round 2): static scenery is drawn as InstancedMesh pools — one draw
// call per kind instead of one per prop (~98 groups -> ~10 meshes). The
// geometry for each kind is merged ONCE (GLB child parts baked with their
// local matrices, or primitive parts merged) and shared by all instances;
// per-item position/rotation/scale lives in the instance matrix, which is
// rewritten as the scenery scrolls. Flowers keep per-instance colour via
// setColorAt on the head pool (stem pool stays shared green).
function xformGeo(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  );
  geo.applyMatrix4(m);
  return geo;
}

// Merge a loaded GLB template into ONE geometry (one group per child mesh
// so the original materials survive as a material array) for instancing.
function mergeTemplateGeometry(root) {
  root.updateMatrixWorld(true);
  const geos = [];
  const mats = [];
  root.traverse((child) => {
    if (!child.isMesh) return;
    const g = child.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const flat = g.index ? g.toNonIndexed() : g;
    flat.applyMatrix4(child.matrixWorld);
    geos.push(flat);
    mats.push(child.material);
  });
  return { geometry: mergeGeometries(geos, true), materials: mats };
}

function mergeParts(parts) {
  return mergeGeometries(parts.map(({ geo, ...t }) => xformGeo(geo, t)), false);
}

// Primitive scenery geometries (baked part transforms, one per kind).
const BUSH_GEO = xformGeo(new THREE.IcosahedronGeometry(0.55, 0), { p: [0, 0.35, 0], s: [1.2, 0.75, 1] });
const BUSH_MAT = new THREE.MeshStandardMaterial({ color: 0x4a7a35, roughness: 1, flatShading: true });
const FLOWER_STEM_GEO = xformGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), { p: [0, 0.15, 0] });
const STEM_MAT = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1 });
const FLOWER_HEAD_GEO = xformGeo(new THREE.IcosahedronGeometry(0.09, 0), { p: [0, 0.34, 0] });
// White base: the per-flower colour comes from the instance colour.
const FLOWER_HEAD_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
const CLOUD_GEO = mergeParts([
  { geo: new THREE.SphereGeometry(1.6, 8, 6), p: [0, 0, 0], s: [1, 0.55, 1] },
  { geo: new THREE.SphereGeometry(1.1, 8, 6), p: [-1.4, -0.2, 0.2], s: [1, 0.55, 1] },
  { geo: new THREE.SphereGeometry(1.2, 8, 6), p: [1.4, -0.25, -0.1], s: [1, 0.55, 1] },
  { geo: new THREE.SphereGeometry(1.0, 8, 6), p: [0.4, 0.5, 0], s: [1, 0.55, 1] },
]);
const CLOUD_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
const BIRD_GEO = mergeParts([
  { geo: new THREE.BoxGeometry(0.85, 0.03, 0.16), r: [0, 0, -0.45], p: [-0.4, 0, 0] },
  { geo: new THREE.BoxGeometry(0.85, 0.03, 0.16), r: [0, 0, 0.45], p: [0.4, 0, 0] },
]);
const BIRD_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 });

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7da05c';
  ctx.fillRect(0, 0, 256, 256);
  // Dirt path down the middle + speckles.
  ctx.fillStyle = '#a08050';
  ctx.fillRect(48, 0, 160, 256);
  ctx.fillStyle = '#8a6f42';
  for (let i = 0; i < 90; i++) {
    const x = 48 + Math.random() * 160;
    const y = Math.random() * 256;
    ctx.fillRect(x, y, 3, 3);
  }
  ctx.fillStyle = '#6a8a4a';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(Math.random() * 48, Math.random() * 256, 4, 2);
    ctx.fillRect(208 + Math.random() * 48, Math.random() * 256, 4, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    // PERF: never render above 1x — HiDPI (dpr 2-3) would rasterise 4-9x
    // the fragments for no readable gain on flat low-poly art.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.renderer.shadowMap.enabled = true;
    // PCF kept: BasicShadowMap measured the same fps (3.1 vs 3.0, noise)
    // and its hard shadow edges look worse on the low-poly art.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGES[0].sky);
    this.scene.fog = new THREE.Fog(STAGES[0].fogColor, STAGES[0].fogNear, STAGES[0].fogFar);

    // PERF: far plane 260 -> 200 (ground ends at z=180, fog hides past ~120).
    this.camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 200);

    this.hemi = new THREE.HemisphereLight(STAGES[0].hemiSky, STAGES[0].hemiGround, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(STAGES[0].sun, STAGES[0].sunIntensity);
    this.sun.castShadow = true;
    // PERF: 2048 -> 1024 shadow map, frustum tightened to the play area
    // (turkey z=0, farmer z=-14..0, near obstacles z<30). Distant scenery
    // and far obstacles are outside it and skip the shadow pass entirely.
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -14;
    this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -14;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Warm kitchen point light, dim until the KITCHEN stage.
    this.ovenLight = new THREE.PointLight(0xff8a2a, 0, 26, 1.6);
    this.ovenLight.position.set(0, 3, 20);
    this.scene.add(this.ovenLight);
    // Gate rim/fill light (round 2): NOT in the scene until placed — a
    // point light present in the scene costs a shader slot even at
    // intensity 0, so it is added only near the gate / in the escaped shot.
    // Warm, camera-side, so the turkey reads against the dark kitchen
    // instead of going full silhouette inside the arch.
    this.gateLight = new THREE.PointLight(0xffd9a0, 0, 26, 1.6);
    // Celebration fill light (round 4): same add-only-when-lit pattern as
    // the gate light. Warm gold, placed on the CAMERA side of the turkey
    // during the escaped moment only, so the turkey's camera-facing side
    // (brown + cream) reads instead of going black silhouette in the
    // night kitchen. Off (removed from the scene) everywhere else.
    this.celebrationLight = new THREE.PointLight(0xffd9a0, 0, 30, 1.6);

    this.groundTex = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 220),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 70);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Lane divider strips (static; the ground texture scrolls instead).
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
    this.laneStrips = [];
    for (const x of [-1.1, 1.1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 220), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.02, 70);
      this.scene.add(strip);
      this.laneStrips.push(strip);
    }

    this.templates = {};
    this.scenery = [];
    this.clouds = [];
    this.birds = [];
    this.sceneryRng = null;
    // Instanced scenery pools (built once, see _buildInstancedPools) and
    // reusable temps for instance-matrix writes.
    this._inst = null;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 1280;
    const h = this.canvas.clientHeight || 720;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async loadAssets(onProgress) {
    const loader = new GLTFLoader();
    const names = Object.keys(ASSET_FILES);
    let done = 0;
    for (const name of names) {
      try {
        const gltf = await loader.loadAsync(ASSET_FILES[name]);
        const root = gltf.scene;
        // PERF: templates carry NO shadow flags — castShadow is opted in
        // per use (heroes, near obstacles, gate) via setShadowCaster.
        this.templates[name] = root;
      } catch (err) {
        this.templates[name] = fallbackMesh(name);
      }
      done++;
      if (typeof onProgress === 'function') onProgress(done / names.length);
    }
  }

  // Clone a loaded template (one GLB load, many instances). Primitives for
  // flame / shadow are built fresh, never from a GLB. Clones carry NO
  // shadow flags — callers opt in via setShadowCaster (heroes, obstacles,
  // gate); scenery and pickups never cast, which keeps the shadow pass
  // to a handful of meshes.
  buildMesh(name) {
    if (name === '__flame') return fallbackMesh('__flame');
    if (name === '__shadow') return fallbackMesh('__shadow');
    const template = this.templates[name];
    if (!template) return fallbackMesh(name);
    return template.clone(true);
  }

  // Gate rim/fill light. intensity 0 (or less) removes it from the scene
  // so it costs nothing when the gate is far away; otherwise it is placed
  // at (x, y, z) — 2 m on the camera side of the gate plane, above the
  // turkey — and added to the scene.
  setGateLight(x, y, z, intensity) {
    if (!intensity || intensity <= 0) {
      if (this.gateLight.parent) this.scene.remove(this.gateLight);
      this.gateLight.intensity = 0;
      return;
    }
    this.gateLight.position.set(x, y, z);
    this.gateLight.intensity = intensity;
    if (!this.gateLight.parent) this.scene.add(this.gateLight);
  }

  // Celebration fill light (round 4): same pattern as setGateLight —
  // intensity 0 (or less) removes it from the scene so it costs nothing
  // outside the escaped moment; otherwise it is placed at (x, y, z) and
  // added to the scene.
  setCelebrationLight(x, y, z, intensity) {
    if (!intensity || intensity <= 0) {
      if (this.celebrationLight.parent) this.scene.remove(this.celebrationLight);
      this.celebrationLight.intensity = 0;
      return;
    }
    this.celebrationLight.position.set(x, y, z);
    this.celebrationLight.intensity = intensity;
    if (!this.celebrationLight.parent) this.scene.add(this.celebrationLight);
  }

  applyStage(stage) {
    this.scene.background.set(stage.sky);
    this.scene.fog.color.set(stage.fogColor);
    this.scene.fog.near = stage.fogNear;
    this.scene.fog.far = stage.fogFar;
    this.hemi.color.set(stage.hemiSky);
    this.hemi.groundColor.set(stage.hemiGround);
    this.sun.color.set(stage.sun);
    this.sun.intensity = stage.sunIntensity;
    this.ground.material.map = this.groundTex;
    // The ground texture already carries the base green; tint it toward the
    // stage colour (lerped to white so map x colour does not go muddy dark).
    this.ground.material.color.set(stage.ground).lerp(new THREE.Color(0xffffff), 0.55);
    this.ovenLight.intensity = stage.index === 2 ? 60 : 0;
  }

  // Build the instanced scenery pools once: one InstancedMesh per kind
  // (GLB kinds merged from their template, primitives from the baked
  // geometries above). Counts match the item loops in initScenery.
  // Instanced meshes span the whole 120 m strip, so frustum culling is
  // off — the base geometry's bounding sphere cannot cover the spread.
  _buildInstancedPools() {
    this._inst = {};
    const mk = (key, geometry, materials, count) => {
      const mesh = new THREE.InstancedMesh(geometry, materials, count);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this._inst[key] = mesh;
      return mesh;
    };
    const glb = (name, count) => {
      const { geometry, materials } = mergeTemplateGeometry(this.templates[name]);
      return mk(name, geometry, materials, count);
    };
    glb('fence', 24);
    glb('tree', 18);
    glb('barnwall', 4);
    glb('hay', 8);
    glb('pumpkin', 8);
    mk('bush', BUSH_GEO, BUSH_MAT, 12);
    mk('flowerStem', FLOWER_STEM_GEO, STEM_MAT, 24);
    const head = mk('flowerHead', FLOWER_HEAD_GEO, FLOWER_HEAD_MAT, 24);
    // Pre-allocate the instance-colour buffer; initScenery tints per item.
    for (let i = 0; i < 24; i++) head.setColorAt(i, this._c.set(0xffffff));
    mk('cloud', CLOUD_GEO, CLOUD_MAT, 6);
    mk('bird', BIRD_GEO, BIRD_MAT, 4);
  }

  // Pool for a scenery kind ('fenceLine' items use the 'fence' pool;
  // flowers write to the stem pool, heads separately).
  _poolFor(kind) {
    if (kind === 'fenceLine') return this._inst.fence;
    if (kind === 'flower') return this._inst.flowerStem;
    return this._inst[kind];
  }

  _writeSceneryMatrix(item) {
    this._m4.compose(
      this._v.set(item.x, item.y, item.z),
      this._q.setFromEuler(this._e.set(0, item.rotY, 0)),
      this._s.set(item.sx, item.sy, item.sz),
    );
    const pool = this._poolFor(item.kind);
    pool.setMatrixAt(item.slot, this._m4);
    pool.instanceMatrix.needsUpdate = true;
    if (item.kind === 'flower') {
      const head = this._inst.flowerHead;
      head.setMatrixAt(item.slot, this._m4);
      head.instanceMatrix.needsUpdate = true;
    }
  }

  _writeCloudMatrix(c) {
    this._m4.compose(
      this._v.set(c.x, c.y, c.z),
      this._q.identity(),
      this._s.setScalar(c.s),
    );
    const pool = this._inst.cloud;
    pool.setMatrixAt(c.slot, this._m4);
    pool.instanceMatrix.needsUpdate = true;
  }

  _writeBirdMatrix(b) {
    this._m4.compose(
      this._v.set(b.x, b.y, b.z),
      this._q.identity(),
      this._s.setScalar(1),
    );
    const pool = this._inst.bird;
    pool.setMatrixAt(b.slot, this._m4);
    pool.instanceMatrix.needsUpdate = true;
  }

  // Scenery pool: a lived-in farmyard edge — fence lines, trees, distant
  // barns, hay bales, pumpkins, bushes and flowers — recycled from ahead
  // to behind. Nothing is placed on the lanes (|x| < 3.6 stays clear) so
  // props never hide an obstacle or block the turkey.
  // Items are DATA now (one entry per prop); the visible meshes are the
  // instanced pools, rewritten from the item state each frame.
  initScenery(rng) {
    this.sceneryRng = rng;
    if (!this._inst) this._buildInstancedPools();
    this.scenery = [];
    this.clouds = [];
    this.birds = [];
    const slots = {};
    const nextSlot = (kind) => {
      const s = slots[kind] || 0;
      slots[kind] = s + 1;
      return s;
    };

    const add = (kind, x, z, opts = {}) => {
      const item = {
        kind,
        slot: nextSlot(kind),
        x, z, y: opts.y || 0,
        rotY: opts.rotY !== undefined ? opts.rotY : rng() * Math.PI * 2,
        sx: opts.sx !== undefined ? opts.sx : (opts.scale || 1),
        sy: opts.sy !== undefined ? opts.sy : (opts.scale || 1),
        sz: opts.sz !== undefined ? opts.sz : (opts.scale || 1),
        fixedX: !!opts.fixedX,
        xMin: opts.xMin !== undefined ? opts.xMin : Math.abs(x),
        xMax: opts.xMax !== undefined ? opts.xMax : Math.abs(x),
      };
      this.scenery.push(item);
      if (kind === 'flower') {
        const color = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)];
        this._inst.flowerHead.setColorAt(item.slot, this._c.set(color));
        this._inst.flowerHead.instanceColor.needsUpdate = true;
      }
      this._writeSceneryMatrix(item);
      return item;
    };

    // Fence lines along both track edges (fence GLB runs along X, so it is
    // rotated to run along Z and stretched to ~7.8 m per segment).
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('fenceLine', side * 4.3, 82 - Math.floor(i / 2) * 10 - rng() * 1.5,
        { fixedX: true, rotY: Math.PI / 2, sx: 4 });
    }
    // Trees, near and far.
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('tree', side * (6 + rng() * 6), 85 - i * 5.7 - rng() * 3,
        { scale: 0.9 + rng() * 0.8, xMin: 6, xMax: 12 });
    }
    // Distant barns: kept inside the 26 m ground plane (|x| + half-width ≤ 13)
    // and at least 30 m ahead — a barn any closer looms over the track like
    // a billboard instead of reading as a barn in the distance.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // rotY π: the barn front (door + gable) faces the track/camera instead
      // of a random edge-on angle that reads as a red silo.
      add('barnwall', side * (9.5 + rng() * 1.5), 30 + i * 18 + rng() * 5,
        { scale: 1.2 + rng() * 0.2, xMin: 9.5, xMax: 11, rotY: Math.PI });
    }
    // Hay bales and pumpkins scattered just off the track.
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('hay', side * (4.8 + rng() * 3.2), 80 - i * 12 - rng() * 4,
        { scale: 0.9 + rng() * 0.3, xMin: 4.8, xMax: 8 });
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('pumpkin', side * (4.2 + rng() * 2.8), 74 - i * 12 - rng() * 4,
        { scale: 0.9 + rng() * 0.4, xMin: 4.2, xMax: 7 });
    }
    // Bushes and flowers hug the track edge.
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('bush', side * (3.9 + rng() * 3.1), 83 - i * 8.5 - rng() * 3,
        { scale: 0.7 + rng() * 0.5, xMin: 3.9, xMax: 7 });
    }
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('flower', side * (3.7 + rng() * 2.3), 84 - i * 4.3 - rng() * 2,
        { scale: 0.8 + rng() * 0.4, xMin: 3.7, xMax: 6 });
    }
    // Clouds high up and birds crossing the sky (separate pools: they
    // drift on their own parallax instead of scrolling with the ground).
    for (let i = 0; i < 6; i++) {
      const c = {
        slot: i,
        x: (rng() < 0.5 ? -1 : 1) * (8 + rng() * 20),
        y: 16 + rng() * 8,
        z: -10 + i * 17 + rng() * 6,
        s: 1.6 + rng() * 1.6,
        vx: (rng() - 0.5) * 0.6,
      };
      this.clouds.push(c);
      this._writeCloudMatrix(c);
    }
    for (let i = 0; i < 4; i++) {
      const b = {
        slot: i,
        x: (rng() < 0.5 ? -1 : 1) * (5 + rng() * 15),
        y: 9 + rng() * 5,
        z: 10 + i * 18 + rng() * 8,
        vx: (rng() < 0.5 ? -1 : 1) * (1 + rng()),
      };
      this.birds.push(b);
      this._writeBirdMatrix(b);
    }
  }

  updateScenery(dt, speed) {
    const dz = speed * dt;
    for (const item of this.scenery) {
      item.z -= dz;
      if (item.z < -18) {
        item.z += 120;
        // Fence lines keep their x (they are the track edge); everything
        // else re-scatters to a fresh spot in its own band.
        if (!item.fixedX) {
          const side = this.sceneryRng() < 0.5 ? -1 : 1;
          item.x = side * (item.xMin + this.sceneryRng() * (item.xMax - item.xMin));
        }
      }
      this._writeSceneryMatrix(item);
    }
    // Clouds drift slowly (parallax, not ground speed) and birds cross.
    for (const c of this.clouds) {
      c.z -= dz * 0.12;
      c.x += c.vx * dt;
      if (c.z < -20) {
        c.z += 130;
        c.x = (this.sceneryRng() < 0.5 ? -1 : 1) * (8 + this.sceneryRng() * 20);
      }
      if (c.x > 32) c.x = -32;
      if (c.x < -32) c.x = 32;
      this._writeCloudMatrix(c);
    }
    for (const b of this.birds) {
      b.z -= dz * 0.5;
      b.x += b.vx * dt;
      if (b.z < -10) {
        b.z += 100;
        b.x = (this.sceneryRng() < 0.5 ? -1 : 1) * (5 + this.sceneryRng() * 15);
      }
      if (Math.abs(b.x) > 26) b.vx = -b.vx;
      this._writeBirdMatrix(b);
    }
    // Scroll the ground texture so the dirt reads as forward motion.
    this.groundTex.offset.y -= (dz / 220) * 24;
    // Sun shadow camera follows the player (turkey stays near z = 0).
    this.sun.position.set(6, 18, 8);
    this.sun.target.position.set(0, 0, 6);
    this.sun.target.updateMatrixWorld();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
