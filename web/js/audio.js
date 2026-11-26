/**
 * Pure Web Audio API Procedural Sound & Music Engine for Bizarro Melee.
 * Zero external audio files; unlocks lazily on first user gesture; safe in sandboxed iframes.
 */

// Sixteenth-note motifs (MIDI pitches). Each bar uses its own root and harmonic voicing.
const TRACKS = {
  menu: {
    bpm: 102,
    style: 'celesta',
    roots: [48, 53, 45, 43],
    thirds: [4, 4, 3, 4],
    fifths: [7, 7, 7, 7],
    sevenths: [11, 11, 10, 10],
    ninths: [14, 14, 14, 14],
    lead: 'triangle',
    motif: [76, 0, 0, 79, 0, 74, 0, 72, 0, 0, 67, 0, 71, 0, 74, 0],
    bass: [0, null, 7, null, 12, null, 7, null],
  },
  boss: {
    bpm: 128,
    style: 'brassy',
    roots: [39, 40, 35, 38],
    thirds: [3, 4, 4, 3],
    fifths: [6, 7, 7, 6],
    sevenths: [10, 10, 11, 10],
    ninths: [13, 13, 14, 13],
    lead: 'sawtooth',
    motif: [63, 0, 64, 0, 70, 0, 69, 67, 0, 63, 0, 66, 0, 73, 70, 0],
    bass: [0, 12, 0, 1, 0, 7, 6, 0],
  },
  defeat: {
    bpm: 92,
    style: 'tourney',
    roots: [45, 40, 45],
    thirds: [3, 4, 3],
    fifths: [7, 7, 7],
    sevenths: [10, 10, 10],
    ninths: [14, 13, 14],
    lead: 'triangle',
    finalNote: 57,
    motif: [72, 0, 0, 0, 71, 0, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0],
    bass: [0, null, null, null, 7, null, null, null],
  },
  draw: {
    bpm: 100,
    style: 'tourney',
    roots: [50, 55],
    thirds: [3, 5],
    fifths: [7, 7],
    sevenths: [10, 10],
    ninths: [14, 14],
    lead: 'sine',
    finalNote: 69,
    motif: [69, 0, 0, 0, 65, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    bass: [0, null, null, null, 7, null, null, null],
  },
  victory: {
    finalNote: 84,
    bpm: 132,
    style: 'brassy',
    roots: [48, 53, 55, 48],
    thirds: [4, 4, 4, 4],
    fifths: [7, 7, 7, 7],
    sevenths: [11, 11, 10, 11],
    ninths: [14, 14, 14, 14],
    lead: 'triangle',
    motif: [72, 0, 0, 72, 76, 0, 79, 0, 84, 0, 0, 0, 79, 0, 0, 0],
    bass: [0, null, 7, null, 12, null, null, null],
  },
};

// Four eight-bar sections. Pitches are chord-relative semitones above the bass.
function battleScore(bpm, tonic, minor, lead, style, changes, bass, phrases) {
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const form = [
    0, 1, 2, 3, 4, 5, 6, 7,
    0, 1, 4, 5, 2, 3, 6, 7,
    4, 5, 6, 7, 3, 2, 1, 6,
    0, 3, 4, 5, 2, 6, 7, 0,
  ];
  const degrees = form.map((i) => changes[i]);
  return {
    bpm,
    lead,
    style,
    bass,
    roots: degrees.map((d) => tonic + scale[d]),
    thirds: degrees.map((d) => (scale[(d + 2) % 7] - scale[d] + 12) % 12),
    fifths: degrees.map((d) => (scale[(d + 4) % 7] - scale[d] + 12) % 12),
    sevenths: degrees.map((d) => (scale[(d + 6) % 7] - scale[d] + 12) % 12),
    ninths: degrees.map((d) => ((scale[(d + 1) % 7] - scale[d] + 12) % 12) + 12),
    phrases: phrases.map((phrase) => phrase.split(' ').map((n) => (n === '-' ? null : Number(n)))),
  };
}

TRACKS.battle_tourney = battleScore(142, 45, true, 'triangle', 'tourney', [0, 5, 2, 6, 3, 0, 5, 4], [0, 0, 7, 12, 0, 7, 10, 7], [
  '12 - 19 - 15 17 19 - 22 - 19 - 17 15 - 14',
  '15 - - 19 22 - 24 - 22 19 - 17 - 15 14 -',
  '7 - 10 12 - 15 - 17 19 - 17 15 - 14 10 -',
  '24 - 22 19 - 17 19 - 15 - 17 14 12 - - -',
]);
TRACKS.battle_scifi = battleScore(133, 42, true, 'sawtooth', 'gritty', [0, 1, 5, 0, 6, 3, 4, 1], [0, 12, 7, 0, 12, 7, 1, 7], [
  '12 - - 13 - 19 18 - 12 - 15 - - 13 10 -',
  '- 19 20 - 19 - 13 - 10 - - 12 13 - 15 -',
  '7 - 8 - - 13 12 - 6 - 7 - 13 12 - 10',
  '24 - - 19 18 - 15 13 - 12 13 - 7 - 12 -',
]);
TRACKS.battle_retro = battleScore(156, 48, false, 'square', 'chiptune', [0, 3, 4, 0, 5, 1, 3, 4], [0, null, 7, null, 12, null, 7, 11], [
  '12 16 19 - 24 - 19 - 16 19 21 19 - 16 14 -',
  '19 - 16 12 - 14 16 - 21 - 19 16 14 - 12 -',
  '- 7 12 16 - 19 - 16 7 11 14 - 19 - 14 11',
  '24 - 21 19 16 - 19 - 14 16 19 14 12 - - -',
]);
TRACKS.battle_whimsical = battleScore(119, 53, false, 'sine', 'celesta', [0, 5, 1, 4, 3, 0, 1, 4], [0, null, 12, 7, 0, null, 7, null], [
  '- 16 19 - - 21 - 19 - 14 - 16 12 - - -',
  '19 - - 23 21 - 19 - - 16 17 - 14 - 12 -',
  '7 - 12 - - 9 14 - 11 - - 14 16 - 12 -',
  '- 24 21 - 19 - - 16 17 14 - 11 12 - - -',
]);
TRACKS.battle_final = battleScore(148, 38, true, 'triangle', 'brassy', [0, 5, 3, 4, 0, 2, 6, 4], [0, 7, 0, 12, 0, 7, 3, 10], [
  '12 - - - 15 - 14 12 19 - - 17 15 - 10 -',
  '19 - 22 - - 24 22 19 17 - 15 14 12 - - -',
  '7 10 - 12 14 - 15 - 10 12 - 15 17 - 19 -',
  '24 - - 22 19 17 - 15 14 - 19 14 12 - - -',
]);
TRACKS.battle_temple = battleScore(138, 46, false, 'triangle', 'brassy', [0, 4, 5, 3, 0, 5, 1, 4], [0, 7, 12, 7, 0, 7, 12, 11], [
  '12 - 16 19 - 21 19 16 14 - 16 19 - 24 - -',
  '24 - 23 21 19 - 16 14 16 - 19 - 12 - - -',
  '7 - 11 14 - 16 14 11 12 - 16 19 21 - 19 -',
  '24 - 21 19 16 14 12 14 16 - 19 16 12 - - -',
]);
TRACKS.battle_fountain = battleScore(116, 50, true, 'sine', 'celesta', [0, 3, 6, 2, 5, 1, 4, 0], [0, null, 7, 12, 0, null, 7, 10], [
  '19 - 15 12 - 14 15 19 22 - 19 15 - 14 - -',
  '24 - 22 19 17 - 15 14 12 - 15 19 14 - 12 -',
  '12 15 19 - 22 19 15 12 14 17 20 - 19 - 15 -',
  '24 - 19 15 17 - 14 10 12 - - - - - - -',
]);
TRACKS.battle_arena = battleScore(146, 43, false, 'sawtooth', 'gritty', [0, 4, 5, 3, 0, 4, 3, 4], [0, 0, 7, 0, 12, 7, 5, 7], [
  '12 - 16 19 - 19 21 19 16 - 14 16 19 - - -',
  '24 - 21 19 - 16 14 12 14 - 16 19 21 - 19 -',
  '12 12 - 16 19 - 16 14 12 - 14 16 14 - 12 -',
  '24 - 24 21 19 - 16 19 21 - 19 16 12 - - -',
]);
TRACKS.battle_island = battleScore(134, 52, false, 'triangle', 'celesta', [0, 3, 4, 0, 5, 3, 1, 4], [0, null, 7, 12, 0, null, 7, null], [
  '12 16 19 - 21 19 16 - 14 16 12 - 16 19 - -',
  '24 - 21 19 16 - 14 12 14 16 19 - 16 - 12 -',
  '7 - 12 16 - 19 16 12 14 - 16 19 21 - 19 -',
  '24 21 19 - 16 14 12 - 14 16 19 14 12 - - -',
]);
TRACKS.battle_space = battleScore(140, 44, false, 'sawtooth', 'brassy', [0, 5, 3, 4, 0, 2, 5, 4], [0, 7, 12, 7, 0, 7, 12, 7], [
  '12 - - 19 21 - 19 16 19 - - 24 23 - 19 -',
  '24 - 21 19 16 - 19 21 19 - 16 14 12 - - -',
  '12 14 16 - 19 - 21 19 16 14 12 - 14 16 19 -',
  '24 - - 21 19 - 16 19 21 - 24 23 24 - - -',
]);
TRACKS.battle_brinstar = battleScore(128, 39, true, 'sawtooth', 'gritty', [0, 1, 3, 0, 5, 4, 1, 0], [0, 12, 0, 7, 0, 12, 6, 0], [
  '12 - 15 13 - 12 10 - 12 - 18 19 - 15 13 -',
  '19 - 18 15 13 - 12 10 12 - 15 13 10 - 12 -',
  '7 10 12 - 13 12 10 7 6 7 10 - 13 12 10 -',
  '24 - 22 19 18 - 15 13 12 - 10 12 - - - -',
]);

const STAGE_MUSIC = new Map(Object.entries({
  battle_final: ['final-obligation'],
  battle_temple: ['lowrule-temple', 'great-bay-marina'],
  battle_fountain: ['puddle-of-insomnia', 'slush-summit'],
  battle_arena: ['critter-arena', 'foreclosed-castle'],
  battle_island: ['randalls-tax-shelter', 'yoshis-tax-island', 'tropic-condo-falls', 'jungle-japes-hoa'],
  battle_space: ['corn-area', 'venom-barge', 'rainbow-highway'],
  battle_brinstar: ['acid-vat-basement', 'acid-vat-depths'],
  battle_scifi: ['loud-suburb-highway', 'big-blue-commute'],
  battle_retro: ['corporate-kingdom', 'corporate-kingdom-2', 'flat-screen-calc', 'retro-jungle-64', 'retro-tax-island-64', 'onett-strip-mall', 'fiveside-skyscrapers'],
  battle_whimsical: ['nightmare-suburb', 'green-greens-suburb', 'critter-floats'],
}).flatMap(([track, stages]) => stages.map((stage) => [stage, track])));

const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const KO_STINGERS = {
  doubleKo: [67, 74],
  tripleKo: [67, 74, 79],
  zeroToDeath: [72, 76, 79, 83, 84],
  meteorKo: [79, 72, 64, 43],
};
const VOICES = {
  hero: ['triangle', 220, 1.55],
  heavy: ['sawtooth', 112, 0.66],
  cute: ['sine', 356, 1.72],
  snarky: ['square', 198, 1.26],
  robot: ['square', 154, 0.98],
  mystic: ['sine', 244, 0.78],
};
const COMBO_NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91];

