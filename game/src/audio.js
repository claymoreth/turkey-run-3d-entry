// TURKEY RUN 3D — audio: farmer voice lines (vendored ogg) + synth WebAudio SFX.
// AudioContext is created only after the first user gesture; M toggles mute.
const VOICE_FILES = {
  chase: 'audio/jangan-lari.ogg', // "Jangan lari!"
  surge: 'audio/kembali-kau.ogg', // "Kembali kau!"
  caught: 'audio/dapat-kau.ogg', // "Dapat kau!"
  dinner: 'audio/makan-malam.ogg', // "Makan malam sudah siap!"
};

export class AudioManager {
  constructor() {
    this.muted = false;
    this._ctx = null;
    this._master = null;
    this._voice = {};
    this._voiceUnlocked = false;
    for (const [key, file] of Object.entries(VOICE_FILES)) {
      const el = new Audio(file);
      el.preload = 'auto';
      this._voice[key] = el;
    }
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (this._voiceUnlocked) return;
    this._voiceUnlocked = true;
    for (const el of Object.values(this._voice)) {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      el.pause();
      el.currentTime = 0;
      el.muted = this.muted;
    }
    this._ensureContext();
  }

  _ensureContext() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return this._ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    this._ctx = new Ctor();
    this._master = this._ctx.createGain();
    this._master.gain.value = this.muted ? 0 : 0.9;
    this._master.connect(this._ctx.destination);
    return this._ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this._master) this._master.gain.value = muted ? 0 : 0.9;
    for (const el of Object.values(this._voice)) el.muted = muted;
  }

  playVoice(key) {
    if (this.muted) return;
    const el = this._voice[key];
    if (!el) return;
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // --- Synth SFX (all WebAudio, no assets) ---

  _tone(freqStart, freqEnd, seconds, type, volume, when = 0) {
    const ctx = this._ensureContext();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  _noise(seconds, volume, filterFreq, when = 0) {
    const ctx = this._ensureContext();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._master);
    src.start(t0);
  }

  gobble() {
    // Two quick descending clucks.
    this._tone(620, 300, 0.09, 'square', 0.16, 0);
    this._tone(520, 240, 0.11, 'square', 0.16, 0.1);
  }

  jump() {
    this._tone(280, 640, 0.16, 'sine', 0.2);
  }

  land() {
    this._noise(0.08, 0.12, 500);
  }

  corn() {
    this._tone(880, 880, 0.07, 'sine', 0.18, 0);
    this._tone(1318, 1318, 0.1, 'sine', 0.18, 0.07);
  }

  pickup() {
    this._tone(660, 990, 0.12, 'triangle', 0.2, 0);
    this._tone(990, 1320, 0.14, 'triangle', 0.2, 0.1);
  }

  alarm() {
    // Rising warning warble for the firejet telegraph.
    this._tone(440, 880, 0.3, 'sawtooth', 0.08, 0);
    this._tone(880, 440, 0.3, 'sawtooth', 0.08, 0.3);
  }

  hiss() {
    this._noise(0.55, 0.14, 6000);
  }

  hit() {
    this._noise(0.18, 0.3, 900);
    this._tone(180, 60, 0.22, 'sawtooth', 0.22);
  }

  caught() {
    this._tone(392, 392, 0.16, 'square', 0.2, 0);
    this._tone(311, 311, 0.16, 'square', 0.2, 0.16);
    this._tone(233, 180, 0.34, 'square', 0.2, 0.32);
  }

  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, f, 0.22, 'triangle', 0.2, i * 0.13));
  }
}
