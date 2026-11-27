// TURKEY RUN 3D — the farmer: CHASE / SURGE / LAG finite state machine.
// Port of the proven v1 logic: gap equilibrium ~4-5 m, different enter/exit
// thresholds, min 0.5 s per state, 0.3 s reaction delay on transitions.
// The farmer runs behind the turkey at z = -gap; the turkey is at z = 0.
export const FARMER_STATES = ['CHASE', 'SURGE', 'LAG', 'STUMBLE'];

const EQUILIBRIUM_GAP = 4.5;
const SURGE_ENTER_GAP = 3.0;
const SURGE_HOLD_SECONDS = 0.25;
const SURGE_WINDUP_SECONDS = 0.4;
const SURGE_LUNGE_SECONDS = 0.5;
const SURGE_LUNGE_MULTIPLIER = 1.18;
const SURGE_COOLDOWN_SECONDS = 2.0;
const LAG_ENTER_GAP = 12;
const LAG_MAX_SECONDS = 2.5;
const CATCHUP_MULTIPLIER = 1.15;
const CATCHUP_SECONDS = 1.5;
const TOUCH_GAP = 1.5;
const MIN_STATE_SECONDS = 0.5;
const REACTION_DELAY_SECONDS = 0.3;

export class Farmer {
  constructor() {
    this.gap = 6; // metres behind the turkey (FASE 2B: was 8 — closer base)
    this.state = 'CHASE';
    this.mesh = null;
    this._stateTimer = 0;
    this._reactionTimer = 0;
    this._pendingState = null;
    this._surgeHoldTimer = 0;
    this._lagTimer = 0;
    this._catchupTimer = 0;
    this._stumbleTimer = 0;
    this._windupTimer = 0;
    this._lungeTimer = 0;
    this._surgeCooldown = 0;
    this._bobPhase = 0;
  }

  attach(mesh) {
    this.mesh = mesh;
  }

  reset() {
    this.gap = 6; // FASE 2B: was 8
    this.state = 'CHASE';
    this._stateTimer = 0;
    this._reactionTimer = 0;
    this._pendingState = null;
    this._surgeHoldTimer = 0;
    this._lagTimer = 0;
    this._catchupTimer = 0;
    this._stumbleTimer = 0;
    this._windupTimer = 0;
    this._lungeTimer = 0;
    this._surgeCooldown = 0;
  }

  // Called when the turkey is touched: farmer knocked back to gap 6 m.
  knockBack() {
    this.gap = 6;
    this.state = 'STUMBLE';
    this._stumbleTimer = 0.8;
    this._stateTimer = 0;
    this._pendingState = null;
  }

  // Called when the turkey hits an obstacle (slow-down is applied by main).
  // No state change here; the gap closes naturally because the turkey slows.

  _requestState(next) {
    if (next === this.state) return;
    if (this._pendingState === next) return;
    this._pendingState = next;
    this._reactionTimer = REACTION_DELAY_SECONDS;
  }

  _commitState(next) {
    const prev = this.state;
    this.state = next;
    this._stateTimer = 0;
    this._pendingState = null;
    if (next === 'SURGE') {
      this._windupTimer = SURGE_WINDUP_SECONDS;
      this._lungeTimer = 0;
    }
    // FASE 2B cooldown: a surge ends with the gap (~1.9 m) still below the
    // 3.0 m enter threshold, so without this the farmer would re-surge
    // immediately in a loop (verified: 36 surges in one seed-4 run). The
    // 2 s window lets the gap recover above the threshold first; a second
    // hit inside the window still catches the turkey via plain CHASE.
    if (next === 'CHASE' && prev === 'SURGE') this._surgeCooldown = SURGE_COOLDOWN_SECONDS;
    if (next === 'LAG') this._lagTimer = 0;
    if (next === 'CHASE') this._catchupTimer = CATCHUP_SECONDS;
  }

