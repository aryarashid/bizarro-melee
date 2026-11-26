/**
 * Pure Web Audio API Procedural Sound & Music Engine for Bizarro Melee.
 * Zero external audio files; unlocks lazily on first user gesture; safe in sandboxed iframes.
 */

// Sixteenth-note motifs (MIDI pitches). Each bar uses its own root and voicing.
const TRACKS = {
  menu: { bpm: 101, roots: [48, 53, 45, 43], thirds: [4, 4, 3, 4], lead: 'triangle',
    motif: [76, 0, 0, 79, 0, 74, 0, 72, 0, 0, 67, 0, 71, 0, 74, 0], bass: [0, null, 7, null, 12, null, 7, null] },
  boss: { bpm: 126, roots: [39, 40, 35, 38], thirds: [3, 4, 4, 3], lead: 'sawtooth',
    motif: [63, 0, 64, 0, 70, 0, 69, 67, 0, 63, 0, 66, 0, 73, 70, 0], bass: [0, 12, 0, 1, 0, 7, 6, 0] },
  defeat: { bpm: 92, roots: [45, 40, 45], thirds: [3, 4, 3], lead: 'triangle', finalNote: 57,
    motif: [72, 0, 0, 0, 71, 0, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0], bass: [0, null, null, null, 7, null, null, null] },
  draw: { bpm: 100, roots: [50, 55], thirds: [3, 5], lead: 'sine', finalNote: 69,
    motif: [69, 0, 0, 0, 65, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0], bass: [0, null, null, null, 7, null, null, null] },
  victory: { finalNote: 84, bpm: 132, roots: [48, 53, 55, 48], thirds: [4, 4, 4, 4], lead: 'triangle',
    motif: [72, 0, 0, 72, 76, 0, 79, 0, 84, 0, 0, 0, 79, 0, 0, 0], bass: [0, null, 7, null, 12, null, null, null] },
};
// Four eight-bar sections. Pitches are chord-relative semitones above the bass.
function battleScore(bpm, tonic, minor, lead, changes, bass, phrases) {
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const form = [0,1,2,3,4,5,6,7, 0,1,4,5,2,3,6,7, 4,5,6,7,3,2,1,6, 0,3,4,5,2,6,7,0];
  const degrees = form.map((i) => changes[i]);
  return { bpm, lead, bass, roots: degrees.map((d) => tonic + scale[d]),
    thirds: degrees.map((d) => (scale[(d + 2) % 7] - scale[d] + 12) % 12),
    phrases: phrases.map((phrase) => phrase.split(' ').map((n) => n === '-' ? null : Number(n))) };
}

