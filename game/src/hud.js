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
    this._last = {};
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
      state.farmerState === 'SURGE' ? 'PETANI MENYERBU!' :
      state.farmerState === 'LAG' ? 'Petani tertinggal' :
      danger > 0.75 ? 'PETANI DEKAT!' : 'Petani mengejar');
  }

  showOverlay(kind, score, distanceM) {
    if (!this.overlayEl) return;
    this.overlayEl.style.display = 'flex';
    const texts = {
      title: {
        title: '🦃 TURKEY RUN 3D',
        sub: 'Lari dari petani sebelum jadi makan malam! 1400 m menuju gerbang hutan.',
        score: '',
        hint: '← → pindah lajur  •  SPACE lompat  •  ↓ slide  •  P pause  •  M mute\nKlik atau tekan ENTER untuk mulai',
      },
      paused: {
        title: 'JEDA',
        sub: 'Istirahat sebentar — petani juga capek.',
        score: '',
        hint: 'Tekan P untuk lanjut',
      },
      caught: {
        title: 'DINNER IS SERVED...',
        sub: 'Petani berhasil menangkapmu. Kalkunnya jadi santapan malam.',
        score: `Skor: ${score}  •  Jarak: ${Math.floor(distanceM)} m`,
        hint: 'Tekan R atau klik untuk coba lagi',
      },
      escaped: {
        title: 'YOU ESCAPED THE STUFFING!',
        sub: 'Kamu lolos dari petani dan mencapai gerbang hutan. Merdeka!',
        score: `Skor: ${score}  •  Jarak: ${Math.floor(distanceM)} m`,
        hint: 'Tekan R atau klik untuk main lagi',
      },
    };
    const t = texts[kind] || texts.title;
    this.overlayTitleEl.textContent = t.title;
    this.overlaySubEl.textContent = t.sub;
    this.overlayScoreEl.textContent = t.score;
    this.overlayHintEl.textContent = t.hint;
    this.overlayEl.dataset.screen = kind;
  }

  hideOverlay() {
    if (this.overlayEl) this.overlayEl.style.display = 'none';
  }
}
