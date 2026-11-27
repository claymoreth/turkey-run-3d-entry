// TURKEY RUN 3D — main: game loop (fixed 60 Hz tick), modes, scoring,
// farmer/turkey/obstacle wiring, autopilot + debug API, ?shot= frames.
import * as THREE from 'three';
import {
  LANES, FINISH_DISTANCE, MAX_LIVES, FIXED_DT, STAGES, stageForDistance,
  createRng, OBSTACLE_TYPES, HITBOX_SCALE, TURKEY_HALF_WIDTH,
} from './config.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { Turkey } from './turkey.js';
import { Farmer } from './farmer.js';
import { ObstacleField } from './obstacles.js';
import { World } from './world.js';
import { CameraRig, Particles } from './render.js';
import { Hud } from './hud.js';

const MODES = ['loading', 'title', 'playing', 'paused', 'caught', 'escaped'];

function queryParams() {
  return new URLSearchParams(window.location.search);
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.world = new World(this.canvas);
    this.hud = new Hud(document);
    this.input = new Input(window);
    this.audio = new AudioManager();
    this.turkey = new Turkey();
    this.farmer = new Farmer();
    this.field = new ObstacleField(this.world.scene, (name) => this.world.buildMesh(name));
    this.rig = new CameraRig(this.world.camera);
    this.particles = new Particles(this.world.scene);
    this.timer = new THREE.Timer();
    this.mode = 'loading';
    this.seed = 1;
    this.rng = createRng(this.seed);
    this.gameTime = 0;
    this.distanceM = 0;
    this.score = 0;
    this.corn = 0;
    this.nearMissBonus = 0; // FASE 2B: accumulated +5 near-miss bonuses
    this.pickupBonus = 0; // FINAL FIX: accumulated +25 pie/feather bonuses (score is recomputed each tick, so a direct score += 25 was wiped next tick)
    this.nearMisses = 0; // FASE 2B: near-miss count (see _checkNearMisses)
    this._lastNearMiss = null; // gameTime of the last near miss (or null)
    this.lives = MAX_LIVES;
    this.speed = STAGES[0].speed;
    this.stageIndex = 0;
    this.slowTimer = 0;
    this.invulnTimer = 0;
    this.boostTimer = 0;
    this.hitStopTimer = 0;
    this._accumulator = 0;
    this._lastReal = 0;
    this._shot = null;
    this.autopilot = { enabled: false };
    this._voiceChaseTimer = 0;
    this._chaseVoicePlayed = false;
    this._lastHit = null;
  }

  get stage() {
    return STAGES[this.stageIndex];
  }

  snapshot() {
    return {
      mode: this.mode,
      score: this.score,
      distanceM: Math.floor(this.distanceM),
      lives: this.lives,
      speed: Math.round(this.speed * 10) / 10,
      gapM: Math.round(this.farmer.gap * 10) / 10,
      farmerState: this.farmer.state,
      turkeyLane: this.turkey.lane,
      turkeyX: Math.round(this.turkey.x * 100) / 100,
      turkeyY: Math.round(this.turkey.y * 100) / 100,
      nearMisses: this.nearMisses,
      pickupBonus: this.pickupBonus,
      lastNearMiss: this._lastNearMiss,
      lastHit: this._lastHit,
      // Nearest obstacle ahead (any lane) — verifier telemetry.
      nearest: (() => {
        const o = this.field.nearestAhead(this.turkey.lane, 40);
        return o ? { kind: o.kind, lane: o.lane, z: Math.round(o.z * 10) / 10, state: o.state } : null;
      })(),
    };
  }

  async init() {
    const params = queryParams();
    const seedParam = Number(params.get('seed'));
    if (Number.isFinite(seedParam)) this.seed = seedParam;
    const shot = params.get('shot');
    this._shot = ['title', 'farmyard', 'kitchen', 'escaped'].includes(shot) ? shot : null;

    this.input.onFirstGesture = () => this.audio.unlock();

    await this.world.loadAssets((p) => this.hud.setLoading(p));
    this.hud.hideLoading();

    // Attach hero meshes (loaded once, owned by the game, not the field).
    this.turkey.attach(this.world.buildMesh('turkey'));
    this.world.scene.add(this.turkey.mesh);
    this.farmer.attach(this.world.buildMesh('farmer'));
    this.world.scene.add(this.farmer.mesh);

    this.resetRun();
    if (this._shot) {
      this._setupShot(this._shot);
    } else {
      this.mode = 'title';
      this.hud.showOverlay('title', 0, 0);
    }
    this._installDebugApi();
    this.world.renderer.setAnimationLoop((t) => this._frame(t));
  }

  _installDebugApi() {
    const self = this;
    window.__turkeyrun3d = {
      get state() {
        return self.snapshot();
      },
      autopilot: {
        get enabled() {
          return self.autopilot.enabled;
        },
        set enabled(v) {
          self.autopilot.enabled = !!v;
        },
        setSeed(seed) {
          self.seed = seed;
          self.resetRun();
        },
        step() {
          self._tick(FIXED_DT);
        },
      },
    };
  }

  resetRun() {
    this.rng = createRng(this.seed);
    this.gameTime = 0;
    this.distanceM = 0;
    this.score = 0;
    this.corn = 0;
    this.nearMissBonus = 0;
    this.pickupBonus = 0;
    this.nearMisses = 0;
    this._lastNearMiss = null;
    this.lives = MAX_LIVES;
    this.stageIndex = 0;
    this.speed = STAGES[0].speed;
    this.slowTimer = 0;
    this.invulnTimer = 0;
    this.boostTimer = 0;
    this.hitStopTimer = 0;
    this._accumulator = 0;
    this._chaseVoicePlayed = false;
    this._lastHit = null;
    this.turkey.reset();
    this.farmer.reset();
    this.field.reset(this.rng);
    this.world.initScenery(this.rng);
    this.world.applyStage(STAGES[0]);
    this.rig.reset();
    this.turkey.applyToMesh();
    this.farmer._applyMesh(0, 0);
    this._updateHud();
  }

  startRun() {
    this.resetRun();
    this.mode = 'playing';
    this.hud.hideOverlay();
    this.audio.gobble();
  }

  // --- deterministic static frames for screenshots (?shot=...) ---
  _setupShot(shot) {
    this.mode = 'shot';
    this.audio.setMuted(true);
    if (shot === 'title') {
      this.turkey.x = 0;
      this.turkey.applyToMesh();
      this.farmer.gap = 3.5;
      this.farmer._applyMesh(0, 0);
      this.world.applyStage(STAGES[0]);
      this.rig.update(0.016, 0, 0, 3.5);
      this.hud.showOverlay('title', 0, 0);
    } else if (shot === 'farmyard') {
      this._seedFieldForShot(120, 0);
      this.turkey.y = 0.85;
      this.turkey.jumping = true;
      this.turkey.applyToMesh();
      // Stage the farmer close (gap 1.0 m, offset to the left lane) so he
      // reads head-to-toe in frame: from the base rig his feet sit ~34°
      // below level against a ~38° bottom edge. The rig is fed gap 7 on
      // purpose — the real 1.0 m gap would trigger the gameplay proximity
      // pull-back and shrink the turkey below the 120 px target; the shot
      // keeps the base rig so the turkey stays large.
      this.farmer.gap = 1.0;
      this.farmer._applyMesh(0, 0);
      this.farmer.mesh.position.x = -2.2;
      this.distanceM = 120;
      this.score = 130;
      this.corn = 3;
      this.world.applyStage(STAGES[0]);
      this.rig.update(0.016, 0, 0.85, 7);
      this.hud.hideOverlay();
      this._updateHud();
    } else if (shot === 'kitchen') {
      this._seedFieldForShot(1150, 2);
      this.turkey.x = LANES[2];
      this.turkey.lane = 2;
      this.turkey.applyToMesh();
      this.farmer.gap = 2.2;
      this.farmer.state = 'SURGE';
      this.farmer._applyMesh(0, 0);
      this.distanceM = 1150;
      this.score = 1240;
      this.corn = 11;
      this.lives = 2;
      this.stageIndex = 2;
      this.speed = STAGES[2].speed;
      this.world.applyStage(STAGES[2]);
      this.rig.update(0.016, LANES[2], 0, 2.2);
      this.hud.hideOverlay();
      this._updateHud();
    } else if (shot === 'escaped') {
      this.distanceM = FINISH_DISTANCE;
      this.score = 1680;
      this.corn = 14;
      this.turkey.x = 0;
      this.turkey.y = 0.85;
      this.turkey.jumping = true;
      this.turkey.applyToMesh();
      // Gate close and large (1.4x) so the arch is unmistakable, and the
      // turkey mid-leap 1.5 m in front of the gate plane — framed by the
      // posts with the leafy arch above it, reading as passing through the
      // gate rather than a speck on the horizon.
      const gate = this.world.buildMesh('gate');
      gate.position.set(0, 0, 1.5);
      gate.scale.setScalar(1.4);
      this.world.scene.add(gate);
      this.farmer.gap = 14;
      this.farmer._applyMesh(0, 0);
      this.stageIndex = 2;
      this.speed = STAGES[2].speed;
      this.world.applyStage(STAGES[2]);
      this.rig.update(0.016, 0, 0, 14);
      this.hud.showOverlay('escaped', 1680, FINISH_DISTANCE);
      this._updateHud();
    }
    this.world.renderer.render(this.world.scene, this.world.camera);
  }

  // Place a few hand-picked obstacles ahead so a shot frame tells the story.
  // Obstacles sit close (10-34 m) so they read at screenshot scale; the
  // farmyard fence is near enough that the mid-jump turkey reads as
  // clearing it, and the kitchen firejet is near enough that its flame
  // and the oven glow are visible.
  _seedFieldForShot(distanceM, stageIndex) {
    const rng = createRng(this.seed + 77);
    this.field.reset(rng);
    this.field._spawnObstacle(stageIndex === 0 ? 'fence' : 'firejet', 1, stageIndex === 0 ? 10 : 14);
    this.field._spawnObstacle(stageIndex === 0 ? 'hay' : 'knifeFall', 0, stageIndex === 0 ? 22 : 24);
    this.field._spawnObstacle('pumpkin', 2, 34);
    this.field._spawnPickup('corn', 1, 18);
    this.field._spawnPickup('corn', 2, 30);
    if (stageIndex === 2) {
      const jet = this.field.obstacles.find((o) => o.kind === 'firejet');
      if (jet) {
        jet.state = 'active';
        if (jet.flame) jet.flame.visible = true;
      }
      // Stage the falling knife mid-telegraph: shadow on the ground, blade
      // hanging above it (mode 'shot' never ticks update(), so it holds).
      const fall = this.field.obstacles.find((o) => o.kind === 'knifeFall');
      if (fall) {
        fall.state = 'shadow';
        fall.timer = 0.7;
        if (fall.shadow) fall.shadow.visible = true;
      }
    }
  }

  // --- autopilot (verifier hook): dodge the nearest threat ahead ---
  _autopilotDecide() {
    // Slide is a held input: release it every tick unless a beam threat
    // re-holds it below, otherwise the turkey slides forever after the
    // first beam (held state leaked across decisions).
    this.input.held.slide = false;
    const turkey = this.turkey;
    // The threat window starts at z > -1, NOT z > 1: an obstacle at
    // z <= 1 is point-blank, and dropping it from `ahead` made the
    // autopilot dodge a farther threat by lane-changing straight into it
    // (seed-1 hay hit: the hay at z 0.6 was "invisible" while the
    // autopilot moved left for a fence 15 m behind it). The slide reset
    // above is safe now: when `ahead` is empty there is genuinely nothing
    // in (-1, 30), so releasing the slide cannot end it mid-beam.
    const ahead = this.field.obstacles.filter((o) => o.z > -1 && o.z < 30);
    if (!ahead.length) return;
    // The threat is the nearest obstacle that can actually hit the turkey:
    // one in the turkey's lane (or, for drifting pumpkins, closing on it).
    // Reacting to the single nearest obstacle regardless of lane let an
    // out-of-lane obstacle mask an in-lane one arriving at the same z
    // (seed-7: fence@L0 z 0.6 masked hay@L1 z ~0 — the autopilot did
    // nothing while the hay hit the turkey).
    const inMyLane = (o) => Math.abs(o.x - turkey.x) < 1.1
      || (o.kind === 'pumpkin' && Math.abs(o.x - turkey.x) < 1.8);
    const threat = ahead.find(inMyLane);
    if (!threat) return;
    const def = OBSTACLE_TYPES[threat.kind];
    const timeToHit = threat.z / Math.max(this.speed, 1);
    if (def.clearBy === 'slide') {
      if (timeToHit < 0.55) this.input.held.slide = true;
      return;
    }
    if (def.clearBy === 'jump' || def.clearBy === 'jumpOrLane') {
      // Prefer a free lane if one is open, else jump at the last moment.
      const freeLane = this._freeLaneAt(threat.z);
      if (freeLane !== null && timeToHit > 0.5) {
        this._moveTowardLane(freeLane);
        return;
      }
      if (timeToHit < 0.42 && !turkey.jumping) this.input.noteJumpPress(this.gameTime);
      return;
    }
    // 'lane' kinds (pumpkin, knifeFall): move to a free lane.
    const freeLane = this._freeLaneAt(threat.z);
    if (freeLane !== null) this._moveTowardLane(freeLane);
  }

  _freeLaneAt(z) {
    // A lane is free only if NO obstacle sits in it anywhere between the
    // turkey (z = 0) and the threat (plus a small margin behind it): the
    // turkey travels through that whole stretch while changing lanes, so
    // checking only ±3 m around the threat's z let it dodge into a lane
    // whose point-blank obstacle was about to hit it. Uses live o.x so
    // drifting pumpkins count in the lane they are actually in.
    for (let lane = 0; lane < 3; lane++) {
      let blocked = false;
      for (const o of this.field.obstacles) {
        if (o.z > -1 && o.z < z + 3 && Math.abs(o.x - LANES[lane]) < 1.1) blocked = true;
      }
      if (!blocked) return lane;
    }
    return null;
  }

  _moveTowardLane(lane) {
    if (lane < this.turkey.lane) this.input.pressedQueue.push('laneLeft');
    else if (lane > this.turkey.lane) this.input.pressedQueue.push('laneRight');
  }

  // --- one fixed 60 Hz tick ---
  _tick(dt) {
    if (this.mode !== 'playing') return;
    this.gameTime += dt;

    // Hit-stop: freeze the world briefly after a hit / catch.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    if (this.autopilot.enabled) this._autopilotDecide();
    const pressed = this.input.drainPressed();
    for (const action of pressed) {
      if (action === 'jump') this.input.noteJumpPress(this.gameTime);
      else if (action === 'laneLeft') this.turkey.moveLane(-1);
      else if (action === 'laneRight') this.turkey.moveLane(1);
      else if (action === 'pause') this._pause();
      else if (action === 'mute') this.audio.setMuted(!this.audio.muted);
      else if (action === 'restart') this.startRun();
    }
    if (this.mode !== 'playing') return;

    // Jump buffer: a press within 0.12 s still counts.
    if (this.input.jumpBuffered(this.gameTime)) {
      if (this.turkey.tryJump()) {
        this.input.consumeJumpBuffer();
        this.audio.jump();
      }
    }
    if (this.input.isHeld('slide')) this.turkey.startSlide();

    // Speed: stage base, slowed after a hit, boosted by pie.
    let speed = this.stage.speed;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      speed *= 0.55;
    }
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      speed *= 1.25;
    }
    this.speed = speed;

    const landed = this.turkey.update(dt, this.input.isHeld('slide'));
    if (landed === 'landed') {
      this.audio.land();
      this.particles.dust(this.turkey.x, 0, 0);
    }
    this.turkey.applyToMesh();

    this.distanceM += speed * dt;
    this.score = Math.floor(this.distanceM) + this.corn * 10 + this.nearMissBonus + this.pickupBonus;

    // Stage transitions.
    const stage = stageForDistance(this.distanceM);
    if (stage.index !== this.stageIndex) {
      this.stageIndex = stage.index;
      this.world.applyStage(stage);
    }

    this.field.update(dt, speed, this.distanceM, this.stageIndex, this.gameTime);
    this.world.updateScenery(dt, speed);

    // Farmer chase.
    const touch = this.farmer.update(dt, speed, this.stage.speed);
    if (this.farmer.state === 'SURGE' && !this._chaseVoicePlayed) {
      this._chaseVoicePlayed = true;
      this.audio.playVoice('surge');
    }
    if (this.farmer.state !== 'SURGE') this._chaseVoicePlayed = false;
    this._voiceChaseTimer -= dt;
    if (this.farmer.gap < 6 && this._voiceChaseTimer <= 0) {
      this._voiceChaseTimer = 9;
      this.audio.playVoice('chase');
    }
    if (touch === 'touch' && this.invulnTimer <= 0) this._onCaughtByFarmer();

    // Collisions.
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    const { hit, pickups } = this.field.checkCollisions(this.turkey);
    if (hit && this.invulnTimer <= 0) this._onObstacleHit(hit);
    for (const p of pickups) this._onPickup(p);
    this._checkNearMisses();

    if (this.distanceM >= FINISH_DISTANCE) this._onEscaped();
    this._updateHud();
  }

  _onObstacleHit(obstacle) {
    this.lives -= 1;
    this._lastHit = { kind: obstacle.kind, distanceM: Math.floor(this.distanceM), gameTime: Math.round(this.gameTime * 10) / 10 };
    this.slowTimer = 0.7;
    this.invulnTimer = 1.2;
    this.hitStopTimer = 0.05;
    this.rig.addTrauma(0.6);
    this.audio.hit();
    this.audio.playVoice('chase');
    if (this.lives <= 0) {
      this._onCaught();
    }
  }

  // FASE 2B — near-miss bonus: an obstacle that just crossed the turkey's
  // plane (z <= 0) without a hit, cleared VERY closely, awards +5.
  // Close = lateral clearance 0..0.6 m from the obstacle edge, or jump
  // clearance 0..0.3 m above its clear height. Each obstacle counts once
  // (o._nmCounted). Traps only count while actually live (active flame,
  // landed knife, dangerous swing) — passing a spent trap is not close.
  // NOTE: the bonus now shows as a transient "NEAR MISS +5" toast in the
  // HUD (hud.showToast) plus the nearMisses counter in snapshot().
  _checkNearMisses() {
    for (const o of this.field.obstacles) {
      if (o._nmCounted || o.hit) continue;
      if (o.z > 0 || o.z <= -2) continue;
      o._nmCounted = true;
      if (o.kind === 'firejet' && o.state !== 'active') continue;
      if (o.kind === 'knifeFall' && o.state !== 'landed') continue;
      if (o.kind === 'knifeSwing' && !o.dangerous) continue;
      const def = OBSTACLE_TYPES[o.kind];
      const halfX = (def.size.x * HITBOX_SCALE) / 2;
      const lateralClear = Math.abs(this.turkey.x - o.x) - (halfX + TURKEY_HALF_WIDTH);
      const verticalClear = this.turkey.y - def.clearHeight;
      const closeLateral = lateralClear >= 0 && lateralClear < 0.6;
      const closeJump = (def.clearBy === 'jump' || def.clearBy === 'jumpOrLane' || def.clearBy === 'lane')
        && verticalClear >= 0 && verticalClear < 0.3;
      if (closeLateral || closeJump) {
        this.nearMissBonus += 5;
        this.nearMisses += 1;
        this._lastNearMiss = Math.round(this.gameTime * 10) / 10;
        this.hud.showToast('NEAR MISS +5');
      }
    }
  }

  _onCaughtByFarmer() {
    this.lives -= 1;
    this.distanceM += 8; // knock forward
    this.farmer.knockBack();
    this.invulnTimer = 1.5;
    this.hitStopTimer = 0.12;
    this.rig.addTrauma(1);
    this.audio.caught();
    this.audio.playVoice('caught');
    if (this.lives <= 0) this._onCaught();
  }

  _onPickup(pickup) {
    if (pickup.kind === 'corn') {
      this.corn += 1;
      this.audio.corn();
    } else if (pickup.kind === 'feather') {
      if (this.lives < MAX_LIVES) this.lives += 1;
      else this.pickupBonus += 25;
      this.audio.pickup();
      this.particles.feathers(this.turkey.x, 1, 0);
    } else if (pickup.kind === 'pie') {
      this.boostTimer = 2;
      this.invulnTimer = Math.max(this.invulnTimer, 2);
      this.pickupBonus += 25;
      this.audio.pickup();
      this.particles.feathers(this.turkey.x, 1, 0);
    }
  }

  _onCaught() {
    this.mode = 'caught';
    this.audio.playVoice('dinner');
    this.audio.caught();
    this.hud.showOverlay('caught', this.score, this.distanceM);
  }

  _onEscaped() {
    this.mode = 'escaped';
    this.audio.win();
    this.hud.showOverlay('escaped', this.score, this.distanceM);
  }

  _pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.hud.showOverlay('paused', this.score, this.distanceM);
  }

  _resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.hud.hideOverlay();
  }

  _updateHud() {
    this.hud.update({
      score: this.score,
      distanceM: this.distanceM,
      lives: this.lives,
      stageName: this.stage.name,
      gapM: this.farmer.gap,
      farmerState: this.farmer.state,
      speed: this.speed,
      corn: this.corn,
    });
  }

  _frame(now) {
    this.timer.update();
    const realDt = Math.min(this.timer.getDelta(), 0.1);
    if (this.mode === 'shot') return; // static frame already rendered once

    // Title / end screens still render the scene behind the overlay.
    if (this.mode === 'title' || this.mode === 'caught' || this.mode === 'escaped') {
      const pressed = this.input.drainPressed();
      for (const action of pressed) {
        if (action === 'start' || action === 'restart' || action === 'jump') {
          if (this.mode === 'title') this.startRun();
          else this.startRun();
        }
      }
      this.rig.update(realDt, this.turkey.x, this.turkey.y, this.farmer.gap);
      this.particles.update(realDt);
      this.world.renderer.render(this.world.scene, this.world.camera);
      return;
    }

    if (this.mode === 'paused') {
      const pressed = this.input.drainPressed();
      for (const action of pressed) {
        if (action === 'pause' || action === 'start') this._resume();
        else if (action === 'restart') this.startRun();
        else if (action === 'mute') this.audio.setMuted(!this.audio.muted);
      }
      this.world.renderer.render(this.world.scene, this.world.camera);
      return;
    }

    if (this.mode === 'playing') {
      this._accumulator += realDt;
      let guard = 0;
      while (this._accumulator >= FIXED_DT && guard < 5) {
        this._tick(FIXED_DT);
        this._accumulator -= FIXED_DT;
        guard++;
      }
      if (guard >= 5) this._accumulator = 0;
      this.rig.update(realDt, this.turkey.x, this.turkey.y, this.farmer.gap);
      this.particles.update(realDt);
      this.world.renderer.render(this.world.scene, this.world.camera);
    }
  }
}

let game;
try {
  game = new Game();
  game.init().catch((err) => showFatal(err));
} catch (err) {
  showFatal(err);
}

// WebGL (or asset) failure must not strand the player on an endless
// loading screen: say so in plain language instead.
function showFatal(err) {
  const el = document.getElementById('loading');
  if (el) {
    el.innerHTML = '<p>🦃 Turkey Run 3D cannot run in this browser.</p>'
      + '<p style="font-size:15px;font-weight:400">WebGL is unavailable — try another browser or enable hardware acceleration.</p>';
  }
  console.error(err);
}