TRACKS.battle_tourney = battleScore(142, 45, true, 'triangle', [0,5,2,6,3,0,5,4], [0,0,7,12,0,7,10,7], [
  '12 - 19 - 15 17 19 - 22 - 19 - 17 15 - 14',
  '15 - - 19 22 - 24 - 22 19 - 17 - 15 14 -',
  '7 - 10 12 - 15 - 17 19 - 17 15 - 14 10 -',
  '24 - 22 19 - 17 19 - 15 - 17 14 12 - - -',
]);
TRACKS.battle_scifi = battleScore(133, 42, true, 'sawtooth', [0,1,5,0,6,3,4,1], [0,12,7,0,12,7,1,7], [
  '12 - - 13 - 19 18 - 12 - 15 - - 13 10 -',
  '- 19 20 - 19 - 13 - 10 - - 12 13 - 15 -',
  '7 - 8 - - 13 12 - 6 - 7 - 13 12 - 10',
  '24 - - 19 18 - 15 13 - 12 13 - 7 - 12 -',
]);
TRACKS.battle_retro = battleScore(156, 48, false, 'square', [0,3,4,0,5,1,3,4], [0,null,7,null,12,null,7,11], [
  '12 16 19 - 24 - 19 - 16 19 21 19 - 16 14 -',
  '19 - 16 12 - 14 16 - 21 - 19 16 14 - 12 -',
  '- 7 12 16 - 19 - 16 7 11 14 - 19 - 14 11',
  '24 - 21 19 16 - 19 - 14 16 19 14 12 - - -',
]);
TRACKS.battle_whimsical = battleScore(119, 53, false, 'sine', [0,5,1,4,3,0,1,4], [0,null,12,7,0,null,7,null], [
  '- 16 19 - - 21 - 19 - 14 - 16 12 - - -',
  '19 - - 23 21 - 19 - - 16 17 - 14 - 12 -',
  '7 - 12 - - 9 14 - 11 - - 14 16 - 12 -',
  '- 24 21 - 19 - - 16 17 14 - 11 12 - - -',
]);
TRACKS.battle_final = battleScore(148, 38, true, 'triangle', [0,5,3,4,0,2,6,4], [0,7,0,12,0,7,3,10], [
  '12 - - - 15 - 14 12 19 - - 17 15 - 10 -',
  '19 - 22 - - 24 22 19 17 - 15 14 12 - - -',
  '7 10 - 12 14 - 15 - 10 12 - 15 17 - 19 -',
  '24 - - 22 19 17 - 15 14 - 19 14 12 - - -',
]);
TRACKS.battle_temple = battleScore(138, 46, false, 'triangle', [0,4,5,3,0,5,1,4], [0,7,12,7,0,7,12,11], [
  '12 - 16 19 - 21 19 16 14 - 16 19 - 24 - -',
  '24 - 23 21 19 - 16 14 16 - 19 - 12 - - -',
  '7 - 11 14 - 16 14 11 12 - 16 19 21 - 19 -',
  '24 - 21 19 16 14 12 14 16 - 19 16 12 - - -',
]);
TRACKS.battle_fountain = battleScore(116, 50, true, 'sine', [0,3,6,2,5,1,4,0], [0,null,7,12,0,null,7,10], [
  '19 - 15 12 - 14 15 19 22 - 19 15 - 14 - -',
  '24 - 22 19 17 - 15 14 12 - 15 19 14 - 12 -',
  '12 15 19 - 22 19 15 12 14 17 20 - 19 - 15 -',
  '24 - 19 15 17 - 14 10 12 - - - - - - -',
]);

const STAGE_MUSIC = new Map(Object.entries({
  battle_final: ['final-obligation'],
  battle_temple: ['lowrule-temple', 'great-bay-marina'],
  battle_fountain: ['puddle-of-insomnia', 'slush-summit'],
  battle_scifi: ['corn-area', 'venom-barge', 'acid-vat-basement', 'acid-vat-depths', 'loud-suburb-highway', 'big-blue-commute'],
  battle_retro: ['corporate-kingdom', 'corporate-kingdom-2', 'flat-screen-calc', 'retro-jungle-64', 'retro-tax-island-64', 'onett-strip-mall', 'fiveside-skyscrapers'],
  battle_whimsical: ['randalls-tax-shelter', 'nightmare-suburb', 'rainbow-highway', 'tropic-condo-falls', 'jungle-japes-hoa', 'yoshis-tax-island', 'green-greens-suburb', 'critter-floats'],
}).flatMap(([track, stages]) => stages.map((stage) => [stage, track])));

