// TURKEY RUN 3D — the turkey: lane position, jump physics, slide, lean.
// The turkey stays near z = 0; the world scrolls past it.
import {
  LANES, JUMP_GRAVITY, JUMP_VELOCITY, SLIDE_SECONDS,
  TURKEY_STAND_HEIGHT, TURKEY_SLIDE_HEIGHT,
} from './config.js';

export class Turkey {
  constructor() {
    this.lane = 1; // centre lane
    this.x = LANES[1];
    this.y = 0; // feet height above the ground
    this.vy = 0;
    this.jumping = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.lean = 0; // visual roll, radians, set by update()
    this.mesh = null;
    this._prevX = this.x;
  }

  attach(mesh) {
    this.mesh = mesh;
  }

  get targetX() {
    return LANES[this.lane];
  }

  get height() {
    return this.sliding ? TURKEY_SLIDE_HEIGHT : TURKEY_STAND_HEIGHT;
  }

  moveLane(direction) {
    const next = this.lane + direction;
    if (next < 0 || next > 2) return false;
    this.lane = next;
    return true;
  }

  tryJump() {
    if (this.jumping) return false;
    if (this.sliding) this._endSlide();
    this.jumping = true;
    this.vy = JUMP_VELOCITY;
    return true;
  }

  startSlide() {
    if (this.jumping || this.sliding) return false;
    this.sliding = true;
    this.slideTimer = SLIDE_SECONDS;
    return true;
  }

  _endSlide() {
    this.sliding = false;
    this.slideTimer = 0;
  }

  reset() {
    this.lane = 1;
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.jumping = false;
    this._endSlide();
    this.lean = 0;
    this._prevX = this.x;
  }

  update(dt, slideHeld) {
    // Lane change: exponential approach, time constant ~0.12 s.
    const rate = 1 / 0.12;
    const k = 1 - Math.exp(-rate * dt);
    this._prevX = this.x;
    this.x += (this.targetX - this.x) * k;
    if (Math.abs(this.targetX - this.x) < 0.01) this.x = this.targetX;
    // Lean into the lane change from lateral velocity.
    const lateralSpeed = (this.x - this._prevX) / Math.max(dt, 0.0001);
    const targetLean = Math.max(-0.45, Math.min(0.45, -lateralSpeed * 0.09));
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-10 * dt));

    // Jump physics: gravity from config (airtime ~0.7 s, apex ~1.15 m).
    if (this.jumping) {
      this.vy -= JUMP_GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.jumping = false;
        return 'landed';
      }
    }

    // Slide: held or timed; ends when the timer runs out.
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0 || !slideHeld) this._endSlide();
    }
    return null;
  }

  applyToMesh() {
    if (!this.mesh) return;
    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.z = this.lean;
    // Slide: squash the body down (scale y 0.6) and drop the pivot.
    const targetScaleY = this.sliding ? 0.6 : 1;
    this.mesh.scale.y += (targetScaleY - this.mesh.scale.y) * 0.5;
    this.mesh.position.y = this.y - (this.sliding ? 0.12 : 0);
    // Little run bob when on the ground.
    if (!this.jumping && !this.sliding) {
      this.mesh.rotation.x = Math.sin(performance.now() * 0.02) * 0.03;
    } else {
      this.mesh.rotation.x = 0;
    }
  }
}
