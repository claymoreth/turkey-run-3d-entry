// TURKEY RUN 3D — obstacles + pickups: seeded spawning, movement, collision.
// Generous hitboxes: obstacle hitbox 0.8x visual, turkey half-width 0.35 m.
import {
  LANES, SPAWN_AHEAD_Z, DESPAWN_BEHIND_Z, HITBOX_SCALE,
  OBSTACLE_TYPES, STAGE_OBSTACLES, STAGE_INTRODUCTIONS, PICKUP_TYPES,
  TURKEY_HALF_WIDTH, FINISH_DISTANCE,
} from './config.js';

function hitHalf(type) {
  const s = OBSTACLE_TYPES[type].size;
  return { x: (s.x * HITBOX_SCALE) / 2, z: (s.z * HITBOX_SCALE) / 2 };
}

export class ObstacleField {
  constructor(scene, buildMesh) {
    this.scene = scene;
    this.buildMesh = buildMesh; // (assetName) => THREE.Object3D (clone)
    this.obstacles = [];
    this.pickups = [];
    this.rng = null;
    this.distanceSinceSpawn = 0;
    this.nextGap = 20;
    this.introduced = new Set();
    this.introQueue = [];
    this.gateSpawned = false;
    this.gate = null;
  }

  reset(rng) {
    for (const o of this.obstacles) this.scene.remove(o.mesh);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    if (this.gate) this.scene.remove(this.gate);
    this.obstacles = [];
    this.pickups = [];
    this.rng = rng;
    this.distanceSinceSpawn = 0;
    this.nextGap = 18;
    this.introduced = new Set(['fence', 'hay', 'pot']);
    this.introQueue = [];
    this.gateSpawned = false;
    this.gate = null;
  }

  _gapFor(distanceM, stageIndex) {
    // FASE 2B: gaps tighten in stage 2 (BARN) and 3 (KITCHEN) so a perfect
    // run is no longer a free 0-hit stroll; stage 1 (FARMYARD) stays
    // friendly for learning. (config.js untouched — the override lives
    // here; base/spread per stage, distance term only in stage 0.)
    // Mean gap: stage 0 ~21 m, stage 1 ~21 m, stage 2 ~18 m.
    // (Iterasi 7: stage 2 20 -> 18 m — pada 20 m, 5 dari 13 escape
    // manusiawi masih 0-hit; targetnya escape 1-2 hit di kebanyakan seed.
    // Stage 1 tetap 21 m: kematian dini sudah cukup sering di sana.)
    if (stageIndex === 0) return 15 + distanceM * 0.004 + this.rng() * 12;
    if (stageIndex === 1) return 16 + this.rng() * 10;
    return 14 + this.rng() * 8;
  }

  _spawnObstacle(kind, lane, z) {
    const def = OBSTACLE_TYPES[kind];
    const mesh = this.buildMesh(def.asset);
    mesh.position.set(LANES[lane], 0, z);
    if (kind === 'beam') mesh.position.y = 0.55;
    if (kind === 'knifeSwing') {
      // Knife hangs blade-down above the lane, swinging across it.
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 2.1;
    }
    if (kind === 'knifeFall') mesh.position.y = 3.2;
    if (kind === 'firejet') mesh.position.y = 0;
    this.scene.add(mesh);
    // Timed traps arm only when close (z <= 16-20 m): their telegraph
    // timers run in game time, so starting them at spawn (z = 85) would
    // burn the whole telegraph + active window long before the turkey
    // arrives and the trap would be harmless decoration. 'dormant' holds
    // them until arming range; see update().
    const obstacle = {
      kind, lane, x: LANES[lane], z, mesh,
      state: kind === 'firejet' || kind === 'knifeFall' ? 'dormant' : 'idle',
      timer: 0,
      phase: this.rng() * Math.PI * 2,
      driftDir: this.rng() < 0.5 ? -1 : 1,
      hit: false,
      flame: null,
      shadow: null,
    };
    if (kind === 'firejet') {
      obstacle.flame = this.buildMesh('__flame');
      // 0.7 m in front of the oven mouth, so the flame reads instead of
      // hiding inside the oven box (update() keeps it synced while live).
      obstacle.flame.position.set(LANES[lane], 0.9, z - 0.7);
      obstacle.flame.visible = false;
      this.scene.add(obstacle.flame);
    }
    if (kind === 'knifeFall') {
      obstacle.shadow = this.buildMesh('__shadow');
      obstacle.shadow.position.set(LANES[lane], 0.02, z);
      obstacle.shadow.visible = false; // shown only once armed (telegraph)
      this.scene.add(obstacle.shadow);
    }
    this.obstacles.push(obstacle);
    return obstacle;
  }

