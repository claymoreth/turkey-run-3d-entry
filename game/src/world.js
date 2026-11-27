// TURKEY RUN 3D — world: renderer, lights, ground, scenery, GLB loading.
// Every GLB is loaded ONCE via loadAsync; clones are reused for repeats.
// A failed GLB falls back to a flat-colour primitive so the game never crashes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STAGES } from './config.js';

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
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  return mesh;
}

const FLOWER_COLORS = [0xff6fa5, 0xffd23e, 0xffffff, 0xff8a3c, 0xb678e0];

// Cheap primitive props (no GLB exists for these): a squashy bush, a tiny
// flower on a stem, a puffy cloud, a V-shaped bird silhouette.
function makeBushMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a7a35, roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat);
  blob.scale.set(1.2, 0.75, 1);
  blob.position.y = 0.35;
  blob.castShadow = true;
  blob.receiveShadow = true;
  group.add(blob);
  return group;
}

function makeFlowerMesh(color) {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), stemMat);
  stem.position.y = 0.15;
  const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), headMat);
  head.position.y = 0.34;
  group.add(stem, head);
  return group;
}

function makeCloudMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const puffs = [[0, 0, 0, 1.6], [-1.4, -0.2, 0.2, 1.1], [1.4, -0.25, -0.1, 1.2], [0.4, 0.5, 0, 1.0]];
  for (const [x, y, z, r] of puffs) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    puff.position.set(x, y, z);
    puff.scale.y = 0.55;
    group.add(puff);
  }
  return group;
}

function makeBirdMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 });
  const group = new THREE.Group();
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.16), mat);
    wing.position.x = s * 0.4;
    wing.rotation.z = s * 0.45;
    group.add(wing);
  }
  return group;
}

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGES[0].sky);
    this.scene.fog = new THREE.Fog(STAGES[0].fogColor, STAGES[0].fogNear, STAGES[0].fogFar);

    this.camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 260);

    this.hemi = new THREE.HemisphereLight(STAGES[0].hemiSky, STAGES[0].hemiGround, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(STAGES[0].sun, STAGES[0].sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -20;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Warm kitchen point light, dim until the KITCHEN stage.
    this.ovenLight = new THREE.PointLight(0xff8a2a, 0, 26, 1.6);
    this.ovenLight.position.set(0, 3, 20);
    this.scene.add(this.ovenLight);

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
        root.traverse((child) => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        this.templates[name] = root;
      } catch (err) {
        this.templates[name] = fallbackMesh(name);
      }
      done++;
      if (typeof onProgress === 'function') onProgress(done / names.length);
    }
  }

  // Clone a loaded template (one GLB load, many instances). Primitives for
  // flame / shadow are built fresh, never from a GLB.
  buildMesh(name) {
    if (name === '__flame') return fallbackMesh('__flame');
    if (name === '__shadow') return fallbackMesh('__shadow');
    const template = this.templates[name];
    if (!template) return fallbackMesh(name);
    const clone = template.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return clone;
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

  // Scenery pool: a lived-in farmyard edge — fence lines, trees, distant
  // barns, hay bales, pumpkins, bushes and flowers — recycled from ahead
  // to behind. Nothing is placed on the lanes (|x| < 3.6 stays clear) so
  // props never hide an obstacle or block the turkey.
  initScenery(rng) {
    this.sceneryRng = rng;
    for (const item of this.scenery) this.scene.remove(item.mesh);
    this.scenery = [];
    for (const c of this.clouds) this.scene.remove(c.mesh);
    this.clouds = [];
    for (const b of this.birds) this.scene.remove(b.mesh);
    this.birds = [];

    const add = (kind, mesh, x, z, opts = {}) => {
      mesh.position.set(x, opts.y || 0, z);
      mesh.rotation.y = opts.rotY !== undefined ? opts.rotY : rng() * Math.PI * 2;
      const s = opts.scale || 1;
      mesh.scale.set(opts.sx !== undefined ? opts.sx : s, opts.sy !== undefined ? opts.sy : s, opts.sz !== undefined ? opts.sz : s);
      this.scene.add(mesh);
      this.scenery.push({
        mesh, kind, fixedX: !!opts.fixedX,
        xMin: opts.xMin !== undefined ? opts.xMin : Math.abs(x),
        xMax: opts.xMax !== undefined ? opts.xMax : Math.abs(x),
      });
    };

    // Fence lines along both track edges (fence GLB runs along X, so it is
    // rotated to run along Z and stretched to ~7.8 m per segment).
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mesh = this.buildMesh('fence');
      add('fenceLine', mesh, side * 4.3, 82 - Math.floor(i / 2) * 10 - rng() * 1.5,
        { fixedX: true, rotY: Math.PI / 2, sx: 4 });
    }
    // Trees, near and far.
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('tree', this.buildMesh('tree'), side * (6 + rng() * 6), 85 - i * 5.7 - rng() * 3,
        { scale: 0.9 + rng() * 0.8, xMin: 6, xMax: 12 });
    }
    // Distant barns: kept inside the 26 m ground plane (|x| + half-width ≤ 13)
    // and at least 30 m ahead — a barn any closer looms over the track like
    // a billboard instead of reading as a barn in the distance.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // rotY π: the barn front (door + gable) faces the track/camera instead
      // of a random edge-on angle that reads as a red silo.
      add('barnwall', this.buildMesh('barnwall'), side * (9.5 + rng() * 1.5), 30 + i * 18 + rng() * 5,
        { scale: 1.2 + rng() * 0.2, xMin: 9.5, xMax: 11, rotY: Math.PI });
    }
    // Hay bales and pumpkins scattered just off the track.
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('hay', this.buildMesh('hay'), side * (4.8 + rng() * 3.2), 80 - i * 12 - rng() * 4,
        { scale: 0.9 + rng() * 0.3, xMin: 4.8, xMax: 8 });
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('pumpkin', this.buildMesh('pumpkin'), side * (4.2 + rng() * 2.8), 74 - i * 12 - rng() * 4,
        { scale: 0.9 + rng() * 0.4, xMin: 4.2, xMax: 7 });
    }
    // Bushes and flowers hug the track edge.
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      add('bush', makeBushMesh(), side * (3.9 + rng() * 3.1), 83 - i * 8.5 - rng() * 3,
        { scale: 0.7 + rng() * 0.5, xMin: 3.9, xMax: 7 });
    }
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const color = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)];
      add('flower', makeFlowerMesh(color), side * (3.7 + rng() * 2.3), 84 - i * 4.3 - rng() * 2,
        { scale: 0.8 + rng() * 0.4, xMin: 3.7, xMax: 6 });
    }
    // Clouds high up and birds crossing the sky (separate pools: they
    // drift on their own parallax instead of scrolling with the ground).
    for (let i = 0; i < 6; i++) {
      const mesh = makeCloudMesh();
      mesh.position.set((rng() < 0.5 ? -1 : 1) * (8 + rng() * 20), 16 + rng() * 8, -10 + i * 17 + rng() * 6);
      mesh.scale.setScalar(1.6 + rng() * 1.6);
      this.scene.add(mesh);
      this.clouds.push({ mesh, vx: (rng() - 0.5) * 0.6 });
    }
    for (let i = 0; i < 4; i++) {
      const mesh = makeBirdMesh();
      mesh.position.set((rng() < 0.5 ? -1 : 1) * (5 + rng() * 15), 9 + rng() * 5, 10 + i * 18 + rng() * 8);
      this.scene.add(mesh);
      this.birds.push({ mesh, vx: (rng() < 0.5 ? -1 : 1) * (1 + rng()) });
    }
  }

  updateScenery(dt, speed) {
    const dz = speed * dt;
    for (const item of this.scenery) {
      item.mesh.position.z -= dz;
      if (item.mesh.position.z < -18) {
        item.mesh.position.z += 120;
        // Fence lines keep their x (they are the track edge); everything
        // else re-scatters to a fresh spot in its own band.
        if (!item.fixedX) {
          const side = this.sceneryRng() < 0.5 ? -1 : 1;
          item.mesh.position.x = side * (item.xMin + this.sceneryRng() * (item.xMax - item.xMin));
        }
      }
    }
    // Clouds drift slowly (parallax, not ground speed) and birds cross.
    for (const c of this.clouds) {
      c.mesh.position.z -= dz * 0.12;
      c.mesh.position.x += c.vx * dt;
      if (c.mesh.position.z < -20) {
        c.mesh.position.z += 130;
        c.mesh.position.x = (this.sceneryRng() < 0.5 ? -1 : 1) * (8 + this.sceneryRng() * 20);
      }
      if (c.mesh.position.x > 32) c.mesh.position.x = -32;
      if (c.mesh.position.x < -32) c.mesh.position.x = 32;
    }
    for (const b of this.birds) {
      b.mesh.position.z -= dz * 0.5;
      b.mesh.position.x += b.vx * dt;
      if (b.mesh.position.z < -10) {
        b.mesh.position.z += 100;
        b.mesh.position.x = (this.sceneryRng() < 0.5 ? -1 : 1) * (5 + this.sceneryRng() * 15);
      }
      if (Math.abs(b.mesh.position.x) > 26) b.vx = -b.vx;
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
