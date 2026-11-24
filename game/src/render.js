// render.js — hand-written WebGL low-poly renderer for CALDERA VIVA, plus a
// top-down 2D fallback when WebGL is unavailable (or ?mode=2d).
// One shader, vertex colours, lambert sun, distance fog, an animated sea.
// No libraries: the whole pipeline is built from the city's own geometry.

import { mat4Perspective, mat4LookAt, mat4Multiply, clamp, lerp } from './utils.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec3 aNormal;
attribute float aWave;
uniform mat4 uMVP;
uniform float uTime;
uniform vec3 uCamPos;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDist;
void main() {
  vec3 p = aPos;
  if (aWave > 0.0) {
    p.y += (sin(p.x * 0.08 + uTime * 1.3) + cos(p.z * 0.06 + uTime * 0.9)) * 0.55 * aWave;
  }
  vColor = aColor;
  vNormal = aNormal;
  vDist = distance(uCamPos, p);
  gl_Position = uMVP * vec4(p, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDist;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAmbient;
void main() {
  float diff = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  vec3 col = vColor * (uAmbient + (1.0 - uAmbient) * diff);
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}`;

// Sky / fog / sun keyframes by hour of day.
const DAY_KEYS = [
  { h: 5, sky: [0.35, 0.3, 0.5], fog: [0.5, 0.42, 0.55], ambient: 0.38, sun: 0.5 },
  { h: 6.5, sky: [1.0, 0.7, 0.42], fog: [0.98, 0.68, 0.48], ambient: 0.42, sun: 0.9 },
  { h: 12, sky: [0.5, 0.78, 0.95], fog: [0.68, 0.83, 0.95], ambient: 0.55, sun: 1.0 },
  { h: 17.5, sky: [1.0, 0.62, 0.32], fog: [0.96, 0.58, 0.34], ambient: 0.42, sun: 0.9 },
  { h: 18.5, sky: [0.85, 0.42, 0.32], fog: [0.85, 0.45, 0.35], ambient: 0.38, sun: 0.7 },
  { h: 21, sky: [0.08, 0.11, 0.24], fog: [0.12, 0.15, 0.3], ambient: 0.38, sun: 0.25 },
  { h: 24, sky: [0.06, 0.09, 0.2], fog: [0.1, 0.13, 0.26], ambient: 0.36, sun: 0.25 },
];

export function lightForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = DAY_KEYS[0];
  let b = DAY_KEYS[DAY_KEYS.length - 1];
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    if (h >= DAY_KEYS[i].h && h <= DAY_KEYS[i + 1].h) { a = DAY_KEYS[i]; b = DAY_KEYS[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : clamp((h - a.h) / (b.h - a.h), 0, 1);
  const mix3 = (x, y) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  const el = Math.sin(((h - 6) / 12) * Math.PI) * 0.85 + 0.12; // sun elevation
  const az = ((h - 6) / 12) * Math.PI;
  const sunDir = h >= 6 && h <= 19
    ? [Math.cos(az) * 0.8, Math.max(0.08, el), Math.sin(az) * 0.6]
    : [0.3, 0.85, 0.4];
  return { sky: mix3(a.sky, b.sky), fog: mix3(a.fog, b.fog), ambient: lerp(a.ambient, b.ambient, t), sun: lerp(a.sun, b.sun, t), sunDir };
}

// ---------------------------------------------------------------- geometry helpers

function pushTri(arr, p, c, n, w) {
  for (let i = 0; i < 3; i++) {
    arr.pos.push(p[i][0], p[i][1], p[i][2]);
    arr.col.push(c[0], c[1], c[2]);
    arr.nor.push(n[0], n[1], n[2]);
    arr.wav.push(w);
  }
}

function pushQuad(arr, a, b, c, d, color, normal, wave = 0) {
  pushTri(arr, [a, b, c], color, normal, wave);
  pushTri(arr, [a, c, d], color, normal, wave);
}

function brighten(color, f) {
  return [clamp(color[0] * f, 0, 1), clamp(color[1] * f, 0, 1), clamp(color[2] * f, 0, 1)];
}

/** Axis-aligned box, centre (cx, cy, cz), size (w, h, d). */
function pushBox(arr, cx, cy, cz, w, h, d, color, topColor = null) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const top = topColor || brighten(color, 1.25);
  const dark = brighten(color, 0.72);
  // top / bottom
  pushQuad(arr, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], top, [0, 1, 0]);
  pushQuad(arr, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], dark, [0, -1, 0]);
  // sides
  pushQuad(arr, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], color, [0, 0, 1]);
  pushQuad(arr, [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], color, [0, 0, -1]);
  pushQuad(arr, [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], brighten(color, 0.9), [1, 0, 0]);
  pushQuad(arr, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], brighten(color, 0.9), [-1, 0, 0]);
}

/** Box rotated around Y by `heading` (0 faces -z). */
function pushBoxRot(arr, cx, cy, cz, w, h, d, heading, color, topColor = null) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const rot = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const top = topColor || brighten(color, 1.25);
  const dark = brighten(color, 0.72);
  const P = (x, y, z) => { const [rx, rz] = rot(x, z); return [rx, cy + y, rz]; };
  const N = (x, z) => { const [rx, rz] = rot(x, z); return [rx, 0, rz]; };
  const nTop = [0, 1, 0], nBot = [0, -1, 0];
  const nF = N(0, 1), nB = N(0, -1), nR = N(1, 0), nL = N(-1, 0);
  pushQuad(arr, P(-hw, hh, -hd), P(hw, hh, -hd), P(hw, hh, hd), P(-hw, hh, hd), top, nTop);
  pushQuad(arr, P(-hw, -hh, hd), P(hw, -hh, hd), P(hw, -hh, -hd), P(-hw, -hh, -hd), dark, nBot);
  pushQuad(arr, P(-hw, -hh, hd), P(-hw, hh, hd), P(hw, hh, hd), P(hw, -hh, hd), color, nF);
  pushQuad(arr, P(hw, -hh, -hd), P(hw, hh, -hd), P(-hw, hh, -hd), P(-hw, -hh, -hd), color, nB);
  pushQuad(arr, P(hw, -hh, hd), P(hw, hh, hd), P(hw, hh, -hd), P(hw, -hh, -hd), brighten(color, 0.9), nR);
  pushQuad(arr, P(-hw, -hh, -hd), P(-hw, hh, -hd), P(-hw, hh, hd), P(-hw, -hh, hd), brighten(color, 0.9), nL);
}

function newGeom() {
  return { pos: [], col: [], nor: [], wav: [] };
}

function toArrays(g) {
  return {
    pos: new Float32Array(g.pos),
    col: new Float32Array(g.col),
    nor: new Float32Array(g.nor),
    wav: new Float32Array(g.wav),
    count: g.pos.length / 3,
  };
}

// ---------------------------------------------------------------- static world

function buildStaticGeometry(city) {
  const g = newGeom();
  // Sea (animated) and the black-sand shelf under the island.
  pushQuad(g, [-900, -0.5, -900], [900, -0.5, -900], [900, -0.5, 900], [-900, -0.5, 900], [0.08, 0.32, 0.5], [0, 1, 0], 1);
  pushQuad(g, [-320, -0.12, -320], [320, -0.12, -320], [320, -0.12, 320], [-320, -0.12, 320], [0.22, 0.2, 0.18], [0, 1, 0]);
  // Land.
  pushQuad(g, [-260, 0, -260], [260, 0, -260], [260, 0, 260], [-260, 0, 260], [0.6, 0.48, 0.34], [0, 1, 0]);
  // Roads (asphalt strips) + plaza disc.
  for (const lx of [-240, -180, -120, -60, 0, 60, 120, 180, 240]) {
    pushQuad(g, [lx - 5, 0.06, -260], [lx + 5, 0.06, -260], [lx + 5, 0.06, 260], [lx - 5, 0.06, 260], [0.15, 0.15, 0.17], [0, 1, 0]);
    pushQuad(g, [-260, 0.06, lx - 5], [260, 0.06, lx - 5], [260, 0.06, lx + 5], [-260, 0.06, lx + 5], [0.15, 0.15, 0.17], [0, 1, 0]);
  }
  // Plaza Brasa: warm stone circle (fan of 16 triangles).
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 1) / 16) * Math.PI * 2;
    pushTri(g, [[0, 0.09, 0], [Math.cos(a0) * 34, 0.09, Math.sin(a0) * 34], [Math.cos(a1) * 34, 0.09, Math.sin(a1) * 34]], [0.72, 0.6, 0.44], [0, 1, 0], 0);
  }
  // Harbour inlet water + bridge deck.
  pushQuad(g, [238, -0.2, 18], [302, -0.2, 18], [302, -0.2, 102], [238, -0.2, 102], [0.1, 0.35, 0.5], [0, 1, 0], 1);
  pushBox(g, 240, 0.35, 60, 17, 0.7, 84, [0.5, 0.48, 0.44]);
  pushBox(g, 232.5, 1.1, 60, 0.6, 1.2, 84, [0.75, 0.3, 0.2]);
  pushBox(g, 247.5, 1.1, 60, 0.6, 1.2, 84, [0.75, 0.3, 0.2]);
  // Pier: wooden deck + posts.
  for (let x = -264; x >= -330; x -= 6) {
    pushBox(g, x, 0.4, 66, 6, 0.5, 50, [0.45, 0.32, 0.2]);
  }
  for (let x = -268; x >= -328; x -= 12) {
    pushBox(g, x, -0.4, 42, 1.2, 2.4, 1.2, [0.35, 0.25, 0.16]);
    pushBox(g, x, -0.4, 90, 1.2, 2.4, 1.2, [0.35, 0.25, 0.16]);
  }
  // Volcano cone + glowing crater.
  const v = city.volcano;
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * Math.PI * 2;
    const a1 = ((i + 1) / 18) * Math.PI * 2;
    const p0 = [v.x + Math.cos(a0) * v.r, 0, v.z + Math.sin(a0) * v.r];
    const p1 = [v.x + Math.cos(a1) * v.r, 0, v.z + Math.sin(a1) * v.r];
    const apex = [v.x, v.h, v.z];
    const n = [Math.cos((a0 + a1) / 2) * 0.7, 0.7, Math.sin((a0 + a1) / 2) * 0.7];
    pushTri(g, [p0, apex, p1], [0.32, 0.24, 0.2], n, 0);
  }
  pushBox(g, v.x, v.h - 1, v.z, 16, 2, 16, [1.0, 0.32, 0.08]);
  // Garage HQ (Tito's): low wide shed with a warm sign band.
  pushBox(g, city.garage.x, 3, city.garage.z, 26, 6, 18, [0.55, 0.4, 0.28]);
  pushBox(g, city.garage.x, 6.4, city.garage.z, 26, 0.8, 18, [1.0, 0.62, 0.15]);
  // Buildings.
  for (const b of city.buildings) {
    pushBox(g, b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color);
    if (b.neon) {
      pushBox(g, b.x, b.h + 0.4, b.z - b.hd + 0.3, b.w * 0.7, 0.7, 0.5, b.neon);
    }
  }
  // Palms and lamps.
  for (const p of city.palms) {
    pushBox(g, p.x, p.h / 2, p.z, 0.7, p.h, 0.7, [0.5, 0.36, 0.22]);
    pushBox(g, p.x, p.h + 0.6, p.z, 4.4, 0.5, 1.4, [0.16, 0.5, 0.22]);
    pushBox(g, p.x, p.h + 0.6, p.z, 1.4, 0.5, 4.4, [0.2, 0.58, 0.26]);
  }
  for (const l of city.lamps) {
    pushBox(g, l.x, 3, l.z, 0.4, 6, 0.4, [0.25, 0.25, 0.28]);
    pushBox(g, l.x, 6.2, l.z, 1.1, 0.5, 1.1, [1.0, 0.9, 0.6]);
  }
  return toArrays(g);
}

// ---------------------------------------------------------------- renderer

export class Renderer {
  constructor(glCanvas, fallbackCanvas) {
    this.glCanvas = glCanvas;
    this.fallbackCanvas = fallbackCanvas;
    this.mode = '3d';
    this.gl = null;
    this.camPos = { x: 0, y: 40, z: 60 };
    this.camTarget = { x: 0, y: 0, z: 0 };
    this.firstFrame = true;
    this.staticCount = 0;
  }

  init() {
    try {
      this.gl = this.glCanvas.getContext('webgl', { antialias: true }) ||
        this.glCanvas.getContext('experimental-webgl');
    } catch (e) {
      this.gl = null;
    }
    if (!this.gl) { this.mode = '2d'; return false; }
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      aNormal: gl.getAttribLocation(prog, 'aNormal'),
      aWave: gl.getAttribLocation(prog, 'aWave'),
      uMVP: gl.getUniformLocation(prog, 'uMVP'),
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
      uFogNear: gl.getUniformLocation(prog, 'uFogNear'),
      uFogFar: gl.getUniformLocation(prog, 'uFogFar'),
      uAmbient: gl.getUniformLocation(prog, 'uAmbient'),
    };
    this.staticBuf = {};
    this.dynBuf = {};
    for (const key of ['pos', 'col', 'nor', 'wav']) {
      this.staticBuf[key] = gl.createBuffer();
      this.dynBuf[key] = gl.createBuffer();
    }
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.5, 0.7, 0.9, 1);
    return true;
  }

  buildStatic(city) {
    if (!this.gl) return;
    const arrays = buildStaticGeometry(city);
    this.staticCount = arrays.count;
    const gl = this.gl;
    const upload = (buf, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); };
    upload(this.staticBuf.pos, arrays.pos);
    upload(this.staticBuf.col, arrays.col);
    upload(this.staticBuf.nor, arrays.nor);
    upload(this.staticBuf.wav, arrays.wav);
  }  resize(w, h) {
    this.glCanvas.width = w;
    this.glCanvas.height = h;
    this.fallbackCanvas.width = w;
    this.fallbackCanvas.height = h;
    if (this.gl) this.gl.viewport(0, 0, w, h);
    this.w = w;
    this.h = h;
  }

  /** Build the per-frame dynamic geometry: cars, peds, helicopter, markers, effects. */
  buildDynamic(state, time) {
    const g = newGeom();
    const night = state.hour >= 19 || state.hour < 6;
    for (const car of state.cars) {
      if (car.hidden) continue;
      const body = car.color;
      pushBoxRot(g, car.x, 0.75, car.z, 2.2, 0.9, 4.4, car.heading, body);
      pushBoxRot(g, car.x - Math.sin(car.heading) * 0.3, 1.45, car.z + Math.cos(car.heading) * 0.3, 1.8, 0.7, 2.2, car.heading, [0.12, 0.14, 0.18]);
      // Wheels.
      for (const [wx, wz] of [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]]) {
        pushBoxRot(g, car.x, 0.35, car.z, 0.4, 0.7, 0.8, car.heading, [0.08, 0.08, 0.09]);
      }
      if (car.isCop) {
        pushBoxRot(g, car.x, 1.35, car.z, 2.0, 0.25, 1.2, car.heading, [1.0, 0.15, 0.15]);
        pushBoxRot(g, car.x, 1.35, car.z, 2.0, 0.25, 1.2, car.heading, [0.2, 0.3, 1.0]);
      }
      if (night || car.isPlayer) {
        const fx = Math.sin(car.heading) * 2.3;
        const fz = -Math.cos(car.heading) * 2.3;
        pushBoxRot(g, car.x + fx - Math.cos(car.heading) * 0.7, 0.7, car.z + fz - Math.sin(car.heading) * 0.7, 0.4, 0.25, 0.2, car.heading, [1.0, 0.95, 0.7]);
        pushBoxRot(g, car.x + fx + Math.cos(car.heading) * 0.7, 0.7, car.z + fz + Math.sin(car.heading) * 0.7, 0.4, 0.25, 0.2, car.heading, [1.0, 0.95, 0.7]);
      }
    }
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        pushBox(g, ped.x, 0.25, ped.z, 1.5, 0.5, 0.7, ped.color);
      } else {
        pushBox(g, ped.x, 0.65, ped.z, 0.6, 1.3, 0.45, ped.color);
        pushBox(g, ped.x, 1.5, ped.z, 0.38, 0.38, 0.38, [0.85, 0.65, 0.5]);
      }
    }
    // The player on foot: a yellow jacket so the character reads on screen.
    if (state.player.onFoot) {
      const pp = state.player;
      pushBoxRot(g, pp.x, 0.65, pp.z, 0.6, 1.3, 0.45, pp.heading, [1.0, 0.85, 0.2]);
      pushBox(g, pp.x, 1.5, pp.z, 0.38, 0.38, 0.38, [0.85, 0.65, 0.5]);
    }
    const heli = state.police.heli;
    if (heli.active) {
      const hx = heli.x, hz = heli.z, hy = 48;
      pushBox(g, hx, hy, hz, 3.2, 1.7, 6.5, [0.85, 0.85, 0.8]);
      pushBox(g, hx, hy + 0.2, hz + 4.5, 0.8, 0.8, 4.5, [0.8, 0.8, 0.78]);
      const ra = time * 9;
      pushBoxRot(g, hx, hy + 1.1, hz, 9, 0.15, 0.5, ra, [0.15, 0.15, 0.15]);
      pushBoxRot(g, hx, hy + 1.1, hz, 0.5, 0.15, 9, ra, [0.15, 0.15, 0.15]);
      // Spotlight pool on the ground under the helicopter.
      pushQuad(g, [hx - 6, 0.12, hz - 6], [hx + 6, 0.12, hz - 6], [hx + 6, 0.12, hz + 6], [hx - 6, 0.12, hz + 6], [1.0, 0.95, 0.75], [0, 1, 0]);
    }
    for (const rb of state.police.roadblocks) {
      for (const b of rb.blocks) {
        pushBoxRot(g, b.x, 0.9, b.z, 2.2, 1.8, 1.2, rb.heading, [0.9, 0.85, 0.8]);
        pushBoxRot(g, b.x, 1.9, b.z, 2.2, 0.3, 1.2, rb.heading, [1.0, 0.3, 0.15]);
      }
    }
    for (const m of state.markers) {
      const bounce = 3 + Math.sin(time * 3) * 0.8;
      pushBox(g, m.x, 15, m.z, 0.9, 30, 0.9, m.color);
      pushBoxRot(g, m.x, bounce, m.z, 2.2, 2.2, 2.2, time * 1.5, m.color);
    }
    if (state.muzzle && state.muzzle.ttl > 0) {
      pushBox(g, state.muzzle.x, state.muzzle.y, state.muzzle.z, 0.9, 0.9, 0.9, [1.0, 0.9, 0.4]);
    }
    if (state.explosion && state.explosion.ttl > 0) {
      const s = 2 + (0.6 - state.explosion.ttl) * 10;
      pushBox(g, state.explosion.x, 1.5, state.explosion.z, s, s, s, [1.0, 0.45, 0.1]);
    }
    return toArrays(g);
  }

  render(state, dt) {
    if (this.mode === '2d' || !this.gl) {
      this.render2D(state);
      return;
    }
    const gl = this.gl;
    const time = state.time;
    const light = lightForHour(state.hour);
    // Camera: chase with snap on the first frame, smoothed after; iso on C.
    const p = state.player;
    const focus = p.onFoot
      ? { x: p.x, z: p.z, heading: p.heading }
      : { x: p.car.x, z: p.car.z, heading: p.car.heading };
    const fwdX = Math.sin(focus.heading);
    const fwdZ = -Math.cos(focus.heading);
    let desired, target;
    if (state.camera.mode === 'iso') {
      desired = { x: focus.x, y: 110, z: focus.z + 60 };
      target = { x: focus.x, y: 0, z: focus.z };
    } else if (p.onFoot) {
      // On foot the camera rides closer so the character reads on screen.
      desired = { x: focus.x - fwdX * 9, y: 4, z: focus.z - fwdZ * 9 };
      target = { x: focus.x + fwdX * 5, y: 1.2, z: focus.z + fwdZ * 5 };
    } else {
      desired = { x: focus.x - fwdX * 13, y: 5.5, z: focus.z - fwdZ * 13 };
      target = { x: focus.x + fwdX * 7, y: 1.5, z: focus.z + fwdZ * 7 };
    }
    if (this.firstFrame || state.camera.snap) {
      this.camPos = { ...desired };
      this.camTarget = { ...target };
      this.firstFrame = false;
      state.camera.snap = false;
    } else {
      const k = 1 - Math.exp(-5 * dt);
      this.camPos.x = lerp(this.camPos.x, desired.x, k);
      this.camPos.y = lerp(this.camPos.y, desired.y, k);
      this.camPos.z = lerp(this.camPos.z, desired.z, k);
      const k2 = 1 - Math.exp(-8 * dt);
      this.camTarget.x = lerp(this.camTarget.x, target.x, k2);
      this.camTarget.y = lerp(this.camTarget.y, target.y, k2);
      this.camTarget.z = lerp(this.camTarget.z, target.z, k2);
    }
    const aspect = this.w / Math.max(1, this.h);
    const proj = mat4Perspective((62 * Math.PI) / 180, aspect, 0.5, 1200);
    const view = mat4LookAt(this.camPos, this.camTarget, { x: 0, y: 1, z: 0 });
    const mvp = mat4Multiply(proj, view);
    gl.clearColor(light.sky[0], light.sky[1], light.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uMVP, false, mvp);
    gl.uniform1f(this.loc.uTime, time);
    gl.uniform3f(this.loc.uCamPos, this.camPos.x, this.camPos.y, this.camPos.z);
    gl.uniform3f(this.loc.uSunDir, light.sunDir[0], light.sunDir[1], light.sunDir[2]);
    gl.uniform3f(this.loc.uFogColor, light.fog[0], light.fog[1], light.fog[2]);
    gl.uniform1f(this.loc.uFogNear, 70);
    gl.uniform1f(this.loc.uFogFar, 430);
    gl.uniform1f(this.loc.uAmbient, light.ambient);
    const bindOnly = (buf, loc, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    // Static world: buffers were uploaded once by buildStatic; just bind them.
    bindOnly(this.staticBuf.pos, this.loc.aPos, 3);
    bindOnly(this.staticBuf.col, this.loc.aColor, 3);
    bindOnly(this.staticBuf.nor, this.loc.aNormal, 3);
    bindOnly(this.staticBuf.wav, this.loc.aWave, 1);
    gl.drawArrays(gl.TRIANGLES, 0, this.staticCount);
    // Dynamic entities: rebuild and re-upload each frame.
    const dyn = this.buildDynamic(state, time);
    const upload = (buf, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); };
    upload(this.dynBuf.pos, dyn.pos);
    upload(this.dynBuf.col, dyn.col);
    upload(this.dynBuf.nor, dyn.nor);
    upload(this.dynBuf.wav, dyn.wav);
    bindOnly(this.dynBuf.pos, this.loc.aPos, 3);
    bindOnly(this.dynBuf.col, this.loc.aColor, 3);
    bindOnly(this.dynBuf.nor, this.loc.aNormal, 3);
    bindOnly(this.dynBuf.wav, this.loc.aWave, 1);
    gl.drawArrays(gl.TRIANGLES, 0, dyn.count);
  }

  /** Top-down 2D fallback: same world state, drawn on the 2D canvas. */
  render2D(state) {
    const ctx = this.fallbackCanvas.getContext('2d');
    const w = this.fallbackCanvas.width;
    const h = this.fallbackCanvas.height;
    const scale = Math.min(w, h) / 620;
    const ox = w / 2;
    const oy = h / 2;
    const X = (x) => ox + x * scale;
    const Z = (z) => oy + z * scale;
    const S = (v) => v * scale;
    ctx.fillStyle = '#0e3a5c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#241f1b';
    ctx.fillRect(X(-320), Z(-320), S(640), S(640));
    ctx.fillStyle = '#9a7d55';
    ctx.fillRect(X(-260), Z(-260), S(520), S(520));
    ctx.strokeStyle = '#1b1b1e';
    ctx.lineWidth = Math.max(2, S(10));
    for (const lx of [-240, -180, -120, -60, 0, 60, 120, 180, 240]) {
      ctx.beginPath(); ctx.moveTo(X(lx), Z(-260)); ctx.lineTo(X(lx), Z(260)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-260), Z(lx)); ctx.lineTo(X(260), Z(lx)); ctx.stroke();
    }
    for (const b of state.city.buildings) {
      ctx.fillStyle = `rgb(${Math.floor(b.color[0] * 255)},${Math.floor(b.color[1] * 255)},${Math.floor(b.color[2] * 255)})`;
      ctx.fillRect(X(b.x - b.hw), Z(b.z - b.hd), S(b.w), S(b.d));
    }
    const v = state.city.volcano;
    ctx.fillStyle = '#4a3630';
    ctx.beginPath(); ctx.arc(X(v.x), Z(v.z), S(v.r), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5514';
    ctx.beginPath(); ctx.arc(X(v.x), Z(v.z), S(9), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(X(-332), Z(40), S(70), S(52));
    for (const m of state.markers) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(X(m.x), Z(m.z), 6 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2); ctx.fill();
    }
    for (const car of state.cars) {
      ctx.save();
      ctx.translate(X(car.x), Z(car.z));
      ctx.rotate(-car.heading);
      ctx.fillStyle = car.isCop ? '#2244cc' : car.isPlayer ? '#ff5533' : '#cccccc';
      ctx.fillRect(-S(1.1), -S(2.2), S(2.2), S(4.4));
      ctx.restore();
    }
    for (const ped of state.peds) {
      ctx.fillStyle = '#e8d8b0';
      ctx.fillRect(X(ped.x) - 2, Z(ped.z) - 2, 4, 4);
    }
    const heli = state.police.heli;
    if (heli.active) {
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(X(heli.x), Z(heli.z), 10, 0, Math.PI * 2); ctx.stroke();
    }
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const pz = p.onFoot ? p.z : p.car.z;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(X(px), Z(pz), 6, 0, Math.PI * 2); ctx.fill();
  }
}
