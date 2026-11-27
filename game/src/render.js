// TURKEY RUN 3D — camera rig + trauma shake + dust/feather particles.
// The camera sits behind the turkey, smoothed exponentially, with a forward
// look-ahead so the next obstacles stay readable. Shake only moves the camera.
import * as THREE from 'three';
import { CAMERA_BASE, CAMERA_LOOK_AHEAD_Z } from './config.js';

function makeDotTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.trauma = 0;
    this._time = 0;
    this._smoothPos = new THREE.Vector3(CAMERA_BASE.x, CAMERA_BASE.y, CAMERA_BASE.z);
    this._smoothLook = new THREE.Vector3(0, 1.2, CAMERA_LOOK_AHEAD_Z);
    this._shakeOffset = new THREE.Vector3();
  }

  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset() {
    this.trauma = 0;
    this._smoothPos.set(CAMERA_BASE.x, CAMERA_BASE.y, CAMERA_BASE.z);
    this._smoothLook.set(0, 1.2, CAMERA_LOOK_AHEAD_Z);
  }

  // dt is real time here: shake decays in real time, not game time.
  // escapedT (0..1, already eased by the caller) is the round-4 finish
  // celebration amount — 0 during play, ramping to 1 over ~1 s after the
  // escape. It dollies the camera back so it sits ~6 m behind the farmer
  // and looks down/closer, so the farmer reads head-to-toe instead of
  // only his hat at the bottom edge. At the base rig a farmer 2.9 m ahead
  // of the camera puts his feet ~53° below level, past the ~38° bottom
  // edge; 6 m behind him his feet sit ~35° below level against a bottom
  // edge pitched down to ~-43°, with the turkey (~13 m ahead) and the
  // gate still in frame. Only the escaped framing moves — play is
  // untouched (escapedT = 0).
  update(dt, turkeyX, turkeyY, farmerGap, escapedT = 0) {
    this._time += dt;
    // Farmer proximity pull-back: when the farmer closes in, ease the
    // camera back and down so his feet stay in frame instead of being cut
    // off at the bottom edge (from the base rig, feet at gap 2 sit ~41°
    // below level, past the ~39° bottom edge). Ramps in between gap 6 m
    // and gap 2 m; at the 4.5 m equilibrium the rig is nearly unchanged,
    // and only a SURGE-close farmer gets the full pull-back.
    const closeness = Math.max(0, Math.min(1, (6 - farmerGap) / 4));
    const pullZ = closeness * 1.6;
    const pullY = closeness * 0.8;
    // Round 4 escaped dolly-out: extra pull-back on top of the proximity
    // pull-back, so the camera ends up ~6 m behind the farmer whatever
    // gap he escaped at (gap is eased to >= 7 m by main.js, so the dolly
    // is ~5-6 m from the base rig). A touch up (+0.3 m) keeps the gate
    // arch in frame while the look target drops toward the farmer.
    const escCamZ = -Math.max(farmerGap, 0) - 6.0;
    const escDollyZ = Math.max(0, (CAMERA_BASE.z - pullZ) - escCamZ);
    // Camera follows the turkey's lane a little (30%) so lane changes read.
    const target = new THREE.Vector3(
      CAMERA_BASE.x + turkeyX * 0.3,
      CAMERA_BASE.y + turkeyY * 0.25 - pullY + escapedT * 0.3,
      CAMERA_BASE.z - pullZ - escapedT * escDollyZ,
    );
    const lookTarget = new THREE.Vector3(
      turkeyX * 0.5,
      1.2 + turkeyY * 0.2 - escapedT * 0.7,
      CAMERA_LOOK_AHEAD_Z - escapedT * 10,
    );
    const k = 1 - Math.exp(-8 * dt);
    this._smoothPos.lerp(target, k);
    this._smoothLook.lerp(lookTarget, k);

    // Trauma shake: amplitude = trauma^2, summed sines, decays 1.2/s.
    this.trauma = Math.max(0, this.trauma - 1.2 * dt);
    const sh = this.trauma * this.trauma;
    const t = this._time;
    this._shakeOffset.set(
      sh * 0.35 * (Math.sin(t * 47.3) + Math.sin(t * 23.7) * 0.6),
      sh * 0.3 * (Math.sin(t * 39.1) + Math.sin(t * 29.3) * 0.6),
      0,
    );
    this.camera.position.copy(this._smoothPos).add(this._shakeOffset);
    // Farmer visible when close: tilt the look target down toward him.
    const look = this._smoothLook.clone();
    if (farmerGap < 7) look.y -= (7 - farmerGap) * 0.12;
    this.camera.lookAt(look);
  }
}

// Simple sprite particles: dust puffs on landing, feathers on pickup.
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.dustTex = makeDotTexture('rgba(210,190,150,0.9)', 'rgba(210,190,150,0)');
    this.featherTex = makeDotTexture('rgba(255,240,180,0.95)', 'rgba(255,240,180,0)');
    this.pool = [];
    for (let i = 0; i < 60; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.dustTex, transparent: true, depthWrite: false,
      }));
      sprite.visible = false;
      sprite.scale.setScalar(0.5);
      scene.add(sprite);
      this.pool.push({ sprite, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
    }
  }

  _spawn(x, y, z, texture, count, spread, up) {
    let spawned = 0;
    for (const p of this.pool) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      p.sprite.material.map = texture;
      p.sprite.material.color.set(0xffffff);
      p.sprite.position.set(x, y, z);
      p.sprite.visible = true;
      p.vx = (Math.random() - 0.5) * spread;
      p.vy = Math.random() * up;
      p.vz = (Math.random() - 0.5) * spread;
      p.life = p.maxLife = 0.5 + Math.random() * 0.4;
      p.sprite.scale.setScalar(0.3 + Math.random() * 0.4);
      spawned++;
    }
  }

  dust(x, y, z) {
    this._spawn(x, y + 0.1, z, this.dustTex, 8, 2.2, 1.2);
  }

  feathers(x, y, z) {
    this._spawn(x, y + 0.6, z, this.featherTex, 10, 1.6, 2.4);
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vy -= 3 * dt;
      const fade = p.life / p.maxLife;
      p.sprite.material.opacity = fade;
      const s = p.sprite.scale.x + dt * 0.8;
      p.sprite.scale.setScalar(s);
    }
  }
}
