// TURKEY RUN 3D — input: named actions, edge detection, jump buffering.
// Keyboard + pointer/touch. No gameplay logic lives here, only raw intent.
import { JUMP_BUFFER_SECONDS } from './config.js';

export const ACTIONS = [
  'jump', 'laneLeft', 'laneRight', 'slide', 'pause', 'mute', 'restart', 'start',
];

// Keys that scroll the page when the game has focus; swallow them.
const PREVENTED_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function actionForCode(code) {
  switch (code) {
    case 'Space':
    case 'ArrowUp':
    case 'KeyW':
      return 'jump';
    case 'ArrowLeft':
    case 'KeyA':
      return 'laneLeft';
    case 'ArrowRight':
    case 'KeyD':
      return 'laneRight';
    case 'ArrowDown':
    case 'KeyS':
      return 'slide';
    case 'KeyP':
    case 'Escape':
      return 'pause';
    case 'KeyM':
      return 'mute';
    case 'KeyR':
      return 'restart';
    case 'Enter':
      return 'start';
    default:
      return null;
  }
}

export class Input {
  constructor(target) {
    this.target = target;
    // Edge-triggered queue: each entry is consumed once by the game loop.
    this.pressedQueue = [];
    // Held state, per action. Only 'slide' is read as held.
    this.held = {};
    for (const a of ACTIONS) this.held[a] = false;
    // Time (game clock) of the most recent jump press, for the 0.12 s buffer.
    this.lastJumpPressTime = -Infinity;
    this.onFirstGesture = null;
    this._gestureSeen = false;
    this._onKeyDown = (event) => this._keyDown(event);
    this._onKeyUp = (event) => this._keyUp(event);
    this._onPointerDown = (event) => this._pointerDown(event);
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('pointerdown', this._onPointerDown);
  }

  _noteGesture() {
    if (this._gestureSeen) return;
    this._gestureSeen = true;
    if (typeof this.onFirstGesture === 'function') this.onFirstGesture();
  }

  _keyDown(event) {
    this._noteGesture();
    if (PREVENTED_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    const action = actionForCode(event.code);
    if (!action) return;
    this.held[action] = true;
    this.pressedQueue.push(action);
  }

  _keyUp(event) {
    const action = actionForCode(event.code);
    if (!action) return;
    this.held[action] = false;
  }

  _pointerDown(event) {
    this._noteGesture();
    // A click / tap is the "start" gesture on the title and end screens.
    this.pressedQueue.push('start');
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  // Drain all queued edge presses. Called once per fixed tick.
  drainPressed() {
    const out = this.pressedQueue;
    this.pressedQueue = [];
    return out;
  }

  isHeld(action) {
    return !!this.held[action];
  }

  // Record a jump press against the game clock so the loop can honour the
  // 0.12 s buffer even if the press lands between fixed ticks.
  noteJumpPress(gameTime) {
    this.lastJumpPressTime = gameTime;
  }

  jumpBuffered(gameTime) {
    return gameTime - this.lastJumpPressTime <= JUMP_BUFFER_SECONDS;
  }

  consumeJumpBuffer() {
    this.lastJumpPressTime = -Infinity;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('pointerdown', this._onPointerDown);
  }
}