  // Returns 'touch' when the farmer reaches the turkey (gap <= 1.5 m).
  // turkeySpeed is the turkey's CURRENT speed (slowed after a hit, boosted
  // by pie); cruiseSpeed is the stage base speed. The farmer's CHASE pace
  // is anchored to cruiseSpeed, NOT to the slowed speed — otherwise the
  // proportional controller would track the stumble and the gap could never
  // drop below the 4.5 m equilibrium, making SURGE and touch unreachable
  // (verified: full seed-1 run, min gap exactly 4.5, 0 surges).
  // The min-cap keeps the close rate at 3.5 m/s, so one hit pulls the
  // farmer to ~2 m (SURGE telegraphs) but never straight into a touch;
  // a second hit while he is close is what gets the turkey caught.
  update(dt, turkeySpeed, cruiseSpeed) {
    this._stateTimer += dt;
    if (this._surgeCooldown > 0) this._surgeCooldown -= dt;

    // Reaction delay: a requested transition only lands after 0.3 s.
    if (this._pendingState) {
      this._reactionTimer -= dt;
      if (this._reactionTimer <= 0) this._commitState(this._pendingState);
    }

    const canSwitch = this._stateTimer >= MIN_STATE_SECONDS;

    if (this.state === 'STUMBLE') {
      this._stumbleTimer -= dt;
      if (this._stumbleTimer <= 0) this._commitState('CHASE');
      this._applyMesh(dt, 0);
      return null;
    }

    // Transition requests (different enter/exit thresholds = hysteresis).
    if (canSwitch && !this._pendingState) {
      if (this.state === 'CHASE' && this.gap < SURGE_ENTER_GAP && this._surgeCooldown <= 0) {
        this._surgeHoldTimer += dt;
        if (this._surgeHoldTimer >= SURGE_HOLD_SECONDS) {
          this._surgeHoldTimer = 0;
          this._requestState('SURGE');
        }
      } else {
        this._surgeHoldTimer = 0;
      }
      if (this.state === 'CHASE' && this.gap > LAG_ENTER_GAP) {
        this._requestState('LAG');
      }
      if (this.state === 'SURGE' && this._lungeTimer <= 0 && this._windupTimer <= 0) {
        this._requestState('CHASE');
      }
      if (this.state === 'LAG' && this._lagTimer >= LAG_MAX_SECONDS) {
        this._requestState('CHASE');
      }
    }

    // Speed per state. Gap closes when farmerSpeed > turkeySpeed.
    let farmerSpeed;
    if (this.state === 'SURGE') {
      if (this._windupTimer > 0) {
        // Wind-up: visible crouch, farmer holds back while the lunge
        // telegraphs (gap grows a touch, then the lunge eats it back).
        this._windupTimer -= dt;
        farmerSpeed = turkeySpeed * 0.7;
      } else {
        this._lungeTimer += dt;
        farmerSpeed = turkeySpeed * SURGE_LUNGE_MULTIPLIER;
        if (this._lungeTimer >= SURGE_LUNGE_SECONDS) this._lungeTimer = 0;
      }
    } else if (this.state === 'LAG') {
      this._lagTimer += dt;
      farmerSpeed = turkeySpeed * 0.85;
    } else {
      // CHASE: proportional control toward the 4.5 m equilibrium, anchored
      // to cruise speed. Fall-back below equilibrium is slow (gain 0.3) so
      // the farmer stays threatening a while after closing in; catch-up
      // above equilibrium is fast (gain 0.9).
      const gain = this.gap < EQUILIBRIUM_GAP ? 0.3 : 0.9;
      farmerSpeed = cruiseSpeed + (this.gap - EQUILIBRIUM_GAP) * gain;
      // Never outrun the turkey by more than 3.5 m/s: one stumble closes
      // ~2.4 m, a second stumble while close is what causes a touch.
      farmerSpeed = Math.min(farmerSpeed, turkeySpeed + 3.5);
      // Catch-up boost only when the farmer is BEHIND equilibrium: after a
      // SURGE the gap is ~1.9 m (FASE 2B lunge 1.18x / 0.5 s, incl. the
      // 0.3 s exit reaction delay), and a 1.15x boost there would close it
      // to a touch all by itself (a single hit would cost 2 lives).
      if (this._catchupTimer > 0) {
        this._catchupTimer -= dt;
        if (this.gap > EQUILIBRIUM_GAP) {
          farmerSpeed = Math.max(farmerSpeed, turkeySpeed * CATCHUP_MULTIPLIER);
        }
      }
      farmerSpeed = Math.max(0, farmerSpeed);
    }

    this.gap += (turkeySpeed - farmerSpeed) * dt;
    if (this.gap < 0) this.gap = 0;

    this._applyMesh(dt, farmerSpeed);
    if (this.gap <= TOUCH_GAP) return 'touch';
    return null;
  }

  _applyMesh(dt, farmerSpeed) {
    if (!this.mesh) return;
    this.mesh.position.set(0, 0, -this.gap);
    // Run bob; faster when lunging, frozen while stumbling.
    this._bobPhase += dt * (4 + farmerSpeed * 0.9);
    this.mesh.position.y = Math.abs(Math.sin(this._bobPhase)) * 0.08;
    // Wind-up crouch: visible lean forward before the lunge.
    const windingUp = this.state === 'SURGE' && this._windupTimer > 0;
    const targetRotX = windingUp ? 0.35 : this.state === 'STUMBLE' ? -0.25 : 0.08;
    this.mesh.rotation.x += (targetRotX - this.mesh.rotation.x) * 0.3;
  }
}