  _spawnPickup(kind, lane, z) {
    const mesh = this.buildMesh(PICKUP_TYPES[kind].asset);
    mesh.position.set(LANES[lane], kind === 'corn' ? 0.7 : 1.0, z);
    this.scene.add(mesh);
    this.pickups.push({ kind, lane, x: LANES[lane], z, mesh, bob: this.rng() * 6 });
  }

  _spawnPattern(distanceM, stageIndex) {
    const allowed = STAGE_OBSTACLES[stageIndex];
    const roll = this.rng();
    // New kinds appear alone first, with a wide gap, so the player learns them.
    const intros = STAGE_INTRODUCTIONS[stageIndex] || [];
    for (const kind of intros) {
      if (!this.introduced.has(kind)) {
        this.introduced.add(kind);
        this._spawnObstacle(kind, Math.floor(this.rng() * 3), SPAWN_AHEAD_Z);
        this.nextGap = 34;
        this.distanceSinceSpawn = 0;
        return;
      }
    }
    // FASE 2B roll budget (stage 0 unchanged: single 55 / two 30 / pickup 15):
    // stage 1: combo 10 / single 45 / two 30 / pickup 15.
    // stage 2: combo 10 / chase 8 / single 37 / two 30 / pickup 15.
    if (stageIndex >= 1 && roll < 0.10) {
      // FASE 2B mixed row (stage 1+): a beam (slide) in one lane and a
      // jump obstacle in another at the SAME z — the player must pick the
      // right move per lane, not just any free lane. Third lane free.
      // Runs only after the beam intro (intro check above returns first).
      const freeLane = Math.floor(this.rng() * 3);
      const lanes = [0, 1, 2].filter((l) => l !== freeLane);
      const jumpKinds = ['fence', 'hay', 'pot'];
      this._spawnObstacle('beam', lanes[0], SPAWN_AHEAD_Z);
      this._spawnObstacle(jumpKinds[Math.floor(this.rng() * jumpKinds.length)], lanes[1], SPAWN_AHEAD_Z);
    } else if (stageIndex === 2 && roll < 0.18) {
      // FASE 2B staggered chase (stage 2): a knifeFall forces a lane
      // change, then a fence 8 m behind it in another lane forces a jump
      // right after. Third lane free throughout.
      const laneA = Math.floor(this.rng() * 3);
      let laneB = Math.floor(this.rng() * 3);
      if (laneB === laneA) laneB = (laneB + 1) % 3;
      this._spawnObstacle('knifeFall', laneA, SPAWN_AHEAD_Z);
      this._spawnObstacle('fence', laneB, SPAWN_AHEAD_Z + 8);
    } else if (roll < 0.55) {
      // Single obstacle, sometimes with a pickup in a free lane.
      const lane = Math.floor(this.rng() * 3);
      this._spawnObstacle(allowed[Math.floor(this.rng() * allowed.length)], lane, SPAWN_AHEAD_Z);
      if (this.rng() < 0.5) {
        const free = [0, 1, 2].filter((l) => l !== lane);
        this._spawnPickup(this.rng() < 0.8 ? 'corn' : 'pie', free[Math.floor(this.rng() * free.length)], SPAWN_AHEAD_Z + 4);
      }
    } else if (roll < 0.85) {
      // Two obstacles, one lane always free.
      const freeLane = Math.floor(this.rng() * 3);
      const lanes = [0, 1, 2].filter((l) => l !== freeLane);
      for (const lane of lanes) {
        this._spawnObstacle(allowed[Math.floor(this.rng() * allowed.length)], lane, SPAWN_AHEAD_Z);
      }
      if (this.rng() < 0.6) this._spawnPickup('corn', freeLane, SPAWN_AHEAD_Z + 2);
    } else {
      // Pickup row: corn across all lanes, sometimes a golden feather.
      for (let lane = 0; lane < 3; lane++) {
        this._spawnPickup('corn', lane, SPAWN_AHEAD_Z + lane * 2);
      }
      if (this.rng() < 0.25) this._spawnPickup('feather', Math.floor(this.rng() * 3), SPAWN_AHEAD_Z + 8);
    }
    this.nextGap = this._gapFor(distanceM, stageIndex);
    this.distanceSinceSpawn = 0;
  }