const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const KO_STINGERS = {
  doubleKo: [67, 74],
  tripleKo: [67, 74, 79],
  zeroToDeath: [72, 76, 79, 83, 84],
  meteorKo: [79, 72, 64, 43],
};
const VOICES = {
  hero: ['triangle', 220, 1.55], heavy: ['sawtooth', 112, 0.66],
  cute: ['sine', 356, 1.72], snarky: ['square', 198, 1.26],
  robot: ['square', 154, 0.98], mystic: ['sine', 244, 0.78],
};

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.paused = false;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.55;
    this.currentTrack = 'none';
    this.gameCuePlayed = false;
    this.musicTimer = null;
    this.stepIndex = 0;
    this.noiseBuffer = null;
    this.nextChargeTone = new Map();
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 2400;
      this.musicFilter.Q.value = 0.65;
      this.musicGain.connect(this.musicFilter);
      this.musicFilter.connect(this.masterGain);
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      this.masterGain.connect(limiter);
      limiter.connect(this.ctx.destination);
      this._applyGains();
      this._buildNoiseBuffer();
      if (this.currentTrack !== 'none') {
        this._startSequencer();
      }
    } catch {
      this.ctx = null;
    }
  }

  _buildNoiseBuffer() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  _applyGains() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.01);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.01);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.35 * (this.paused ? 0.25 : 1), now, 0.02);
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

  _tone(freqStart, freqEnd, dur, type = 'triangle', gainPeak = 0.25, delay = 0, dest = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(25, freqStart), t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, freq = 1200, q = 1, gainPeak = 0.2, delay = 0, dest = null, attack = 0) {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.setValueAtTime(q, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(attack ? 0.0001 : gainPeak, t0);
    if (attack) g.gain.linearRampToValueAtTime(gainPeak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  playUi(type) {
    if (type === 'ready' || type === 'go') this.gameCuePlayed = false;
    if (!this.ctx || this.muted) return;
    switch (type) {
      case 'move':
        this._tone(520, 680, 0.055, 'triangle', 0.14);
        break;
      case 'select':
        this._tone(440, 880, 0.09, 'square', 0.14);
        this._tone(660, 1100, 0.11, 'triangle', 0.14, 0.04);
        break;
      case 'back':
        this._tone(520, 260, 0.09, 'triangle', 0.16);
        break;
      case 'start':
        this._tone(330, 660, 0.1, 'sawtooth', 0.14);
        this._tone(495, 990, 0.12, 'square', 0.14, 0.05);
        this._tone(660, 1320, 0.18, 'triangle', 0.18, 0.1);
        break;
      case 'ready':
        this._tone(392, 392, 0.12, 'sawtooth', 0.16);
        this._tone(523.25, 523.25, 0.16, 'square', 0.16, 0.12);
        break;
      case 'go':
        this._tone(523.25, 1046.5, 0.24, 'sawtooth', 0.22);
        this._noise(0.14, 1800, 0.8, 0.14);
        break;
      case 'game':
        if (this.gameCuePlayed) break;
        this.gameCuePlayed = true;
        this._tone(659.25, 440, 0.18, 'sawtooth', 0.2);
        this._tone(440, 220, 0.34, 'square', 0.2, 0.14);
        this._noise(0.26, 900, 0.7, 0.18);
        break;
    }
  }

  _voice(e, cue) {
    const [wave, base, inflection] = VOICES[e.voiceType] || VOICES.hero;
    const f = base * (e.voicePitch || 1);
    const length = cue === 'ko' ? 0.34 : cue === 'taunt' ? 0.22 : 0.105;
    this._tone(f, f * inflection, length * 0.48, wave, 0.085);
    this._tone(f * inflection, f * (cue === 'ko' ? 0.39 : 0.92), length * 0.72, wave, 0.085, length * 0.38);
    this._tone(f * 2.6, f * 1.8, length, 'sine', 0.042);
  }

  _crack() {
    this._tone(110, 29, 0.27, 'sine', 0.32);
    this._noise(0.035, 4900, 0.7, 0.23);
    this._noise(0.11, 1800, 1.1, 0.16, 0.032);
  }

  playStinger(kind) {
    if (this.ctx?.state !== 'running' || this.muted) return;
    if (kind === 'suddenDeath') {
      for (const note of [31, 38, 43]) this._tone(hz(note - 1), hz(note), 0.72, 'sawtooth', 0.09);
      this._tone(440, 720, 0.23, 'triangle', 0.16, 0.05);
      this._tone(720, 440, 0.29, 'triangle', 0.16, 0.28);
      return;
    }
    const notes = KO_STINGERS[kind];
    if (!Array.isArray(notes)) return;
    notes.forEach((note, i) => {
      const last = i === notes.length - 1;
      this._tone(hz(note), hz(note), last ? 0.36 : 0.12, 'triangle', 0.19, i * 0.09);
      this._tone(hz(note - 12), hz(note - 12), last ? 0.28 : 0.09, 'square', 0.05, i * 0.09);
    });
  }

  _electricZap(force) {
    const ctx = this.ctx, start = ctx.currentTime;
    const end = start + 0.055 + 0.06 * force;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const depth = ctx.createGain();
    const envelope = ctx.createGain();
    carrier.frequency.setValueAtTime(1950, start);
    carrier.frequency.exponentialRampToValueAtTime(620, end);
    modulator.frequency.setValueAtTime(880, start);
    modulator.frequency.exponentialRampToValueAtTime(235, end);
    depth.gain.setValueAtTime(1050, start);
    depth.gain.exponentialRampToValueAtTime(50, end);
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    envelope.gain.setValueAtTime(0.10 + force * 0.05, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    carrier.connect(envelope);
    envelope.connect(this.sfxGain);
    carrier.start(start);
    modulator.start(start);
    carrier.stop(end);
    modulator.stop(end);
    this._noise(0.085, 5400, 2.1, 0.14, 0.012);
  }

  _crowdCheer(intensity) {
    if (this.ctx.currentTime < (this.nextCheer || 0)) return;
    this.nextCheer = this.ctx.currentTime + 0.32;
    this._noise(0.16, 1350, 1.4, 0.09, 0, null, 0.09);
    this._noise(0.68, 780, 1.1, 0.09 + 0.08 * intensity, 0.12, null, 0.18);
    this._noise(0.56, 1860, 2.2, 0.075, 0.17, null, 0.12);
  }

  playHit(hit = {}) {
    if (!this.ctx || !this.sfxGain || this.muted || this.ctx.state === 'closed' ||
        (this.ctx.state === 'suspended' && !this.ctx.startRendering)) return;
    const kb = Number.isFinite(hit.kb) ? Math.max(0, hit.kb) : 0;
    const damage = Number.isFinite(hit.damage) ? Math.max(0, hit.damage) : 8;
    const force = Math.min(1, damage / 44 + kb / 250);
    const heavy = hit.heavy || kb >= 95 || damage >= 14;
    const bright = hit.sweetspot || heavy;
    this._noise(0.012 + 0.016 * force, (bright ? 4200 : 2750) + 850 * force, 0.85, 0.23 + 0.20 * force);
    this._tone(125, 36, 0.055 + 0.19 * force, 'sine', 0.14 + 0.23 * force);

    if (hit.electric || hit.element === 'electric' || hit.element === 'lightning') this._electricZap(force);
    if (hit.slash || hit.element === 'slash') {
      this._tone(2640, 1560, 0.095, 'triangle', 0.13);
      this._tone(3910, 2450, 0.13, 'sine', 0.085, 0.004);
    }
    if (hit.sweetspot || kb >= 115) {
      this._noise(0.042, 920, 1.2, 0.30);
      this._tone(1240, 910, 0.145, 'triangle', 0.15, 0.008);
      this._tone(2480, 1820, 0.18, 'sine', 0.085, 0.01);
    } else if (hit.element === 'fire' || hit.element === 'ice') {
      const ring = hit.element === 'ice' ? 2120 : 320;
      this._tone(ring, ring * 0.68, 0.09, 'triangle', 0.085);
    }
    if (kb >= 125) this._crowdCheer(Math.min(1, kb / 200));
  }

  playEvents(events) {
    if (events?.some((e) => e.type === 'game') && (this.currentTrack.startsWith('battle_') || this.currentTrack === 'boss')) this.setMusic('none');
    if (!this.ctx || this.muted || !events?.length) return;
    for (const e of events) {
      switch (e.type) {
        case 'specialCharge': {
          const now = this.ctx.currentTime;
          if (now < (this.nextChargeTone.get(e.port) ?? 0)) break;
          this.nextChargeTone.set(e.port, now + 0.085);
          const electric = e.style === 'electric';
          const pitch = (electric ? 410 : e.style === 'dark' ? 73 : 138) * (1 + 1.6 * e.progress);
          this._tone(pitch, pitch * 1.19, 0.105, electric ? 'square' : 'triangle', 0.078);
          if (e.style === 'fire') this._noise(0.10, 520 + 1800 * e.progress, 0.8, 0.095);
          break;
        }
        case 'specialLaunch':
          this.nextChargeTone.delete(e.port);
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
        case 'heavyAttack':
          this._voice(e, 'attack');
          break;
        case 'crowdCheer':
          this._crowdCheer(Number.isFinite(e.intensity) ? Math.max(0, Math.min(1, e.intensity)) : 1);
          break;
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
          this._tone(1840, 2960, 0.12, 'sine', 0.18);
          this._noise(0.06, 4800, 2.2, 0.16);
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
          this._tone(740, 420, 0.08, 'triangle', 0.18);
          this._noise(0.06, 2600, 2.2, 0.14);
          break;
        case 'shieldBreak':
          this._noise(0.32, 2200, 0.6, 0.32);
          this._tone(960, 140, 0.35, 'sawtooth', 0.26);
          this._tone(640, 120, 0.4, 'square', 0.2, 0.06);
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
          this._noise(0.075, 2150, 0.85, 0.16, 0, null, 0.008);
          break;
        case 'land': {
          const force = Math.min(1, (e.speed ?? 4) * (e.weight ?? 100) / 1900);
          this._noise(0.035 + force * 0.055, 1150 - 550 * force, 1, 0.08 + 0.14 * force);
          this._tone(120 - 22 * force, 48, 0.04 + 0.11 * force, 'sine', 0.035 + 0.19 * force);
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
          if (!this.sfxGain || this.ctx.state === 'closed' ||
              (this.ctx.state !== 'running' && !this.ctx.startRendering)) break;
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
          this._tone(580, 880, 0.07, 'triangle', 0.15);
          break;
        case 'itemThrow':
          this._tone(440, 240, 0.08, 'sine', 0.14);
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
    if (this.currentTrack === track) return;
    this.currentTrack = track;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.stepIndex = 0;
    if (track !== 'none' && this.ctx) {
      this._startSequencer();
    }
  }

  _startSequencer() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.currentTrack === 'none') return;

    const track = this.currentTrack;
    const score = TRACKS[track] || TRACKS.menu;
    const step = 60 / (score.bpm * 4);
    let next = this.ctx.currentTime + 0.015;
    const schedule = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      next = Math.max(next, now);
      while (next < now + 0.095) {
        this._musicStep(track, score, this.stepIndex++, step, next - now);
        next += step;
        if (score.finalNote && this.stepIndex >= score.roots.length * 16) {
          clearInterval(this.musicTimer);
          this.musicTimer = null;
          return;
        }
      }
    };
    this.musicTimer = setInterval(schedule, 40);
    schedule();
  }

  _musicStep(track, score, stepIndex, beat, delay) {
    const i = stepIndex % 16;
    const bar = Math.floor(stepIndex / 16) % score.roots.length;
    const root = score.roots[bar];
    const bus = this.musicGain;
    const lastChord = score.finalNote && bar === score.roots.length - 1;
    if (lastChord && i > 0) return;
    const motif = score.phrases?.[bar >> 3] ?? score.motif;
    const melody = motif[i];
    if (score.phrases ? melody != null : melody > 0) {
      const f = hz(lastChord ? score.finalNote : score.phrases ? root + melody : melody + root - score.roots[0]);
      this._tone(f, f, lastChord ? 1.1 : beat * 1.45, score.lead, 0.115, delay, bus);
    }
    if (i === 0 || i === 8) {
      for (const interval of [0, score.thirds[bar], 7]) {
        const f = hz(root + 12 + interval);
        this._tone(f * 0.998, f, lastChord ? 1.35 : beat * 7.8, 'triangle', 0.115, delay, bus);
      }
    }
    const bass = score.bass[i >> 1];
    if (i % 2 === 0 && bass != null) {
      const f = hz(root - 12 + bass);
      this._tone(f * 1.02, f, beat * 1.72, 'triangle', 0.27, delay, bus);
    }
    if (i === 0 || i === 8 || score.phrases && i === 10) this._tone(132, 40, 0.105, 'sine', 0.32, delay, bus);
    if (i === 4 || i === 12) {
      this._noise(0.095, 2000, 0.65, 0.22, delay, bus);
      this._tone(188, 119, 0.07, 'triangle', 0.14, delay, bus);
    }
    if (i % 2 === 0 || track === 'boss' && i > 12) {
      this._noise(i === 14 ? 0.10 : 0.032, 7200, 0.85, i % 4 ? 0.09 : 0.06, delay, bus);
    }
  }
}
