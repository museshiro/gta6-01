// audio.js — synthesized sound for CALDERA VIVA: engine hum, police siren,
// gunshots and two procedural WebAudio radio stations. No audio files at all.
// Everything is created lazily on the first user gesture; headless runs stay silent.

const STATIONS = [
  {
    name: 'RADIO BRASA',
    bpm: 132,
    bass: [45, 45, 48, 43, 45, 45, 50, 48], // A minor drive
    lead: [69, 72, 76, 72, 69, 67, 64, 67],
    wave: 'sawtooth',
  },
  {
    name: 'ONDA CALDERA',
    bpm: 88,
    bass: [36, 41, 43, 38, 36, 41, 43, 45],
    lead: [60, 64, 67, 72, 67, 64, 60, 55],
    wave: 'triangle',
  },
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = 0;
    this.radioOn = false;
    this.station = 0;
    this.nextNoteTime = 0;
    this.step = 0;
    this.muted = false;
    this.noiseBuf = null;
  }

  /** Create the context (call from a user gesture; safe to call repeatedly). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Engine hum.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      this.engineOsc.connect(lp);
      lp.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Police siren.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** Engine pitch follows speed 0..1; silent when on foot. */
  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const target = inCar ? 0.035 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  setSiren(on, dist01) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.028 * (1 - dist01 * 0.7) : 0, this.ctx.currentTime, 0.2);
  }

  update(dt) {
    if (!this.ctx) return;
    // Alternate the siren tone twice a second.
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.45) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 950 : 700;
    }
    if (!this.radioOn) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2;
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      if (this.nextNoteTime < this.ctx.currentTime - 0.1) this.nextNoteTime = this.ctx.currentTime;
      this.playStep(st, this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
  }

  playStep(st, step, t, dur) {
    const bassNote = st.bass[step % 8];
    const leadNote = st.lead[step % 8];
    this.tone(220 * Math.pow(2, (bassNote - 69) / 12), t, dur * 0.9, 0.16, 'triangle');
    if (step % 2 === 0) {
      this.tone(220 * Math.pow(2, (leadNote - 69) / 12), t, dur * 0.5, 0.07, st.wave);
    }
    if (step % 4 === 2) this.noiseHit(t, dur * 0.3, 0.05, 6000); // hi-hat tick
  }

  tone(freq, t, dur, vol, wave) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit(t, dur, vol, cutoff) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** One-shot effects: shot, pickup, crash, mission, busted, explosion. */
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'shot') {
      this.noiseHit(t, 0.12, 0.3, 2500);
      this.tone(160, t, 0.08, 0.2, 'square');
    } else if (name === 'pickup') {
      this.tone(880, t, 0.09, 0.15, 'sine');
      this.tone(1318, t + 0.09, 0.14, 0.15, 'sine');
    } else if (name === 'crash') {
      this.noiseHit(t, 0.25, 0.3, 900);
    } else if (name === 'mission') {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.09, 0.16, 0.15, 'sine'));
    } else if (name === 'busted') {
      [392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.12, 0.2, 0.14, 'triangle'));
    } else if (name === 'explosion') {
      this.noiseHit(t, 0.7, 0.4, 500);
      this.tone(60, t, 0.6, 0.3, 'sine');
    }
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.radioOn && this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.step = 0;
    }
    return this.radioOn;
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    return STATIONS[this.station].name;
  }

  stationName() {
    return STATIONS[this.station].name;
  }
}