  update(dt, speed, distanceM, stageIndex, gameTime) {
    const dz = speed * dt;
    this.distanceSinceSpawn += dz;

    if (!this.gateSpawned && distanceM > FINISH_DISTANCE - 90) {
      this.gateSpawned = true;
      this.gate = this.buildMesh('gate');
      this.gate.position.set(0, 0, SPAWN_AHEAD_Z);
      this.scene.add(this.gate);
    }

    if (distanceM < FINISH_DISTANCE - 40 && this.distanceSinceSpawn >= this.nextGap) {
      this._spawnPattern(distanceM, stageIndex);
    }

    // Move everything toward the turkey (turkey stays near z = 0).
    for (const o of this.obstacles) {
      o.z -= dz;
      o.mesh.position.z = o.z;
      // Arm timed traps in range so the telegraph is readable and the
      // active window still covers the turkey's arrival (z = 0).
      if (o.kind === 'firejet' && o.state === 'dormant' && o.z <= 16) {
        o.state = 'telegraph';
        o.timer = OBSTACLE_TYPES.firejet.telegraph;
        if (o.flame) o.flame.visible = true; // small warming glow, see below
      }
      if (o.kind === 'knifeFall' && o.state === 'dormant' && o.z <= 20) {
        o.state = 'shadow';
        o.timer = OBSTACLE_TYPES.knifeFall.telegraph;
        if (o.shadow) o.shadow.visible = true;
      }
      if (o.kind === 'pumpkin') {
        // Slow lateral drift between lanes.
        o.x += o.driftDir * OBSTACLE_TYPES.pumpkin.driftSpeed * dt;
        if (o.x < LANES[0]) { o.x = LANES[0]; o.driftDir = 1; }
        if (o.x > LANES[2]) { o.x = LANES[2]; o.driftDir = -1; }
        o.mesh.position.x = o.x;
        o.mesh.rotation.x -= (speed * dt) / 0.33;
      }
      if (o.kind === 'knifeSwing') {
        // Pendulum swing; blade low (dangerous) near the middle of the cycle.
        // Driven by game time (not performance.now()) so replays, autopilot
        // gate runs and ?shot= frames are deterministic.
        const t = (o.phase + gameTime) % OBSTACLE_TYPES.knifeSwing.swingPeriod;
        const swing = Math.sin((t / OBSTACLE_TYPES.knifeSwing.swingPeriod) * Math.PI * 2);
        o.mesh.rotation.z = swing * 0.9;
        o.dangerous = Math.abs(swing) < 0.45;
      }
      if (o.kind === 'firejet') {
        o.timer -= dt;
        if (o.state === 'telegraph' && o.timer <= 0) {
          o.state = 'active';
          o.timer = OBSTACLE_TYPES.firejet.active;
          if (o.flame) o.flame.visible = true;
        } else if (o.state === 'active' && o.timer <= 0) {
          o.state = 'spent';
          if (o.flame) o.flame.visible = false;
        }
        if (o.flame) {
          // The flame must travel WITH its oven (it is spawned at z = 85
          // and never synced, so it used to hover far away while the oven
          // arrived flameless) and leap from the oven mouth, 0.7 m in
          // front of it, so it reads instead of hiding inside the box.
          o.flame.position.set(o.x, 0.9, o.z - 0.7);
          // Telegraph reads as a small warming glow; active is full flame.
          const warm = o.state === 'telegraph' ? 0.35 : 1;
          const s = (0.9 + Math.sin(gameTime * 30) * 0.15) * warm;
          o.flame.scale.set(s, (1 + Math.sin(gameTime * 50) * 0.2) * warm, s);
        }
      }
      if (o.kind === 'knifeFall') {
        o.timer -= dt;
        // The ground shadow must travel WITH its knife (same spawn-z bug
        // as the flame: it used to sit at z = 85 while the knife arrived).
        if (o.shadow) o.shadow.position.set(o.x, 0.02, o.z);
        if (o.state === 'shadow' && o.timer <= 0) {
          o.state = 'falling';
          o.timer = 0.25;
          if (o.shadow) o.shadow.visible = false;
        } else if (o.state === 'falling') {
          o.mesh.position.y -= 12 * dt;
          if (o.mesh.position.y <= 0.8) {
            o.mesh.position.y = 0.8;
            o.state = 'landed';
            o.timer = 1.2;
          }
        } else if (o.state === 'landed') {
          o.timer -= dt;
        }
      }
    }
    for (const p of this.pickups) {
      p.z -= dz;
      p.mesh.position.z = p.z;
      p.bob += dt * 3;
      p.mesh.position.y = (p.kind === 'corn' ? 0.7 : 1.0) + Math.sin(p.bob) * 0.12;
      p.mesh.rotation.y += dt * 2;
    }

    // Despawn behind the camera.
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z > DESPAWN_BEHIND_Z && !(o.kind === 'knifeFall' && o.state === 'landed' && o.timer > 0)) return true;
      this.scene.remove(o.mesh);
      if (o.flame) this.scene.remove(o.flame);
      if (o.shadow) this.scene.remove(o.shadow);
      return false;
    });
    this.pickups = this.pickups.filter((p) => {
      if (p.z > DESPAWN_BEHIND_Z) return true;
      this.scene.remove(p.mesh);
      return false;
    });
  }

  // Collision + pickup checks against the turkey.
  // Returns { hit: obstacle|null, pickups: [...] }.
  checkCollisions(turkey) {
    let hit = null;
    const taken = [];
    for (const o of this.obstacles) {
      if (o.hit || hit) continue;
      if (o.kind === 'firejet' && o.state !== 'active') continue;
      if (o.kind === 'knifeFall' && o.state !== 'landed') continue;
      if (o.kind === 'knifeSwing' && !o.dangerous) continue;
      const half = hitHalf(o.kind);
      const dx = Math.abs(turkey.x - o.x);
      const dz = Math.abs(o.z);
      if (dx > half.x + TURKEY_HALF_WIDTH) continue;
      if (dz > half.z + 0.35) continue;
      const def = OBSTACLE_TYPES[o.kind];
      if (def.clearBy === 'slide') {
        if (turkey.sliding) continue;
        hit = o;
      } else if (def.clearBy === 'jump' || def.clearBy === 'jumpOrLane') {
        if (turkey.y > def.clearHeight) continue;
        hit = o;
      } else {
        // 'lane': only a lane change avoids it (a high jump also clears it).
        if (turkey.y > def.clearHeight) continue;
        hit = o;
      }
      if (hit) {
        o.hit = true;
        break;
      }
    }
    for (const p of this.pickups) {
      if (Math.abs(turkey.x - p.x) < 0.8 && Math.abs(p.z) < 0.9) taken.push(p);
    }
    if (taken.length) {
      this.pickups = this.pickups.filter((p) => !taken.includes(p));
      for (const p of taken) this.scene.remove(p.mesh);
    }
    return { hit, pickups: taken };
  }

  nearestAhead(turkeyLane, maxZ) {
    let best = null;
    for (const o of this.obstacles) {
      if (o.z <= 0 || o.z > maxZ) continue;
      if (!best || o.z < best.z) best = o;
    }
    return best;
  }
}
