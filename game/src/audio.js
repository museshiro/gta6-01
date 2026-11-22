// SOLMAR HEAT 3D — audio.js
// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, sirens, gunshots, impacts, pickups, jingles and a small
// procedural radio: two stations (SOLMAR FM synthwave, VICE 98 latin)
// plus OFF, switched with R. Created on first user gesture; M toggles mute.
function createAudio() {
  let ctx = null, master = null, musicGain = null, engineNodes = null;
  let muted = false, musicOn = false, musicTimer = null;
  let sirenOsc = null, sirenGain = null, sirenPhase = 0, sirenT = 0;

  // Radio stations: name, tempo (ms per 16th step), bass + lead patterns.
  const STATIONS = [
    {
      name: 'SOLMAR FM', tag: 'synthwave 112',
      tempo: 268, // ~112 bpm 16ths
      bass: [55, 0, 55, 65.4, 55, 0, 49, 58.3, 55, 0, 55, 65.4, 82.4, 73.4, 65.4, 49],
      lead: [220, 0, 261.6, 0, 329.6, 0, 261.6, 220, 196, 0, 220, 261.6, 293.7, 261.6, 220, 0],
    },
    {
      name: 'VICE 98', tag: 'latin 96',
      tempo: 312, // ~96 bpm 16ths
      bass: [65.4, 0, 0, 65.4, 82.4, 0, 73.4, 0, 65.4, 0, 0, 65.4, 98, 82.4, 73.4, 65.4],
      lead: [261.6, 329.6, 0, 392, 0, 329.6, 261.6, 0, 293.7, 329.6, 392, 0, 440, 392, 329.6, 0],
    },
  ];
  let station = 0; // 0 = SOLMAR FM, 1 = VICE 98, -1 = OFF

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseHit(dur, vol, freq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Engine: two detuned oscillators through a lowpass, pitch follows speed.
  function engine(speed01, on) {
    if (!ensure()) return;
    if (!on || muted) {
      if (engineNodes) { try { engineNodes.g.gain.value = 0; } catch (e) {} }
      return;
    }
    if (!engineNodes) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 600;
      g.gain.value = 0.0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
      o1.start(); o2.start();
      engineNodes = { o1, o2, f, g };
    }
    const t = ctx.currentTime;
    const base = 55 + speed01 * 110;
    engineNodes.o1.frequency.setTargetAtTime(base, t, 0.05);
    engineNodes.o2.frequency.setTargetAtTime(base * 1.5, t, 0.05);
    engineNodes.f.frequency.setTargetAtTime(400 + speed01 * 1400, t, 0.08);
    engineNodes.g.gain.setTargetAtTime(muted ? 0 : 0.05 + speed01 * 0.05, t, 0.08);
  }
  // Police siren: alternating two-tone, volume by nearest police distance.
  function siren(dist) {
    if (!ensure()) return;
    if (dist == null || dist > 900 || muted) {
      if (sirenGain) sirenGain.gain.value = 0;
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    }
    sirenT += 1 / 60;
    if (sirenT > 0.42) { sirenT = 0; sirenPhase = 1 - sirenPhase; }
    sirenOsc.frequency.value = sirenPhase ? 920 : 660;
    sirenGain.gain.value = U.clamp(0.09 * (1 - dist / 900), 0, 0.09);
  }

  // Procedural radio: the current station's bassline, hats and sparkle lead.
  let step = 0;
  function musicTick() {
    if (!ctx || muted || !musicOn || station < 0) return;
    const st = STATIONS[station];
    const t = ctx.currentTime;
    const b = st.bass[step % st.bass.length];
    if (b) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = b;
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.36);
    }
    if (step % 2 === 0) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.03);
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      src.connect(f); f.connect(g); g.connect(musicGain);
      src.start(t);
    }
    const l = st.lead[step % st.lead.length];
    if (l && step % 16 >= 8) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = l * 2;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.32);
    }
    step++;
  }
  function restartMusicTimer() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicOn && station >= 0) {
      musicTimer = setInterval(musicTick, STATIONS[station].tempo);
    }
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    engine, siren,
    // Radio: R cycles SOLMAR FM -> VICE 98 -> OFF. Returns the new label.
    cycleStation() {
      station = station === 0 ? 1 : station === 1 ? -1 : 0;
      restartMusicTimer();
      return station < 0 ? 'Radio OFF' : STATIONS[station].name + ' — ' + STATIONS[station].tag;
    },
    stationName() {
      return station < 0 ? 'OFF' : STATIONS[station].name;
    },
    shot() { noiseHit(0.14, 0.5, 2600); blip(180, 0.08, 'square', 0.18, 60); },
    punch() { noiseHit(0.09, 0.35, 500); blip(120, 0.08, 'sine', 0.25, 50); },
    crash(v) { noiseHit(0.25, U.clamp(0.15 + v * 0.4, 0, 0.6), 900); blip(90, 0.2, 'sine', 0.3, 40); },
    pickup() { blip(660, 0.09, 'sine', 0.22); setTimeout(() => blip(880, 0.12, 'sine', 0.22), 70); },
    coin() { blip(990, 0.08, 'sine', 0.2); setTimeout(() => blip(1320, 0.14, 'sine', 0.2), 60); },
    missionDone() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => setTimeout(() => blip(n, 0.22, 'triangle', 0.25), i * 110));
    },
    wantedUp() { blip(220, 0.16, 'square', 0.2, 180); setTimeout(() => blip(180, 0.2, 'square', 0.2, 140), 140); },
    busted() { blip(330, 0.3, 'sawtooth', 0.2, 110); },
    wasted() { blip(220, 0.5, 'sawtooth', 0.22, 55); },
    click() { blip(700, 0.05, 'square', 0.12); },
    startMusic() {
      if (!ensure() || musicOn) return;
      musicOn = true;
      restartMusicTimer();
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
    update() { /* siren/engine driven by callers each frame */ },
  };
}