function setParamSmooth(param, value, now, tc) {
  if (!param) return;
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, now, tc);
  } else {
    param.value = value;
  }
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.reverbWet = null;
    this.muted = false;
    this.paused = false;
    this.intensity = 0;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.55;
    this.currentTrack = 'none';
    this.gameCuePlayed = false;
    this.musicTimer = null;
    this.stepIndex = 0;
    this.noiseBuffer = null;
    this.nextChargeTone = new Map();
    this.nextSwingAt = 0;
    this.nextGrabAt = 0;
    this.nextDashAt = 0;
    this.nextLandAt = 0;
    this.nextCheer = 0;
    this.nextGasp = 0;
  }

  _resetTimestamps() {
    this.nextChargeTone.clear();
    this.nextSwingAt = 0;
    this.nextGrabAt = 0;
    this.nextDashAt = 0;
    this.nextLandAt = 0;
    this.nextCheer = 0;
    this.nextGasp = 0;
  }

  _stopSequencer() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  _teardownClosedContext() {
    this._stopSequencer();
    this._resetTimestamps();
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.reverbWet = null;
    this.noiseBuffer = null;
  }

  _isOfflineContext() {
    return Boolean(this.ctx && typeof this.ctx.startRendering === 'function');
  }

  _canPlaySfx() {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state === 'closed') return false;
    if (this.ctx.state === 'suspended' && !this._isOfflineContext()) return false;
    return true;
  }

  _canThrottle(prop, cooldownSec) {
    if (!this.ctx) return false;
    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    const nextAllowed = this[prop] || 0;
    // Recover cleanly if the AudioContext clock reset or jumped backwards.
    if (nextAllowed > now + 2.5) {
      this[prop] = now + cooldownSec;
      return true;
    }
    if (now < nextAllowed) return false;
    this[prop] = now + cooldownSec;
    return true;
  }

  _isIntenseTrack(track = this.currentTrack) {
    return this.intensity >= 0.5 && (track.startsWith('battle_') || track === 'boss');
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'closed') {
        this._teardownClosedContext();
      } else {
        if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this._resetTimestamps();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      if (typeof this.ctx.createBiquadFilter === 'function') {
        this.musicFilter = this.ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 3600;
        this.musicFilter.Q.value = 0.65;
        this.musicGain.connect(this.musicFilter);
        this.musicFilter.connect(this.masterGain);
      } else {
        this.musicFilter = null;
        this.musicGain.connect(this.masterGain);
      }

      // DC-blocked, low-feedback chamber echo bus for studio-depth GameCube music mix.
      // Highpass inside feedback loop prevents DC accumulation and sub-bass mud.
      if (typeof this.ctx.createDelay === 'function' && typeof this.ctx.createBiquadFilter === 'function') {
        const d1 = this.ctx.createDelay(0.3);
        const d2 = this.ctx.createDelay(0.3);
        d1.delayTime.value = 0.068;
        d2.delayTime.value = 0.113;

        const dcBlock = this.ctx.createBiquadFilter();
        dcBlock.type = 'highpass';
        dcBlock.frequency.value = 185;
        dcBlock.Q.value = 0.7;

        const damp = this.ctx.createBiquadFilter();
        damp.type = 'lowpass';
        damp.frequency.value = 1750;
        damp.Q.value = 0.6;

        const fb = this.ctx.createGain();
        fb.gain.value = 0.21;

        const wet = this.ctx.createGain();
        wet.gain.value = 0.20;

        this.musicGain.connect(d1);
        d1.connect(dcBlock);
        dcBlock.connect(damp);
        damp.connect(d2);
        d2.connect(fb);
        fb.connect(d1);
        damp.connect(wet);
        d2.connect(wet);
        wet.connect(this.musicFilter || this.masterGain);
        this.reverbWet = wet;
      }

      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -10;
        if (limiter.knee) limiter.knee.value = 12;
        limiter.ratio.value = 8;
        if (limiter.attack) limiter.attack.value = 0.003;
        if (limiter.release) limiter.release.value = 0.14;
        this.masterGain.connect(limiter);
        limiter.connect(this.ctx.destination);
      } else {
        this.masterGain.connect(this.ctx.destination);
      }

      this._applyGains();
      this._buildNoiseBuffer();
      if (this.currentTrack !== 'none') {
        this._startSequencer();
      }
    } catch {
      this._teardownClosedContext();
    }
  }

  _buildNoiseBuffer() {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return;
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.max(1024, Math.floor(sr * 0.5));
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    // Remove DC mean from noise buffer so filters/echo never accumulate offset.
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const s = Math.random() * 2 - 1;
      data[i] = s;
      sum += s;
    }
    const mean = sum / len;
    for (let i = 0; i < len; i++) {
      data[i] -= mean;
    }
    this.noiseBuffer = buf;
  }

  _applyGains() {
    if (!this.ctx || !this.masterGain || this.ctx.state === 'closed') return;
    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    const intense = this._isIntenseTrack();
    setParamSmooth(this.masterGain.gain, this.muted ? 0 : 1, now, 0.01);
    setParamSmooth(this.sfxGain?.gain, this.sfxVolume, now, 0.01);
    const musicBoost = intense ? 1.07 : 1;
    setParamSmooth(
      this.musicGain?.gain,
      this.musicVolume * 0.35 * musicBoost * (this.paused ? 0.24 : 1),
      now,
      0.025,
    );
    if (this.musicFilter?.frequency) {
      const cutoff = this.paused ? 1550 : (intense ? 5400 : 3600);
      setParamSmooth(this.musicFilter.frequency, cutoff, now, 0.06);
    }
    if (this.reverbWet?.gain) {
      setParamSmooth(this.reverbWet.gain, this.paused ? 0.12 : (intense ? 0.18 : 0.20), now, 0.04);
    }
  }

  setIntensity(level) {
    const next = typeof level === 'boolean'
      ? (level ? 1 : 0)
      : Math.max(0, Math.min(1, Number(level) || 0));
    if (next === this.intensity) return;
    this.intensity = next;
    // Dynamically brighten filter & mix without restarting or hitching the sequencer.
    this._applyGains();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this._applyGains();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._applyGains();
  }

  isMuted() {
    return this.muted;
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._applyGains();
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._applyGains();
  }

  _tone(freqStart, freqEnd, dur, type = 'triangle', gainPeak = 0.25, delay = 0, dest = null, attack = 0) {
    if (!this.ctx || this.muted || this.ctx.state === 'closed') return;
    if (this.ctx.state === 'suspended' && !this._isOfflineContext()) return;
    const target = dest || this.sfxGain;
    if (!target) return;
    const safeDur = Math.max(0.008, Number(dur) || 0.05);
    const safeDelay = Math.max(0, Number(delay) || 0);
    const safePeak = Math.max(0.0002, Math.min(0.85, Number(gainPeak) || 0.05));
    const f0 = Math.max(22, Number(freqStart) || 220);
    const f1 = Math.max(22, Number(freqEnd) || f0);
    const t0 = this.ctx.currentTime + safeDelay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + safeDur);
    }
    const atk = attack > 0 ? Math.min(attack, safeDur * 0.45) : Math.min(0.006, safeDur * 0.18);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(safePeak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + safeDur);
    osc.connect(g);
    g.connect(target);
    osc.start(t0);
    osc.stop(t0 + safeDur + 0.02);
  }

  _noise(dur, freq = 1200, q = 1, gainPeak = 0.2, delay = 0, dest = null, attack = 0, freqEnd = null) {
    if (!this.ctx || !this.noiseBuffer || this.muted || this.ctx.state === 'closed') return;
    if (this.ctx.state === 'suspended' && !this._isOfflineContext()) return;
    const target = dest || this.sfxGain;
    if (!target) return;
    const safeDur = Math.max(0.008, Number(dur) || 0.05);
    const safeDelay = Math.max(0, Number(delay) || 0);
    const safePeak = Math.max(0.0002, Math.min(0.85, Number(gainPeak) || 0.05));
    const f0 = Math.max(40, Math.min(18000, Number(freq) || 1200));
    const t0 = this.ctx.currentTime + safeDelay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const g = this.ctx.createGain();
    const atk = attack > 0 ? Math.min(attack, safeDur * 0.6) : 0;
    g.gain.setValueAtTime(atk ? 0.0001 : safePeak, t0);
    if (atk) g.gain.linearRampToValueAtTime(safePeak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + safeDur);

    if (typeof this.ctx.createBiquadFilter === 'function') {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(f0, t0);
      if (freqEnd != null && Number.isFinite(freqEnd) && freqEnd !== f0) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, Math.min(18000, freqEnd)), t0 + safeDur);
      }
      filter.Q.setValueAtTime(Math.max(0.1, Number(q) || 1), t0);
      src.connect(filter);
      filter.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(target);
    src.start(t0);
    src.stop(t0 + safeDur + 0.02);
  }

  playUi(type) {
    if (type === 'ready' || type === 'go') this.gameCuePlayed = false;
    if (!this._canPlaySfx()) return;
    switch (type) {
      case 'move':
        this._tone(540, 720, 0.05, 'triangle', 0.13);
        this._tone(1080, 1440, 0.032, 'sine', 0.05, 0.004);
        break;
      case 'select':
        this._tone(440, 880, 0.085, 'square', 0.12);
        this._tone(660, 1175, 0.11, 'triangle', 0.15, 0.036);
        this._tone(1320, 1760, 0.09, 'sine', 0.07, 0.055);
        break;
      case 'back':
        this._tone(540, 260, 0.09, 'triangle', 0.15);
        this._tone(360, 195, 0.08, 'sine', 0.08, 0.02);
        break;
      case 'start':
        this._tone(330, 660, 0.10, 'sawtooth', 0.13);
        this._tone(495, 990, 0.12, 'square', 0.12, 0.045);
        this._tone(660, 1320, 0.20, 'triangle', 0.18, 0.09);
        this._tone(990, 1980, 0.18, 'sine', 0.09, 0.11);
        this._noise(0.08, 3200, 1.1, 0.09, 0.09);
        break;
      case 'ready':
        // Authoritative Melee announcer two-step brass + timpani ready stinger
        this._tone(130, 62, 0.14, 'sine', 0.22);
        this._tone(392, 394, 0.13, 'sawtooth', 0.15, 0, null, 0.01);
        this._tone(196, 196, 0.13, 'triangle', 0.14);
        this._tone(145, 58, 0.18, 'sine', 0.25, 0.13);
        this._tone(523.25, 526, 0.22, 'sawtooth', 0.17, 0.13, null, 0.01);
        this._tone(523.25 * 1.005, 523.25, 0.22, 'triangle', 0.15, 0.13);
        this._tone(261.63, 261.63, 0.20, 'square', 0.07, 0.13);
        this._noise(0.065, 2400, 0.9, 0.11, 0.13);
        break;
      case 'go':
        // Explosive Melee "GO!" brass power-chord + sub launch + air burst
        this._tone(165, 38, 0.22, 'sine', 0.34);
        this._tone(523.25, 1046.5, 0.24, 'sawtooth', 0.20, 0, null, 0.008);
        this._tone(783.99, 1567.98, 0.26, 'triangle', 0.17, 0.012);
        this._tone(1046.5, 1052, 0.28, 'sawtooth', 0.14, 0.02);
        this._tone(1567.98, 2093, 0.22, 'sine', 0.09, 0.03);
        this._noise(0.18, 2600, 0.75, 0.18, 0, null, 0.004, 1100);
        break;
      case 'game':
        if (this.gameCuePlayed) break;
        this.gameCuePlayed = true;
        // Dramatic Melee "GAME!" impact: booming timpani + descending brass power cadence
        this._tone(152, 30, 0.44, 'sine', 0.38);
        this._noise(0.30, 1200, 0.65, 0.24, 0, null, 0.004, 420);
        this._tone(659.25, 656, 0.16, 'sawtooth', 0.19, 0, null, 0.008);
        this._tone(493.88, 492, 0.16, 'triangle', 0.15, 0);
        this._tone(440, 220, 0.38, 'sawtooth', 0.20, 0.13, null, 0.01);
        this._tone(329.63, 164.81, 0.38, 'square', 0.12, 0.13);
        this._tone(220, 110, 0.44, 'triangle', 0.22, 0.15);
        this._crowdCheer(0.85);
        break;
    }
  }

  _voice(e, cue) {
    const [wave, base, inflection] = VOICES[e?.voiceType] || VOICES.hero;
    const f = base * (Number.isFinite(e?.voicePitch) ? e.voicePitch : 1);
    const length = cue === 'ko' ? 0.34 : cue === 'taunt' ? 0.22 : 0.105;
    this._tone(f, f * inflection, length * 0.48, wave, 0.085);
    this._tone(f * inflection, f * (cue === 'ko' ? 0.39 : 0.92), length * 0.72, wave, 0.085, length * 0.38);
    this._tone(f * 2.6, f * 1.8, length, 'sine', 0.042);
  }

  _crack() {
    this._tone(116, 28, 0.28, 'sine', 0.34);
    this._noise(0.036, 4900, 0.7, 0.25);
    this._noise(0.115, 1800, 1.05, 0.17, 0.03);
  }

  playStinger(kind) {
    if (!this._canPlaySfx()) return;
    if (kind === 'suddenDeath') {
      for (const note of [31, 38, 43]) {
        this._tone(hz(note - 1), hz(note), 0.74, 'sawtooth', 0.095, 0, null, 0.02);
      }
      this._tone(440, 740, 0.23, 'triangle', 0.17, 0.04);
      this._tone(740, 440, 0.30, 'triangle', 0.17, 0.27);
      this._noise(0.22, 1800, 0.9, 0.12, 0.04, null, 0.02, 700);
      return;
    }
    const notes = KO_STINGERS[kind];
    if (!Array.isArray(notes)) return;
    notes.forEach((note, i) => {
      const last = i === notes.length - 1;
      const delay = i * 0.088;
      this._tone(hz(note), hz(note) * 1.003, last ? 0.38 : 0.12, 'triangle', 0.19, delay);
      this._tone(hz(note) * 1.005, hz(note), last ? 0.34 : 0.11, 'sawtooth', 0.07, delay);
      this._tone(hz(note - 12), hz(note - 12), last ? 0.30 : 0.09, 'square', 0.055, delay);
    });
  }

  _electricZap(rawForce) {
    if (!this._canPlaySfx()) return;
    const force = Math.max(0, Math.min(1, Number(rawForce) || 0.5));
    const ctx = this.ctx;
    const start = ctx.currentTime;
    const end = start + 0.06 + 0.065 * force;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const depth = ctx.createGain();
    const envelope = ctx.createGain();
    carrier.type = 'sawtooth';
    modulator.type = 'square';
    carrier.frequency.setValueAtTime(2050, start);
    carrier.frequency.exponentialRampToValueAtTime(590, end);
    modulator.frequency.setValueAtTime(920, start);
    modulator.frequency.exponentialRampToValueAtTime(230, end);
    depth.gain.setValueAtTime(1120, start);
    depth.gain.exponentialRampToValueAtTime(55, end);
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    envelope.gain.setValueAtTime(0.11 + force * 0.055, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    carrier.connect(envelope);
    envelope.connect(this.sfxGain);
    carrier.start(start);
    modulator.start(start);
    carrier.stop(end + 0.01);
    modulator.stop(end + 0.01);
    this._noise(0.09, 5600, 2.0, 0.15, 0.01, null, 0, 2800);
  }

  _crowdGasp(intensity = 0.7) {
    if (!this._canPlaySfx() || !this._canThrottle('nextGasp', 0.42)) return;
    const lvl = Math.max(0.25, Math.min(1, Number(intensity) || 0.7));
    // Formant-swept "OOOOH!" crowd gasp on big hits / narrow escapes
    this._noise(0.32, 540, 2.2, 0.075 + 0.05 * lvl, 0, null, 0.055, 860);
    this._noise(0.34, 1320, 2.6, 0.06 + 0.045 * lvl, 0.018, null, 0.06, 980);
    this._noise(0.26, 2250, 2.8, 0.04 * lvl, 0.04, null, 0.05, 1650);
  }

  _crowdCheer(intensity = 1) {
    if (!this._canPlaySfx() || !this._canThrottle('nextCheer', 0.36)) return;
    const lvl = Math.max(0.2, Math.min(1, Number(intensity) || 1));
    // Multi-formant GameCube stadium crowd roar + excited applause shimmer
    this._noise(0.18, 1420, 1.4, 0.085 * lvl, 0, null, 0.07, 1750);
    this._noise(0.74, 720, 1.15, 0.095 + 0.085 * lvl, 0.09, null, 0.16, 960);
    this._noise(0.62, 1880, 2.1, 0.065 + 0.045 * lvl, 0.14, null, 0.13, 1420);
    if (lvl >= 0.65) {
      this._noise(0.52, 3400, 1.6, 0.045 * lvl, 0.18, null, 0.12, 2600);
    }
  }

  playHit(hit = {}) {
    if (!this._canPlaySfx()) return;
    const kb = Number.isFinite(hit.kb) ? Math.max(0, hit.kb) : 0;
    const damage = Number.isFinite(hit.damage) ? Math.max(0, hit.damage) : 8;
    const tier = hit.weightTier || (kb >= 145 || (hit.sweetspot && damage >= 20)
      ? 'colossal'
      : (hit.heavy || kb >= 95 || damage >= 14 || hit.sweetspot || hit.meteor)
        ? 'heavy'
        : (kb >= 52 || damage >= 8) ? 'medium' : 'light');
    const force = Number.isFinite(hit.hitWeight)
      ? Math.max(0, Math.min(1, hit.hitWeight))
      : Math.min(1, damage / 42 + kb / 240);
    const heavy = tier === 'heavy' || tier === 'colossal';
    const colossal = tier === 'colossal';

    if (tier === 'light') {
      // Tight, snappy combo-starter pop: high crack + woody knock + tight sub thump
      this._noise(0.015, 3700 + 600 * force, 1.15, 0.18 + 0.07 * force);
      this._tone(330, 128, 0.040, 'triangle', 0.11 + 0.05 * force);
      this._tone(162, 66, 0.050, 'sine', 0.14 + 0.07 * force);
    } else if (tier === 'medium') {
      // Punchy mid-weight Melee thwack: crack + woody body + meaty sub drop
      this._noise(0.024, 2850 + 500 * force, 0.95, 0.24 + 0.11 * force);
      this._tone(385, 130, 0.062, 'triangle', 0.14 + 0.04 * force);
      this._tone(215, 86, 0.048, 'square', 0.055, 0.003);
      this._tone(150, 44, 0.108, 'sine', 0.22 + 0.11 * force);
    } else if (tier === 'heavy') {
      // Heavy Melee smash-hit bass cannon + layered woody thwack + crisp crack
      this._noise(0.032, 4150, 0.80, 0.34);
      this._noise(0.058, 900, 0.92, 0.21, 0.007);
      this._tone(520, 162, 0.068, 'triangle', 0.14);
      this._tone(265, 68, 0.098, 'sawtooth', 0.13, 0.004);
      this._tone(132, 32, 0.215, 'sine', 0.34);
    } else {
      // Colossal finisher: seismic sub-bass drop + crunching body + crystalline shock ring
      this._noise(0.048, 4800, 0.72, 0.42);
      this._noise(0.095, 920, 0.90, 0.35, 0.011);
      this._tone(620, 178, 0.090, 'triangle', 0.16);
      this._tone(255, 56, 0.150, 'sawtooth', 0.18, 0.004);
      this._tone(144, 26, 0.320, 'sine', 0.40);
      this._tone(1560, 1120, 0.23, 'triangle', 0.18, 0.01);
      this._tone(3120, 2240, 0.25, 'sine', 0.11, 0.014);
    }

    // Elemental & special combat layers (all composable, even alongside sweetspots)
    if (hit.electric || hit.element === 'electric' || hit.element === 'lightning') {
      this._electricZap(Math.max(0.45, force));
    }
    if (hit.slash || hit.element === 'slash') {
      this._noise(heavy ? 0.055 : 0.036, 5400, 1.9, heavy ? 0.16 : 0.11, 0, null, 0, 2400);
      this._tone(2940, 1540, heavy ? 0.135 : 0.088, 'triangle', heavy ? 0.16 : 0.11);
      this._tone(4380, 2520, heavy ? 0.165 : 0.105, 'sine', heavy ? 0.11 : 0.075, 0.004);
    }
    if (hit.element === 'fire' || hit.fire) {
      this._noise(0.13, 640, 0.72, heavy ? 0.22 : 0.17, 0, null, 0.005, 340);
      this._noise(0.075, 2900, 1.8, 0.10, 0.016);
      this._tone(290, 96, 0.12, 'sawtooth', 0.11);
    }
    if (hit.element === 'ice' || hit.ice) {
      this._tone(2340, 1680, 0.12, 'sine', 0.12);
      this._tone(3510, 2540, 0.10, 'triangle', 0.08, 0.01);
      this._noise(0.055, 5800, 2.4, 0.10, 0.006);
    }
    if (hit.meteor || hit.trueSpike) {
      this._tone(hit.trueSpike ? 178 : 148, 28, 0.28, 'sawtooth', hit.trueSpike ? 0.25 : 0.19);
      this._tone(hit.trueSpike ? 1040 : 780, 170, 0.17, 'triangle', 0.17, 0.01);
      if (hit.trueSpike) this._tone(132, 24, 0.24, 'sine', 0.26, 0.008);
    }
    if (hit.sweetspot || kb >= 115) {
      this._noise(0.044, 940, 1.2, 0.28);
      this._tone(1320, 940, 0.16, 'triangle', 0.16, 0.008);
      this._tone(2640, 1880, 0.19, 'sine', 0.095, 0.01);
      this._tone(3960, 2820, 0.14, 'sine', 0.05, 0.014);
    }

    // Subtle rising combo shimmer on 2+ hit strings
    if ((hit.comboCount || 0) >= 2) {
      const step = Math.min(COMBO_NOTES.length - 1, hit.comboCount - 2);
      const cf = hz(COMBO_NOTES[step]);
      this._tone(cf, cf * 1.025, 0.095, 'sine', 0.068, 0.012);
      if (hit.comboCount >= 4) {
        this._tone(cf * 1.5, cf * 1.52, 0.085, 'triangle', 0.036, 0.02);
      }
    }

    // Dynamic crowd reactions on huge impacts
    if (kb >= 120 || colossal) {
      this._crowdCheer(Math.min(1, Math.max(0.55, kb / 190)));
    } else if (kb >= 88 || (hit.sweetspot && kb >= 72)) {
      this._crowdGasp(Math.min(1, kb / 130));
    }
  }

  playEvents(events) {
    if (!Array.isArray(events) || !events.length) return;
    if (events.some((e) => e?.type === 'suddenDeath')) {
      this.setIntensity(1);
    }
    if (events.some((e) => e?.type === 'game') && (this.currentTrack.startsWith('battle_') || this.currentTrack === 'boss')) {
      this.setMusic('none');
    }
    if (!this._canPlaySfx()) return;
    for (const e of events) {
      if (!e || !e.type) continue;
      switch (e.type) {
        case 'specialCharge': {
          const now = this.ctx.currentTime;
          const portKey = e.port ?? 0;
          const prev = this.nextChargeTone.get(portKey) ?? 0;
          if (prev <= now + 2.5 && now < prev) break;
          this.nextChargeTone.set(portKey, now + 0.085);
          const electric = e.style === 'electric';
          const progress = Math.max(0, Math.min(1, Number(e.progress) || 0));
          const pitch = (electric ? 410 : e.style === 'dark' ? 73 : 138) * (1 + 1.6 * progress);
          this._tone(pitch, pitch * 1.19, 0.105, electric ? 'square' : 'triangle', 0.078);
          if (e.style === 'fire') this._noise(0.10, 520 + 1800 * progress, 0.8, 0.095);
          break;
        }
        case 'specialLaunch':
          this.nextChargeTone.delete(e.port ?? 0);
          if (e.misfire) {
            this._crack();
            this._noise(0.38, 450, 0.65, 0.32);
          } else if (e.style === 'fire') {
            this._tone(145, 42, 0.23, 'sawtooth', 0.17);
            this._noise(0.29, 870, 0.65, 0.26);
          } else {
            this._tone(e.style === 'dark' ? 170 : 620, 76, 0.19, 'triangle', 0.18);
            this._noise(0.13, 2400, 1.1, 0.17);
          }
          break;
        case 'quickZip':
          this._tone(e.stage === 2 ? 2600 : 1950, 380, 0.075, 'square', 0.11);
          this._noise(0.025, 5600, 1.5, 0.20);
          break;
        case 'teleportFlash': {
          const entering = e.phase === 'in';
          this._tone(entering ? 350 : 1200, entering ? 1550 : 190, 0.15, 'sine', 0.18);
          this._noise(entering ? 0.045 : 0.12, entering ? 2900 : 1500, 2, 0.17);
          break;
        }
        case 'afterimage':
          this._tone(1060, 380, 0.044, 'sawtooth', 0.064);
          break;
        case 'suddenDeath':
        case 'doubleKo':
        case 'tripleKo':
        case 'zeroToDeath':
        case 'meteorKo':
          this.playStinger(e.type);
          break;
        case 'hit':
          this.playHit(e);
          break;
        case 'attackSwing': {
          if (!this._canThrottle('nextSwingAt', 0.036)) break;
          const tier = e.weightTier || 'medium';
          if (e.slash) {
            this._noise(tier === 'heavy' ? 0.12 : 0.072, tier === 'heavy' ? 3100 : 4100, 1.9, tier === 'heavy' ? 0.15 : 0.10, 0, null, 0.005, tier === 'heavy' ? 1400 : 2100);
            this._tone(tier === 'heavy' ? 2040 : 2880, tier === 'heavy' ? 760 : 1240, tier === 'heavy' ? 0.11 : 0.065, 'triangle', 0.065);
          } else if (e.fire) {
            this._noise(0.12, 780, 0.75, 0.15, 0, null, 0.009, 420);
            this._tone(245, 92, 0.11, 'sawtooth', 0.07);
          } else if (e.electric) {
            this._noise(0.06, 4800, 2.2, 0.11);
            this._tone(1440, 680, 0.065, 'square', 0.055);
          } else if (tier === 'heavy') {
            this._noise(0.145, 760, 0.8, 0.17, 0, null, 0.013, 380);
            this._tone(215, 64, 0.135, 'triangle', 0.095);
          } else if (tier === 'medium') {
            this._noise(0.085, 1420, 1.0, 0.12, 0, null, 0.008, 760);
            this._tone(345, 140, 0.075, 'triangle', 0.06);
          } else {
            this._noise(0.048, 2650, 1.25, 0.085, 0, null, 0.004, 1500);
            this._tone(530, 240, 0.045, 'sine', 0.042);
          }
          break;
        }
        case 'grabSwing':
          if (!this._canThrottle('nextGrabAt', 0.045)) break;
          this._noise(0.068, 1850, 1.35, 0.115, 0, null, 0.006, 950);
          this._tone(470, 205, 0.060, 'triangle', 0.065);
          this._tone(920, 620, 0.028, 'sine', 0.042, 0.026);
          break;
        case 'clank':
          this._noise(0.032, 4800, 1.8, 0.22);
          this._tone(1520, 1180, 0.14, 'triangle', 0.18);
          this._tone(2290, 1780, 0.12, 'sine', 0.14, 0.004);
          this._tone(3340, 2610, 0.09, 'square', 0.06, 0.008);
          break;
        case 'heavyAttack':
          this._voice(e, 'attack');
          break;
        case 'crowdCheer':
          this._crowdCheer(Number.isFinite(e.intensity) ? Math.max(0, Math.min(1, e.intensity)) : 1);
          break;
        case 'crowdGasp':
          this._crowdGasp(Number.isFinite(e.intensity) ? Math.max(0, Math.min(1, e.intensity)) : 0.75);
          break;
        case 'bounce': {
          const power = Number.isFinite(e.intensity)
            ? Math.max(0.25, Math.min(1, e.intensity))
            : Number.isFinite(e.speed)
              ? Math.max(0.25, Math.min(1, Math.abs(e.speed) / 14))
              : 0.72;
          // Heavy floor/wall bounce thud + stage wood knock + dust puff
          this._tone(132 - 22 * power, 36, 0.11 + 0.07 * power, 'sine', 0.20 + 0.12 * power);
          this._tone(248, 86, 0.065 + 0.03 * power, 'triangle', 0.12 + 0.06 * power);
          this._noise(0.05 + 0.03 * power, 820, 0.9, 0.13 + 0.08 * power);
          break;
        }
        case 'counter':
          this._noise(0.025, 2800, 1.3, 0.18);
          this._tone(1320, 660, 0.075, 'square', 0.11);
          this._tone(440, 880, 0.115, 'triangle', 0.16, 0.038);
          break;
        case 'reflect':
          this._tone(620, 2520, 0.09, 'sine', 0.20);
          this._tone(1180, 3160, 0.07, 'triangle', 0.09, 0.022);
          break;
        case 'absorb':
          this._tone(320, 980, 0.09, 'sine', 0.19);
          this._tone(540, 1480, 0.11, 'triangle', 0.14, 0.025);
          break;
        case 'tether':
          this._tone(880, 1980, 0.08, 'sawtooth', 0.14);
          this._noise(0.035, 3600, 1.5, 0.12);
          break;
        case 'grabRelease':
          this._tone(360, 740, 0.075, 'triangle', 0.15);
          this._noise(0.03, 2100, 1.2, 0.12);
          break;
        case 'phantomHit':
          this._tone(2180, 3260, 0.07, 'sine', 0.14);
          this._noise(0.018, 5200, 2.0, 0.11);
          break;
        case 'starKo':
          this._tone(1680, 520, 0.65, 'sine', 0.16);
          this._tone(2200, 3300, 0.14, 'triangle', 0.15, 0.72);
          break;
        case 'freeze':
          // Icy crystallize chime cluster + frost crackle
          this._noise(0.095, 5600, 2.1, 0.17, 0, null, 0.004, 3200);
          this._noise(0.045, 8400, 2.6, 0.11, 0.028);
          this._tone(1760, 2637, 0.13, 'sine', 0.14);
          this._tone(2637, 3951, 0.14, 'triangle', 0.11, 0.016);
          this._tone(3520, 5274, 0.15, 'sine', 0.09, 0.034);
          this._tone(4435, 3136, 0.18, 'sine', 0.065, 0.052);
          break;
        case 'chargeStored':
          this._tone(698, 698, 0.06, 'triangle', 0.16);
          this._tone(1046, 1046, 0.12, 'sine', 0.17, 0.052);
          break;
        case 'armor':
          this._tone(177, 110, 0.13, 'triangle', 0.22);
          this._tone(927, 913, 0.09, 'sine', 0.13);
          this._noise(0.026, 1380, 1.9, 0.18);
          break;
        case 'jabReset':
          this._noise(0.022, 3900, 1.0, 0.18);
          this._tone(870, 290, 0.055, 'triangle', 0.18, 0.02);
          break;
        case 'shieldHit':
          this._tone(e.heavy ? 640 : 760, e.heavy ? 320 : 440, e.heavy ? 0.10 : 0.075, 'triangle', e.heavy ? 0.22 : 0.17);
          this._noise(e.heavy ? 0.075 : 0.05, 2700, 2.0, e.heavy ? 0.17 : 0.13);
          break;
        case 'shieldBreak':
          // Glassy shatter burst + pop drop + iconic Melee dizzy warble
          this._noise(0.055, 5800, 1.4, 0.30);
          this._noise(0.28, 2400, 0.65, 0.28, 0.012, null, 0, 1100);
          this._tone(3920, 2240, 0.08, 'triangle', 0.16);
          this._tone(5240, 3180, 0.09, 'sine', 0.13, 0.014);
          this._tone(2960, 1640, 0.11, 'sine', 0.11, 0.032);
          this._tone(940, 135, 0.32, 'sawtooth', 0.24);
          this._tone(620, 118, 0.36, 'square', 0.16, 0.05);
          // Dizzy warble tail
          this._tone(520, 660, 0.095, 'sine', 0.11, 0.18);
          this._tone(660, 470, 0.10, 'triangle', 0.10, 0.27);
          this._tone(470, 610, 0.10, 'sine', 0.09, 0.36);
          this._tone(610, 440, 0.12, 'triangle', 0.08, 0.45);
          this._crowdGasp(0.95);
          break;
        case 'ko':
          this._voice(e, 'ko');
          this._noise(0.45, 520, 0.5, 0.38);
          this._tone(210, 38, 0.42, 'sawtooth', 0.34);
          if (e.star) {
            this._tone(1200, 320, 0.48, 'sine', 0.18, 0.08);
          } else {
            this._tone(520, 880, 0.22, 'triangle', 0.16, 0.14);
          }
          break;
        case 'tech':
          if (e.tech === 'PARRY') {
            this._tone(1320, 2240, 0.12, 'triangle', 0.22);
            this._tone(1980, 2960, 0.14, 'sine', 0.16, 0.015);
          } else if (e.tech === 'JAB RESET') {
            this._noise(0.02, 3800, 1.1, 0.16);
            this._tone(860, 320, 0.055, 'triangle', 0.16, 0.015);
          } else if (e.tech === 'CROUCH CANCEL') {
            this._tone(180, 115, 0.08, 'triangle', 0.15);
          } else if (e.tech === 'FLOAT CANCEL') {
            this._tone(1180, 1620, 0.06, 'sine', 0.10);
          } else if (e.tech === 'WAVELAND') {
            this._noise(0.065, 2250, 1.3, 0.13);
            this._tone(420, 240, 0.06, 'sine', 0.09);
          } else if (e.tech === 'LEDGEDASH') {
            this._tone(880, 1760, 0.085, 'triangle', 0.15);
            this._noise(0.055, 2600, 1.2, 0.12);
          } else if (e.tech === 'TECH' || e.tech === 'TECH ROLL' || e.tech === 'WALL TECH' || e.tech === 'WALL TECH JUMP') {
            this._tone(740, 1480, 0.095, 'triangle', 0.17);
            this._tone(1110, 2220, 0.09, 'sine', 0.12, 0.02);
          } else if (e.tech === 'SHIELD POKE') {
            this._noise(0.03, 3400, 1.0, 0.20);
            this._tone(540, 190, 0.08, 'sawtooth', 0.15);
          } else if (e.tech === 'PIVOT') {
            this._noise(0.024, 2900, 1.6, 0.075);
          } else {
            this._noise(0.018, 3400, 1.8, 0.045);
            this._tone(1050, 1330, 0.045, 'sine', 0.055);
          }
          break;
        case 'meteorCancel':
          this._tone(420, 1120, 0.11, 'triangle', 0.18);
          this._tone(840, 1680, 0.10, 'sine', 0.12, 0.025);
          break;
        case 'comboCallout': {
          const root = hz(62 + Math.min(12, e.count || 2));
          for (const [i, ratio] of [1, 1.25, 1.5, 2].entries()) {
            this._tone(root * ratio, root * ratio * 1.025, 0.16, 'triangle', 0.085, 0.035 * i);
          }
          if ((e.count || 0) >= 4) this._crowdCheer(Math.min(1, (e.count - 2) / 5));
          break;
        }
        case 'stageTransform':
          [392, 494, 587, 784].forEach((note, i) =>
            this._tone(note * 0.96, note, 0.24, 'triangle', 0.14, i * 0.07));
          break;
        case 'warpPipe':
          this._tone(680, 165, 0.11, 'square', 0.07);
          this._tone(180, 760, 0.14, 'triangle', 0.15, 0.105);
          break;
        case 'barrelLaunch':
          this._noise(0.07, 1050, 1.1, 0.24);
          this._tone(162, 48, 0.19, 'sine', 0.27);
          this._tone(440, 185, 0.045, 'triangle', 0.15);
          break;
        case 'dramaticFinish':
          this._tone(118, 31, 0.58, 'sine', 0.38);
          this._noise(0.32, 240, 0.8, 0.28);
          this._tone(740, 2380, 0.30, 'triangle', 0.11, 0.04);
          this._tone(1110, 3570, 0.38, 'sine', 0.085, 0.08);
          break;
        case 'wavedash':
          this._noise(0.08, 2000, 1.4, 0.14);
          this._tone(340, 190, 0.07, 'sine', 0.1);
          break;
        case 'lCancel':
          this._tone(980, 1480, 0.055, 'sine', 0.11);
          break;
        case 'jump':
          this._tone(e.doubleJump ? 380 : 260, e.doubleJump ? 760 : 540, 0.09, 'triangle', 0.12);
          break;
        case 'dash':
          if (!this._canThrottle('nextDashAt', 0.028)) break;
          // Crisp sneaker bite + turf burst + subtle push-off thump
          this._noise(0.038, 3300, 1.65, 0.125, 0, null, 0.004, 1850);
          this._noise(0.072, 1650, 0.9, 0.145, 0.006, null, 0.006, 920);
          this._tone(152, 74, 0.038, 'sine', 0.072);
          break;
        case 'land': {
          if (!this._canThrottle('nextLandAt', 0.024)) break;
          const force = Math.max(0.15, Math.min(1, ((e.speed ?? 4) * (e.weight ?? 100)) / 1900));
          // Weight-scaled thump + crisp stage contact scuff
          this._noise(0.032 + force * 0.052, 1320 - 520 * force, 1.05, 0.08 + 0.14 * force);
          this._tone(128 - 26 * force, 42, 0.048 + 0.11 * force, 'sine', 0.065 + 0.20 * force);
          if (force > 0.55) {
            this._tone(210, 78, 0.055, 'triangle', 0.08 * force, 0.003);
          }
          break;
        }
        case 'emptyClick':
          this._noise(0.022, 3100, 1.8, 0.14);
          this._tone(830, 410, 0.018, 'triangle', 0.1);
          break;
        case 'bombTick':
          this._tone(e.fuse <= 18 ? 1860 : 1240, 920, 0.042, 'square', 0.085);
          this._noise(0.016, 4200, 1.2, 0.12);
          break;
        case 'bossPhase':
          [43, 46, 52].forEach((n, i) => this._tone(hz(n), hz(n + 1), 0.20, 'sawtooth', 0.13, i * 0.10));
          break;
        case 'bossWakeup':
          this._tone(180, 560, 0.16, 'triangle', 0.13);
          break;
        case 'stageTransformWarn':
          this._tone(440, 440, 0.12, 'sine', 0.12);
          this._tone(554, 554, 0.16, 'sine', 0.12, 0.16);
          break;
        case 'ledgeGrab':
          this._tone(780, 1120, 0.06, 'square', 0.12);
          break;
        case 'shine':
          // Iconic crisp electronic blip!
          this._tone(1320, 1760, 0.055, 'square', 0.22);
          this._tone(1980, 2640, 0.07, 'triangle', 0.16, 0.02);
          break;
        case 'projectile':
          if (e.style === 'laser' || e.style === 'needle') {
            this._tone(1400, 420, 0.07, 'sawtooth', 0.14);
          } else if (e.style === 'bolt') {
            this._tone(920, 1840, 0.08, 'square', 0.14);
          } else {
            this._tone(460, 220, 0.09, 'triangle', 0.14);
          }
          break;
        case 'judge':
          if (e.num === 9) {
            this._crack();
            this._tone(880, 1760, 0.18, 'square', 0.26);
            this._tone(1320, 2640, 0.24, 'sawtooth', 0.24, 0.05);
          } else {
            this._tone(300 + (e.num || 1) * 70, 360 + (e.num || 1) * 70, 0.09, 'square', 0.15);
          }
          break;
        case 'taunt':
          this._voice(e, 'taunt');
          break;
        case 'barrierBreak':
          this._noise(0.038, 6100, 0.85, 0.32);
          this._tone(4720, 3480, 0.065, 'triangle', 0.18);
          this._tone(6380, 5120, 0.072, 'sine', 0.13, 0.018);
          this._tone(3190, 2530, 0.11, 'sine', 0.095, 0.052);
          break;
        case 'homerunPing':
          this._crack();
          this._tone(1680, 1660, 0.48, 'sine', 0.34);
          this._tone(2520, 2490, 0.42, 'triangle', 0.24, 0.005);
          this._noise(0.18, 1200, 0.8, 0.32);
          break;
        case 'powershield':
          this._tone(1240, 2100, 0.14, 'triangle', 0.25);
          this._tone(1860, 2790, 0.16, 'sine', 0.2, 0.02);
          break;
        case 'smashCharge':
          this._tone(220, 480, 0.16, 'sawtooth', 0.12);
          break;
        case 'explosion':
          this._noise(0.42, 380, 0.45, 0.42);
          this._tone(160, 32, 0.4, 'sawtooth', 0.36);
          break;
        case 'itemPickup':
          this._noise(0.015, 3400, 1.8, 0.07);
          this._tone(540, 880, 0.055, 'triangle', 0.14);
          this._tone(880, 1320, 0.085, 'sine', 0.13, 0.032);
          break;
        case 'itemThrow':
          this._noise(0.072, 2250, 1.15, 0.13, 0, null, 0.006, 980);
          this._tone(560, 220, 0.078, 'triangle', 0.14);
          break;
        case 'summon':
          this._tone(523.3, 659.3, 0.12, 'triangle', 0.18);
          this._tone(784, 1046.5, 0.18, 'square', 0.16, 0.08);
          break;
        case 'targetBreak':
          this._noise(0.12, 3200, 1.4, 0.24);
          this._tone(1100, 1980, 0.12, 'square', 0.18);
          break;
        case 'walljump':
          this._tone(360, 740, 0.08, 'triangle', 0.16);
          break;
        case 'game':
          this.playUi('game');
          break;
        case 'go':
          this.playUi('go');
          break;
      }
    }
  }

  setMusic(track, stageId) {
    if (track === 'battle') track = STAGE_MUSIC.get(stageId) ?? 'battle_tourney';
    if (!track || track === 'none' || track === 'menu' || track === 'victory' || track === 'defeat' || track === 'draw') {
      if (this.intensity !== 0) {
        this.intensity = 0;
      }
    }
    if (this.currentTrack === track) {
      this._applyGains();
      return;
    }
    this.currentTrack = track || 'none';
    this._stopSequencer();
    this.nextChargeTone.clear();
    this.stepIndex = 0;
    this._applyGains();
    if (this.currentTrack !== 'none' && this.ctx && this.ctx.state !== 'closed') {
      this._startSequencer();
    }
  }

  _startSequencer() {
    this._stopSequencer();
    if (!this.ctx || this.ctx.state === 'closed' || this.currentTrack === 'none') return;
    const track = this.currentTrack;
    const score = TRACKS[track] || TRACKS.menu;
    const step = 60 / (score.bpm * 4);
    let next = this.ctx.currentTime + 0.015;
    const schedule = () => {
      if (!this.ctx || this.ctx.state === 'closed') {
        this._stopSequencer();
        return;
      }
      if (this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (!Number.isFinite(next) || next > now + 0.5) next = now + 0.015;
      next = Math.max(next, now);
      let stepsThisTick = 0;
      while (next < now + 0.095 && stepsThisTick < 8) {
        const idx = this.stepIndex++;
        if (!this.muted) {
          this._musicStep(track, score, idx, step, next - now);
        }
        next += step;
        stepsThisTick++;
        if (score.finalNote && this.stepIndex >= score.roots.length * 16) {
          this._stopSequencer();
          return;
        }
      }
    };
    this.musicTimer = setInterval(schedule, 40);
    if (typeof this.musicTimer?.unref === 'function') this.musicTimer.unref();
    schedule();
  }

  _synthLead(freq, dur, wave, gainPeak, delay, bus, style = 'tourney', intense = false) {
    if (style === 'brassy') {
      // Heroic brassy detuned triple-layer fanfare synth
      this._tone(freq, freq * 1.001, dur, 'sawtooth', gainPeak * 0.82, delay, bus, 0.014);
      this._tone(freq * 1.0046, freq * 1.0025, dur * 0.96, 'sawtooth', gainPeak * 0.54, delay, bus, 0.016);
      this._tone(freq * 0.9965, freq * 0.998, dur * 0.98, 'triangle', gainPeak * 0.58, delay, bus, 0.012);
      if (intense) {
        this._tone(freq * 2, freq * 2.002, dur * 0.72, 'triangle', gainPeak * 0.24, delay, bus, 0.01);
      }
      return;
    }
    if (style === 'celesta') {
      // Sparkling celesta/bell shimmer with crystalline overtones
      this._tone(freq, freq, dur * 0.92, 'sine', gainPeak * 0.88, delay, bus, 0.003);
      this._tone(freq * 1.002, freq, dur * 0.80, 'triangle', gainPeak * 0.48, delay, bus, 0.003);
      this._tone(freq * 2, freq * 2, dur * 0.46, 'sine', gainPeak * (intense ? 0.40 : 0.32), delay, bus, 0.002);
      this._tone(freq * 3, freq * 3, dur * 0.22, 'sine', gainPeak * (intense ? 0.17 : 0.12), delay + 0.003, bus, 0.002);
      return;
    }
    if (style === 'gritty') {
      // Punchy aggressive stadium/alien synth-rock lead
      this._tone(freq, freq * 1.0015, dur, 'sawtooth', gainPeak * 0.86, delay, bus, 0.005);
      this._tone(freq * 1.0035, freq * 1.001, dur * 0.86, 'square', gainPeak * 0.34, delay, bus, 0.004);
      if (intense) {
        this._tone(freq * 2, freq * 2, dur * 0.65, 'sawtooth', gainPeak * 0.19, delay, bus, 0.004);
      }
      return;
    }
    if (style === 'chiptune') {
      // Crisp GameCube-retro pulse-square lead
      this._tone(freq, freq, dur * 0.78, 'square', gainPeak * 0.84, delay, bus, 0.002);
      this._tone(freq * 1.0028, freq * 1.001, dur * 0.70, 'square', gainPeak * 0.28, delay, bus, 0.002);
      if (intense) {
        this._tone(freq * 2, freq * 2, dur * 0.50, 'square', gainPeak * 0.18, delay, bus, 0.002);
      }
      return;
    }
    // Classic dual-detuned GameCube orchestral/synth lead body
    this._tone(freq, freq * 1.001, dur, wave, gainPeak, delay, bus, 0.006);
    const subWave = wave === 'sawtooth' ? 'triangle' : 'sine';
    this._tone(freq * 1.004, freq * 1.002, dur * 0.92, subWave, gainPeak * 0.52, delay, bus, 0.006);
    if (intense) {
      this._tone(freq * 2, freq * 2.002, dur * 0.68, 'sine', gainPeak * 0.24, delay, bus, 0.005);
    }
  }

  _synthBass(freq, dur, delay, bus, style = 'tourney', intense = false) {
    if (style === 'gritty') {
      this._tone(freq * 1.02, freq, dur * 0.96, 'triangle', 0.26, delay, bus, 0.003);
      this._tone(freq, freq * 0.996, dur * 0.74, 'sawtooth', intense ? 0.11 : 0.09, delay, bus, 0.003);
      this._tone(freq * 2, freq * 2, dur * 0.44, 'sawtooth', intense ? 0.075 : 0.058, delay, bus, 0.002);
      return;
    }
    if (style === 'chiptune') {
      this._tone(freq, freq, dur * 0.88, 'triangle', 0.26, delay, bus, 0.002);
      this._tone(freq * 2, freq * 2, dur * 0.30, 'square', 0.044, delay, bus, 0.002);
      return;
    }
    if (style === 'brassy') {
      this._tone(freq * 1.012, freq, dur * 1.04, 'triangle', 0.26, delay, bus, 0.008);
      this._tone(freq * 2, freq * 2, dur * 0.68, 'sawtooth', intense ? 0.062 : 0.048, delay, bus, 0.006);
      return;
    }
    this._tone(freq * 1.015, freq, dur, 'triangle', 0.25, delay, bus, 0.004);
    this._tone(freq * 2, freq * 2, dur * 0.48, 'sawtooth', intense ? 0.052 : 0.040, delay, bus, 0.003);
  }

  _harmonyTone(melodySemis, third, fifth, seventh) {
    const chord = [0, third, fifth, seventh, 12, 12 + third, 12 + fifth, 12 + seventh, 24];
    for (let k = chord.length - 1; k >= 0; k--) {
      if (chord[k] <= melodySemis - 3) return chord[k];
    }
    return melodySemis - 5;
  }

  _musicStep(track, score, stepIndex, beat, delay) {
    const i = stepIndex % 16;
    const bar = Math.floor(stepIndex / 16) % score.roots.length;
    const root = score.roots[bar];
    const third = score.thirds[bar] ?? 4;
    const fifth = score.fifths?.[bar] ?? 7;
    const seventh = score.sevenths?.[bar] ?? 10;
    const ninth = score.ninths?.[bar] ?? 14;
    const style = score.style || 'tourney';
    const bus = this.musicGain;
    const lastChord = Boolean(score.finalNote && bar === score.roots.length - 1);
    const intense = this._isIntenseTrack(track);
    if (lastChord && i > 0) return;

    const section = score.phrases ? ((bar >> 3) % score.phrases.length) : (bar % 2);
    const motif = score.phrases?.[section] ?? score.motif;
    const melody = motif[i];
    const hasMelody = score.phrases ? melody != null : melody > 0;

    // 1. Lead melody + Phrase B/D counter-melody harmony
    if (hasMelody) {
      const midi = lastChord
        ? score.finalNote
        : (score.phrases ? root + melody : melody + root - score.roots[0]);
      const f = hz(midi);
      this._synthLead(f, lastChord ? 1.25 : beat * 1.58, score.lead, 0.105, delay, bus, style, intense);

      // Counter-melody harmony on Phrase B (section 1) and Phrase D (section 3), or alternate bars on menu/boss
      const counterActive = !lastChord && (
        (score.phrases && (section === 1 || section === 3)) ||
        (!score.phrases && (track === 'menu' || track === 'boss') && bar % 2 === 1)
      );
      if (counterActive) {
        const rel = score.phrases ? melody : (midi - root);
        const harmSemi = (style === 'celesta' && section === 3)
          ? rel + third
          : this._harmonyTone(rel, third, fifth, seventh);
        const hf = hz(root + harmSemi);
        const hWave = style === 'chiptune' ? 'square' : (style === 'brassy' ? 'triangle' : 'sine');
        this._tone(hf, hf * 1.001, beat * 1.45, hWave, intense ? 0.062 : 0.048, delay + 0.004, bus, 0.008);
      }
    } else if (!lastChord && score.phrases && section === 3 && (i === 2 || i === 6 || i === 10 || i === 14)) {
      // Subtle call-and-response counter-voice during Phrase D rests
      const answerIntervals = [fifth, seventh, 12, 12 + third];
      const af = hz(root + 12 + answerIntervals[(i >> 2) % 4]);
      const aWave = style === 'brassy' ? 'sawtooth' : (style === 'chiptune' ? 'square' : 'triangle');
      this._tone(af, af, beat * 0.92, aWave, intense ? 0.046 : 0.036, delay, bus, 0.006);
    }

    // 2. Rich harmonic chord pad on beats 1 and 3 with 7th & 9th color tones
    if (i === 0 || i === 8) {
      const padDur = lastChord ? 1.45 : beat * 7.8;
      const padWave = style === 'chiptune' ? 'square' : 'triangle';
      const padGain = style === 'chiptune' ? 0.042 : 0.072;
      for (const interval of [0, third, fifth]) {
        const f = hz(root + 12 + interval);
        this._tone(f * 0.9985, f, padDur, padWave, padGain, delay, bus, 0.012);
      }
      // 7th color tone on every chord
      const f7 = hz(root + 12 + seventh);
      this._tone(f7, f7 * 1.001, padDur * 0.92, 'sine', style === 'chiptune' ? 0.028 : 0.044, delay, bus, 0.015);
      // 9th shimmer color tone on downbeats, final chords, or intense / B-D sections
      if (lastChord || i === 0 || section >= 1 || intense) {
        const f9 = hz(root + 12 + ninth);
        this._tone(f9, f9, padDur * 0.82, 'sine', lastChord ? 0.045 : 0.030, delay + 0.006, bus, 0.018);
      }
      // Extra triumphant brass chord swell on victory final hit
      if (lastChord && track === 'victory') {
        for (const interval of [0, third, fifth, 12]) {
          const bf = hz(root + 12 + interval);
          this._tone(bf, bf * 1.002, 1.35, 'sawtooth', 0.055, delay, bus, 0.018);
        }
      }
    }

    // 3. Track-character arpeggios & sparkling shimmer
    if (!lastChord) {
      if (style === 'chiptune' && (i % 2 === 1 || intense)) {
        // Crisp chiptune square arpeggios
        const arp = [0, third, fifth, 12, seventh, 12 + third][i % 6];
        const af = hz(root + 12 + arp);
        this._tone(af, af, beat * 0.56, 'square', intense ? 0.054 : 0.046, delay, bus, 0.002);
      } else if (style === 'celesta' && (i % 2 === 1 || (intense && i % 4 === 2))) {
        // Sparkling celesta/bell arpeggio shimmer
        const arp = [0, third, fifth, seventh, 12][(i >> 1) % 5];
        const af = hz(root + 24 + arp);
        this._tone(af, af, beat * 0.90, 'sine', 0.044, delay, bus, 0.002);
        this._tone(af * 2, af * 2, beat * 0.38, 'sine', 0.018, delay, bus, 0.002);
      } else if (style === 'brassy' && i % 2 === 1 && track !== 'boss' && track !== 'victory') {
        // Orchestral harp/string shimmer beneath heroic brass
        const arp = [0, third, fifth, ninth][(i >> 1) % 4];
        const af = hz(root + 24 + arp);
        this._tone(af, af, beat * 0.82, 'sine', intense ? 0.046 : 0.038, delay, bus, 0.004);
      } else if ((style === 'gritty' || style === 'tourney') && (intense || section >= 2) && i % 2 === 1) {
        // Driving syncopated synth pulse
        const arp = [0, fifth, seventh, 12][(i >> 1) % 4];
        const af = hz(root + 12 + arp);
        this._tone(af, af, beat * 0.58, 'triangle', intense ? 0.045 : 0.032, delay, bus, 0.003);
      }
    }

    // 4. Driving layered bass + octave bass energy when intense
    const bass = score.bass[i >> 1];
    if (i % 2 === 0 && bass != null) {
      const f = hz(root - 12 + bass);
      this._synthBass(f, lastChord ? 1.25 : beat * 1.72, delay, bus, style, intense);
    } else if (!lastChord && intense && i % 2 === 1) {
      // Clutch-moment octave bass pumping drive!
      const prevBass = score.bass[i >> 1] ?? 0;
      const fOct = hz(root + prevBass);
      this._tone(fOct, fOct * 0.996, beat * 0.68, style === 'chiptune' ? 'square' : 'sawtooth', 0.072, delay, bus, 0.002);
      this._tone(fOct, fOct, beat * 0.72, 'triangle', 0.11, delay, bus, 0.002);
    }

    // 5. Punchy Melee percussion kit + Bar-4/Bar-8 turnaround fills + intense 16th drive
    if (lastChord) {
      this._tone(136, 36, 0.22, 'sine', 0.34, delay, bus);
      this._noise(0.55, 6200, 0.45, 0.14, delay, bus, 0.008);
      return;
    }

    const isFill8 = Boolean(score.phrases && bar % 8 === 7);
    const isFill4 = Boolean(!isFill8 && bar % 4 === 3 && (score.phrases || track === 'boss' || track === 'menu'));
    const isVictoryRoll = track === 'victory' && bar === score.roots.length - 2 && i >= 12;
    const fillScale = track === 'menu' ? 0.68 : 1;

    if (isVictoryRoll) {
      // Snare pickup roll into triumphant final victory hit
      this._noise(0.075, 2500, 0.7, 0.17 + (i - 12) * 0.025, delay, bus);
      this._tone(205, 125, 0.06, 'triangle', 0.12, delay, bus);
    } else if (isFill8 && i >= 10) {
      // Bar-8 dramatic tom cascade & snare turnaround fill
      if (i === 10) {
        this._noise(0.08, 2400, 0.7, 0.20, delay, bus);
        this._tone(198, 118, 0.065, 'triangle', 0.14, delay, bus);
      } else if (i === 12) {
        this._tone(265, 165, 0.095, 'triangle', 0.22, delay, bus);
        this._noise(0.04, 2800, 0.9, 0.11, delay, bus);
      } else if (i === 13) {
        this._tone(210, 128, 0.095, 'triangle', 0.22, delay, bus);
      } else if (i === 14) {
        this._tone(162, 88, 0.105, 'triangle', 0.24, delay, bus);
        this._tone(128, 42, 0.09, 'sine', 0.22, delay, bus);
      } else if (i === 15) {
        this._noise(0.11, 2300, 0.65, 0.26, delay, bus);
        this._tone(142, 68, 0.10, 'triangle', 0.22, delay, bus);
      }
    } else if (isFill4 && i >= 12) {
      // Bar-4 snappy snare/tom turnaround fill
      if (i === 12) {
        this._noise(0.095, 2250, 0.65, 0.24 * fillScale, delay, bus);
        this._tone(192, 114, 0.072, 'triangle', 0.16 * fillScale, delay, bus);
      } else if (i === 13) {
        this._tone(235, 150, 0.075, 'triangle', 0.15 * fillScale, delay, bus);
      } else if (i === 14) {
        this._tone(182, 108, 0.085, 'triangle', 0.17 * fillScale, delay, bus);
      } else if (i === 15) {
        this._noise(0.09, 2500, 0.72, 0.21 * fillScale, delay, bus);
        this._tone(145, 76, 0.08, 'triangle', 0.16 * fillScale, delay, bus);
      }
    } else {
      // Core kick & snare groove
      const kick = i === 0 || i === 8 ||
        (score.phrases && (i === 10 || ((track === 'battle_arena' || track === 'battle_scifi' || intense) && i === 6))) ||
        (track === 'boss' && (i === 6 || i === 10));
      if (kick) {
        this._tone(140, 38, 0.115, 'sine', intense ? 0.36 : 0.33, delay, bus);
      }
      if (i === 4 || i === 12) {
        this._noise(0.095, 2250, 0.65, 0.23, delay, bus);
        this._tone(194, 114, 0.072, 'triangle', 0.15, delay, bus);
      } else if (intense && (i === 7 || i === 15)) {
        // Subtle driving ghost snare on clutch intensity
        this._noise(0.048, 2800, 0.9, 0.095, delay, bus);
      }
    }

    // 8-bar section crash swell
    if (i === 0 && bar % 8 === 0 && (score.phrases || track === 'boss')) {
      this._noise(0.44, 6200, 0.45, intense ? 0.15 : 0.13, delay, bus, 0.01);
    }

    // Hi-hats: steady 8ths normally, driving 16th hi-hat engine when intense!
    if (intense || i % 2 === 0 || (track === 'boss' && i > 12)) {
      const open = i === 14;
      const offbeat16 = i % 2 === 1;
      this._noise(
        open ? 0.105 : (offbeat16 ? 0.022 : 0.032),
        offbeat16 ? 8600 : 7400,
        offbeat16 ? 1.15 : 0.85,
        open ? 0.105 : (offbeat16 ? 0.078 : (i % 4 ? 0.092 : 0.062)),
        delay,
        bus,
      );
    }
  }
}
