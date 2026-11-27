// TURKEY RUN 3D — HUD (DOM): score, distance, lives, stage, farmer bar,
// speed, corn count, plus the title / pause / CAUGHT / ESCAPED overlays.
export class Hud {
  constructor(root) {
    this.root = root;
    this.scoreEl = root.querySelector('#hud-score');
    this.distEl = root.querySelector('#hud-distance');
    this.livesEl = root.querySelector('#hud-lives');
    this.stageEl = root.querySelector('#hud-stage');
    this.speedEl = root.querySelector('#hud-speed');
    this.cornEl = root.querySelector('#hud-corn');
    this.farmerFillEl = root.querySelector('#farmer-fill');
    this.farmerLabelEl = root.querySelector('#farmer-label');
    this.overlayEl = root.querySelector('#overlay');
    this.overlayTitleEl = root.querySelector('#overlay-title');
    this.overlaySubEl = root.querySelector('#overlay-sub');
    this.overlayScoreEl = root.querySelector('#overlay-score');
    this.overlayHintEl = root.querySelector('#overlay-hint');
    this.loadingEl = root.querySelector('#loading');
    this.loadingBarEl = root.querySelector('#loading-bar');
    this.toastEl = root.querySelector('#hud-toast');
    this._toastTimer = null;
    this._last = {};
  }

  // Transient centre toast, e.g. "NEAR MISS +5": shows ~0.9 s then fades.
  showToast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 900);
  }

  setLoading(progress) {
    if (this.loadingBarEl) this.loadingBarEl.style.width = `${Math.round(progress * 100)}%`;
  }

  hideLoading() {
    if (this.loadingEl) this.loadingEl.style.display = 'none';
  }

  _set(el, key, value) {
    if (!el || this._last[key] === value) return;
    this._last[key] = value;
    el.textContent = value;
  }

  update(state) {
    this._set(this.scoreEl, 'score', String(state.score));
    this._set(this.distEl, 'dist', `${Math.floor(state.distanceM)} m`);
    this._set(this.stageEl, 'stage', state.stageName);
    this._set(this.speedEl, 'speed', `${state.speed.toFixed(0)} m/s`);
    this._set(this.cornEl, 'corn', `🌽 ${state.corn}`);
    const hearts = '❤'.repeat(state.lives) + '♡'.repeat(Math.max(0, 3 - state.lives));
    this._set(this.livesEl, 'lives', hearts);
    // Farmer proximity bar: green (safe, gap 12+) -> red (danger, gap 0).
    const danger = Math.max(0, Math.min(1, 1 - state.gapM / 12));
    if (this.farmerFillEl) {
      const pct = Math.round(danger * 100);
      if (this._last.farmerPct !== pct) {
        this._last.farmerPct = pct;
        this.farmerFillEl.style.width = `${pct}%`;
        const hue = Math.round(120 - danger * 120);
        this.farmerFillEl.style.background = `hsl(${hue} 80% 45%)`;
      }
    }
    this._set(this.farmerLabelEl, 'farmerLabel',
      state.farmerState === 'SURGE' ? 'FARMER SURGING!' :
      state.farmerState === 'LAG' ? 'Farmer lagging' :
      danger > 0.75 ? 'FARMER CLOSE!' : 'Farmer chasing');
  }

  showOverlay(kind, score, distanceM) {
    if (!this.overlayEl) return;
    this.overlayEl.style.display = 'flex';
    const texts = {
      title: {
        title: '🦃 TURKEY RUN 3D',
        sub: 'Run from the farmer before you become dinner! 1400 m to the forest gate.',
        score: '',
        hint: '← → switch lane  •  SPACE jump  •  ↓ slide  •  P pause  •  M mute\nClick or press ENTER to start',
      },
      paused: {
        title: 'PAUSED',
        sub: 'A short break — the farmer is tired too.',
        score: '',
        hint: 'Press P to continue',
      },
      caught: {
        title: 'DINNER IS SERVED...',
        sub: 'The farmer caught you. Press R to try again.',
        score: `Score: ${score}  •  Distance: ${Math.floor(distanceM)} m`,
        hint: 'Press R or click to try again',
      },
      escaped: {
        title: 'YOU ESCAPED THE STUFFING!',
        sub: 'You escaped the farmer and reached the forest gate. Freedom!',
        score: `Score: ${score}  •  Distance: ${Math.floor(distanceM)} m`,
        hint: 'Press R or click to play again',
      },
    };
    const t = texts[kind] || texts.title;
    this.overlayTitleEl.textContent = t.title;
    this.overlaySubEl.textContent = t.sub;
    this.overlayScoreEl.textContent = t.score;
    this.overlayHintEl.textContent = t.hint;
    this.overlayEl.dataset.screen = kind;
    // ESCAPED only: shrink the headline and pin the whole block to the top
    // so the forest gate stays visible behind the overlay instead of hiding
    // behind a 52 px centred title. Other screens reset to the CSS default.
    if (kind === 'escaped') {
      this.overlayEl.style.justifyContent = 'flex-start';
      this.overlayEl.style.paddingTop = '48px';
      this.overlayTitleEl.style.fontSize = '34px';
      this.overlaySubEl.style.fontSize = '16px';
      this.overlayScoreEl.style.fontSize = '20px';
      this.overlayHintEl.style.fontSize = '14px';
    } else {
      this.overlayEl.style.justifyContent = '';
      this.overlayEl.style.paddingTop = '';
      this.overlayTitleEl.style.fontSize = '';
      this.overlaySubEl.style.fontSize = '';
      this.overlayScoreEl.style.fontSize = '';
      this.overlayHintEl.style.fontSize = '';
    }
  }

  hideOverlay() {
    if (this.overlayEl) this.overlayEl.style.display = 'none';
  }
}
