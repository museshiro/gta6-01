// audio.js — all sound is synthesized with WebAudio: engine hum, sirens,
// gunshots, pickups, and two tiny radio stations. No audio files anywhere.

export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let radioTimer = null, radioStep = 0, radioStation = 0; // 0 off, 1 Brasa, 2 Caldera
  let muted = false;
  const STATIONS = ['Mati', 'Radio Brasa — cumbia panas', 'Radio Caldera — surf rock'];

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
      engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, low) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low || 1800;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  const BRASA = [0, 0, 7, 0, 10, 0, 12, 10, 7, 5, 3, 0]; // scale steps (A minor-ish cumbia feel)
  const CALDERA = [0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 0, 7];
  function radioTick() {
    if (!ctx || muted || radioStation === 0) return;
    const seq = radioStation === 1 ? BRASA : CALDERA;
    const base = radioStation === 1 ? 110 : 98;
    const step = seq[radioStep % seq.length];
    const f = base * Math.pow(2, step / 12);
    blip(f, 0.22, radioStation === 1 ? 'square' : 'triangle', 0.10);
    if (radioStep % 4 === 0) blip(base / 2, 0.3, 'sine', 0.16);
    if (radioStep % 2 === 0) noise(0.05, 0.05, 6000); // hat tick
    radioStep++;
  }

  return {
    ensure,
    get stationName() { return STATIONS[radioStation]; },
    get muted() { return muted; },
    setEngine(speed01, driving) {
      if (!ensure() || muted) { if (engineGain) engineGain.gain.value = 0; return; }
      if (ctx.state === 'suspended') ctx.resume();
      engineGain.gain.value = driving ? 0.05 + speed01 * 0.09 : 0.0;
      engineOsc.frequency.value = 50 + speed01 * 160;
    },
    shoot() { noise(0.12, 0.35, 2400); },
    hit() { blip(220, 0.1, 'square', 0.15, 110); },
    pickup() { blip(660, 0.12, 'sine', 0.2); blip(990, 0.18, 'sine', 0.2); },
    mission() { blip(523, 0.15, 'triangle', 0.22); setTimeout(() => blip(784, 0.25, 'triangle', 0.22), 140); },
    fail() { blip(330, 0.3, 'sawtooth', 0.18, 165); },
    siren(on) {
      if (!ensure() || muted) return;
      if (on && !this._sirenOsc) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; g.gain.value = 0.045;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
        const lg = ctx.createGain(); lg.gain.value = 260;
        lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 780;
        o.connect(g); g.connect(master); o.start(); lfo.start();
        this._sirenOsc = o; this._sirenLfo = lfo; this._sirenGain = g;
      } else if (!on && this._sirenOsc) {
        try { this._sirenOsc.stop(); this._sirenLfo.stop(); } catch (e) {}
        this._sirenOsc = null;
      }
    },
    cycleRadio() {
      radioStation = (radioStation + 1) % 3;
      if (radioStation > 0) {
        if (!radioTimer) radioTimer = setInterval(radioTick, 240);
        radioStep = 0;
      }
      return STATIONS[radioStation];
    },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
  };
}
