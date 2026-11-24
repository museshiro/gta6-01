// render.js — WebGL low-poly renderer for CALDERA VIVA, plus a 2D top-down
// fallback used when WebGL is unavailable (?mode=2d or context failure).
// One shader, vertex colours, flat lambert light, distance fog, animated sea.

import {
  mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt,
  mat4Translate, mat4Scale, mat4RotateY, clamp, lerp,
} from './utils.js';
import { BEACH_Z, WATER_Z, WORLD_BOUND } from './city.js';

const VERT = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
uniform vec3 uTint; uniform float uTime; uniform float uWater; uniform vec3 uCam;
varying vec3 vCol; varying vec3 vNorm; varying float vDist;
void main(){
  vec3 p = aPos;
  if (uWater > 0.5) p.y += sin(p.x * 0.08 + uTime * 1.4) * 0.5 + cos(p.z * 0.06 + uTime) * 0.4;
  vec4 w = uModel * vec4(p, 1.0);
  vCol = aCol * uTint;
  vNorm = mat3(uModel) * aNorm;
  vDist = distance(w.xyz, uCam);
  gl_Position = uProj * uView * w;
}`;
const FRAG = `
precision mediump float;
varying vec3 vCol; varying vec3 vNorm; varying float vDist;
uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uCam;
void main(){
  float d = max(dot(normalize(vNorm), normalize(uSun)), 0.0);
  vec3 col = vCol * (0.52 + 0.48 * d);
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(col, uFog, f), 1.0);
}`;

// Sky palettes by time of day (hour 0-24): [sky, fog, sunDir, sunStrength]
export function skyFor(hour) {
  if (hour >= 6 && hour < 10) return { sky: [0.98, 0.72, 0.45], fog: [0.98, 0.72, 0.48], sun: [0.6, 0.5, 0.4] };
  if (hour >= 10 && hour < 16) return { sky: [0.45, 0.75, 0.92], fog: [0.62, 0.78, 0.88], sun: [0.4, 0.9, 0.3] };
  if (hour >= 16 && hour < 19) return { sky: [0.99, 0.55, 0.32], fog: [0.96, 0.55, 0.38], sun: [-0.7, 0.35, 0.5] };
  if (hour >= 19 && hour < 21) return { sky: [0.45, 0.28, 0.55], fog: [0.55, 0.32, 0.55], sun: [-0.8, 0.15, 0.3] };
  return { sky: [0.08, 0.10, 0.22], fog: [0.10, 0.12, 0.25], sun: [0.2, 0.6, -0.4] };
}

class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  quad(a, b, c, d, n, col) {
    // two triangles a-b-c, a-c-d with one normal and colour
    const vs = [a, b, c, a, c, d];
    for (const v of vs) { this.pos.push(v[0], v[1], v[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(col[0], col[1], col[2]); }
  }
  box(cx, cy, cz, sx, sy, sz, col, topCol) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const top = topCol || col;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col);
  }
  cone(cx, cz, baseY, h, r, col, seg) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, baseY, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, baseY, cz + Math.sin(a1) * r];
      const top = [cx, baseY + h, cz];
      const n = [Math.cos((a0 + a1) / 2) * 0.7, 0.7, Math.sin((a0 + a1) / 2) * 0.7];
      this.pos.push(...p0, ...p1, ...top);
      for (let k = 0; k < 3; k++) { this.nor.push(n[0], n[1], n[2]); this.col.push(col[0], col[1], col[2]); }
    }
  }
  toArrays() {
    return {
      pos: new Float32Array(this.pos), nor: new Float32Array(this.nor),
      col: new Float32Array(this.col), count: this.pos.length / 3,
    };
  }
}

function buildWorldMesh(city) {
  const b = new MeshBuilder();
  // Ground base: dry grass / dirt.
  b.box(0, -0.6, -40, WORLD_BOUND * 2 + 120, 1, WORLD_BOUND * 2 + 120, [0.55, 0.48, 0.32]);
  // Black-sand beach strip.
  b.box(0, -0.35, (BEACH_Z + WATER_Z) / 2 + 4, WORLD_BOUND * 2 + 120, 0.6, WATER_Z - BEACH_Z + 12, [0.16, 0.14, 0.15]);
  // Roads: dark asphalt strips with pale sidewalks.
  for (const rx of city.roadsX) b.box(rx, -0.15, 0, 12, 0.5, WORLD_BOUND * 2, [0.22, 0.22, 0.25]);
  for (const rz of city.roadsZ) b.box(0, -0.15, rz, WORLD_BOUND * 2, 0.5, 12, [0.22, 0.22, 0.25]);
  for (const rx of city.roadsX) {
    b.box(rx - 8, -0.1, 0, 4, 0.4, WORLD_BOUND * 2, [0.62, 0.58, 0.52]);
    b.box(rx + 8, -0.1, 0, 4, 0.4, WORLD_BOUND * 2, [0.62, 0.58, 0.52]);
  }
  // Centre dashes.
  for (const rx of city.roadsX) for (let z = -200; z <= 200; z += 16) b.box(rx, 0.12, z, 0.6, 0.08, 6, [0.95, 0.85, 0.4]);
  for (const rz of city.roadsZ) for (let x = -200; x <= 200; x += 16) b.box(x, 0.12, rz, 6, 0.08, 0.6, [0.95, 0.85, 0.4]);
  // Plazas.
  for (const p of city.plazas) b.box(p.x, -0.1, p.z, p.w, 0.4, p.d, [0.75, 0.68, 0.55]);
  // Buildings with glass band near the top.
  for (const bd of city.buildings) {
    b.box(bd.x, bd.h / 2, bd.z, bd.w, bd.h, bd.d, bd.color, bd.roof);
    b.box(bd.x, bd.h * 0.72, bd.z, bd.w + 0.15, bd.h * 0.18, bd.d + 0.15, [0.35, 0.55, 0.65]);
  }
  // Palms: trunk + frond crown.
  for (const t of city.trees) {
    b.box(t.x, 1.6 * t.s, t.z, 0.35 * t.s, 3.2 * t.s, 0.35 * t.s, [0.45, 0.32, 0.20]);
    b.box(t.x, 3.4 * t.s, t.z, 3.4 * t.s, 0.5 * t.s, 3.4 * t.s, [0.15, 0.55, 0.25]);
  }
  // Lamps: pole + head.
  for (const l of city.lamps) {
    b.box(l.x, 2.6, l.z, 0.18, 5.2, 0.18, [0.25, 0.25, 0.28]);
    b.box(l.x, 5.3, l.z, 0.7, 0.3, 0.7, [1.0, 0.9, 0.6]);
  }
  // Pier deck + posts.
  b.box(30, 0.4, 222, 26, 0.8, 34, [0.55, 0.42, 0.28]);
  for (let z = 210; z <= 238; z += 7) { b.box(19, -0.5, z, 1, 2, 1, [0.4, 0.3, 0.2]); b.box(41, -0.5, z, 1, 2, 1, [0.4, 0.3, 0.2]); }
  // Volcano cone far north + glowing crater rim.
  b.cone(0, -330, 0, 130, 150, [0.32, 0.24, 0.22], 12);
  b.cone(0, -330, 118, 14, 22, [0.95, 0.35, 0.10], 12);
  // Boardwalk neon strip.
  b.box(0, 0.25, 176, 260, 0.5, 3, [0.95, 0.35, 0.55]);
  // Garage block + impound fence + mansion wall (visible anchors).
  b.box(-52, 3, 97, 18, 6, 12, [0.85, 0.55, 0.25], [0.35, 0.30, 0.28]);
  b.box(120, 2, -140, 24, 4, 16, [0.45, 0.45, 0.50], [0.30, 0.30, 0.34]);
  b.box(-150, 4, -150, 26, 8, 18, [0.92, 0.88, 0.78], [0.55, 0.25, 0.18]);
  return b.toArrays();
}

function buildWaterMesh() {
  const b = new MeshBuilder();
  b.box(0, -0.8, 320, WORLD_BOUND * 2 + 400, 0.6, 260, [0.10, 0.35, 0.55]);
  return b.toArrays();
}

function buildUnitBox() {
  const b = new MeshBuilder();
  b.box(0, 0, 0, 1, 1, 1, [1, 1, 1]);
  return b.toArrays();
}

export function createRenderer(canvas, city) {
  const params = new URLSearchParams(location.search);
  let gl = null;
  if (params.get('mode') !== '2d') {
    try { gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
  }
  const ctx2d = canvas.getContext('2d');
  const state = { mode: gl ? '3d' : '2d', time: 0, camMode: 'chase', orbitYaw: 0, orbitPitch: 0 };

  let prog = null, bufWorld = null, bufWater = null, bufUnit = null, uni = {};
  if (gl) {
    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    uni = {
      proj: gl.getUniformLocation(prog, 'uProj'), view: gl.getUniformLocation(prog, 'uView'),
      model: gl.getUniformLocation(prog, 'uModel'), tint: gl.getUniformLocation(prog, 'uTint'),
      time: gl.getUniformLocation(prog, 'uTime'), water: gl.getUniformLocation(prog, 'uWater'),
      sun: gl.getUniformLocation(prog, 'uSun'), fog: gl.getUniformLocation(prog, 'uFog'),
      fogNear: gl.getUniformLocation(prog, 'uFogNear'), fogFar: gl.getUniformLocation(prog, 'uFogFar'),
      cam: gl.getUniformLocation(prog, 'uCam'),
    };
    const mkBuf = (arr) => {
      const mk = (data, loc, size) => {
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return buf;
      };
      const posLoc = gl.getAttribLocation(prog, 'aPos'), norLoc = gl.getAttribLocation(prog, 'aNorm'), colLoc = gl.getAttribLocation(prog, 'aCol');
      return {
        pos: mk(arr.pos, posLoc, 3), nor: mk(arr.nor, norLoc, 3), col: mk(arr.col, colLoc, 3),
        count: arr.count,
      };
    };
    bufWorld = mkBuf(buildWorldMesh(city));
    bufWater = mkBuf(buildWaterMesh());
    bufUnit = mkBuf(buildUnitBox());
    gl.enable(gl.DEPTH_TEST);
  }

  function bindBuf(b) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.col); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  }

  function drawBoxAt(x, y, z, sx, sy, sz, yaw, tint, pitch = 0) {
    let m = mat4Multiply(mat4Translate(x, y, z), mat4RotateY(yaw));
    m = mat4Multiply(m, mat4Scale(sx, sy, sz));
    gl.uniformMatrix4fv(uni.model, false, m);
    gl.uniform3fv(uni.tint, tint);
    gl.drawArrays(gl.TRIANGLES, 0, bufUnit.count);
  }

  function drawCar(car, isPolice) {
    const body = car.color || [0.8, 0.2, 0.2];
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const px = -fz, pz = fx; // side axis
    drawBoxAt(car.x, 0.55, car.z, 2.0, 0.7, 4.4, car.angle, body);
    drawBoxAt(car.x - fx * 0.3, 1.15, car.z - fz * 0.3, 1.7, 0.55, 2.2, car.angle, [0.12, 0.16, 0.20]);
    const wheel = [0.08, 0.08, 0.09];
    for (const [sx, sz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      drawBoxAt(car.x + px * sx + fx * sz, 0.35, car.z + pz * sx + fz * sz, 0.3, 0.7, 0.7, car.angle, wheel);
    }
    if (isPolice) {
      drawBoxAt(car.x, 0.95, car.z, 1.9, 0.12, 0.6, car.angle, [1, 1, 1]);
      drawBoxAt(car.x - fx * 0.2, 1.55, car.z - fz * 0.2, 0.5, 0.18, 0.4, car.angle, car.lightOn ? [1, 0.1, 0.1] : [0.1, 0.1, 0.6]);
      drawBoxAt(car.x + fx * 0.2, 1.55, car.z + fz * 0.2, 0.5, 0.18, 0.4, car.angle, car.lightOn ? [0.1, 0.1, 1] : [0.6, 0.1, 0.1]);
    }
    // Fake blob shadow.
    drawBoxAt(car.x, 0.06, car.z, 2.2, 0.05, 4.6, car.angle, [0.05, 0.05, 0.06]);
  }

  function drawPed(p) {
    const bob = p.moving ? Math.sin(state.time * 10 + p.phase) * 0.08 : 0;
    drawBoxAt(p.x, 0.85 + bob, p.z, 0.7, 1.5, 0.45, p.angle, p.shirt);
    drawBoxAt(p.x, 1.75 + bob, p.z, 0.45, 0.45, 0.45, p.angle, p.skin);
    drawBoxAt(p.x, 0.06, p.z, 0.9, 0.05, 0.7, p.angle, [0.05, 0.05, 0.06]);
  }

  function drawHeli(h) {
    drawBoxAt(h.x, h.y, h.z, 3.2, 1.4, 6.0, h.angle, [0.15, 0.35, 0.45]);
    drawBoxAt(h.x - Math.sin(h.angle) * 4, h.y + 0.3, h.z - Math.cos(h.angle) * 4, 0.8, 0.8, 4.5, h.angle, [0.12, 0.30, 0.40]);
    const rotor = state.time * 18;
    drawBoxAt(h.x, h.y + 0.9, h.z, 9, 0.08, 0.5, rotor, [0.2, 0.2, 0.2]);
    // Searchlight cone (a translucent-looking pale box aimed down).
    drawBoxAt(h.x, h.y - 6, h.z, 3.5, 12, 3.5, h.angle, [1.0, 0.95, 0.6]);
  }

  function render3D(view) {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    const sky = skyFor(view.hour);
    gl.clearColor(sky.sky[0], sky.sky[1], sky.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mat4Perspective(1.05, w / h, 0.5, 900);
    const eye = view.camEye, tgt = view.camTarget;
    const viewM = mat4LookAt(eye, tgt, [0, 1, 0]);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uni.proj, false, proj);
    gl.uniformMatrix4fv(uni.view, false, viewM);
    gl.uniform1f(uni.time, state.time);
    gl.uniform3fv(uni.sun, sky.sun);
    gl.uniform3fv(uni.fog, sky.fog);
    gl.uniform3fv(uni.cam, eye);
    gl.uniform1f(uni.fogNear, 90); gl.uniform1f(uni.fogFar, 420);
    // Static world.
    bindBuf(bufWorld);
    gl.uniformMatrix4fv(uni.model, false, mat4Identity());
    gl.uniform3fv(uni.tint, [1, 1, 1]);
    gl.uniform1f(uni.water, 0);
    gl.drawArrays(gl.TRIANGLES, 0, bufWorld.count);
    // Sea.
    bindBuf(bufWater);
    gl.uniform1f(uni.water, 1);
    gl.drawArrays(gl.TRIANGLES, 0, bufWater.count);
    gl.uniform1f(uni.water, 0);
    // Dynamics share the unit box.
    bindBuf(bufUnit);
    for (const c of view.parked) drawCar(c, false);
    for (const c of view.missionCars || []) drawCar(c, false);
    for (const c of view.traffic) drawCar(c, false);
    for (const c of view.policeCars) drawCar(c, true);
    if (view.playerCar) drawCar(view.playerCar, false);
    if (view.roadblock) for (const c of view.roadblock) drawCar(c, true);
    for (const p of view.peds) drawPed(p);
    if (view.playerOnFoot) drawPed(view.playerOnFoot);
    if (view.heli) drawHeli(view.heli);
    if (view.marker) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      drawBoxAt(view.marker.x, 3.2, view.marker.z, 1.2 * pulse, 6.4, 1.2 * pulse, state.time, [1.0, 0.85, 0.1]);
      drawBoxAt(view.marker.x, 0.15, view.marker.z, 5, 0.2, 5, 0, [1.0, 0.85, 0.1]);
    }
    for (const pt of view.particles || []) {
      drawBoxAt(pt.x, pt.y, pt.z, pt.s, pt.s, pt.s, 0, pt.color);
    }
  }

  function render2D(view) {
    const w = canvas.width, h = canvas.height;
    ctx2d.fillStyle = '#1a2b3c'; ctx2d.fillRect(0, 0, w, h);
    const s = Math.min(w, h) / 480; // world units per px scale
    const cx = view.focus.x, cz = view.focus.z;
    const X = (x) => w / 2 + (x - cx) * s, Z = (z) => h / 2 + (z - cz) * s;
    ctx2d.fillStyle = '#8a7a5a'; ctx2d.fillRect(0, 0, w, h);
    ctx2d.fillStyle = '#202024';
    for (const rx of city.roadsX) ctx2d.fillRect(X(rx - 6), 0, 12 * s, h);
    for (const rz of city.roadsZ) ctx2d.fillRect(0, Z(rz - 6), w, 12 * s);
    ctx2d.fillStyle = '#c9b183';
    for (const b of city.buildings) ctx2d.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * s, b.d * s);
    ctx2d.fillStyle = '#141210'; ctx2d.fillRect(0, Z(BEACH_Z), w, h - Z(BEACH_Z));
    ctx2d.fillStyle = '#0e4d7a'; ctx2d.fillRect(0, Z(WATER_Z), w, h - Z(WATER_Z));
    const dot = (x, z, r, col) => { ctx2d.fillStyle = col; ctx2d.beginPath(); ctx2d.arc(X(x), Z(z), r, 0, 7); ctx2d.fill(); };
    for (const c of view.traffic) dot(c.x, c.z, 4, '#ddd');
    for (const c of view.policeCars) dot(c.x, c.z, 5, '#2266ff');
    for (const p of view.peds) dot(p.x, p.z, 2.5, '#f5d0a0');
    if (view.playerCar) dot(view.playerCar.x, view.playerCar.z, 6, '#ffcc00');
    if (view.playerOnFoot) dot(view.playerOnFoot.x, view.playerOnFoot.z, 5, '#ffcc00');
    if (view.marker) { ctx2d.strokeStyle = '#ffcc00'; ctx2d.lineWidth = 3; ctx2d.beginPath(); ctx2d.arc(X(view.marker.x), Z(view.marker.z), 10 + Math.sin(state.time * 4) * 3, 0, 7); ctx2d.stroke(); }
    if (view.heli) dot(view.heli.x, view.heli.z, 7, '#66ccff');
    ctx2d.fillStyle = '#fff'; ctx2d.font = 'bold 16px sans-serif';
    ctx2d.fillText('CALDERA VIVA — mode top-down 2D (fallback WebGL)', 14, 104);
  }

  return {
    get mode() { return state.mode; },
    get camMode() { return state.camMode; },
    setCamMode(m) { state.camMode = m; },
    resize(w, h) { canvas.width = w; canvas.height = h; },
    render(view, dt) {
      state.time += dt;
      if (state.mode === '3d') render3D(view); else render2D(view);
    },
  };
}

// Compute the chase / iso camera for the current focus (player pos + heading).
export function computeCamera(focus, heading, camMode, orbitYaw, dt, prev) {
  let eye, target = [focus.x, 1.6, focus.z];
  if (camMode === 'iso') {
    eye = [focus.x + 42, 46, focus.z + 42];
  } else if (camMode === 'high') {
    eye = [focus.x - Math.sin(heading) * 16, 26, focus.z - Math.cos(heading) * 16];
    target = [focus.x + Math.sin(heading) * 14, 0, focus.z + Math.cos(heading) * 14];
  } else {
    const yaw = heading + Math.PI + orbitYaw;
    const dist = 13, height = 6.2;
    eye = [
      focus.x + Math.sin(yaw) * dist,
      height,
      focus.z + Math.cos(yaw) * dist,
    ];
    target = [focus.x + Math.sin(heading) * 9, 1.8, focus.z + Math.cos(heading) * 9];
  }
  // First frame: snap straight to the computed pose instead of swooping in
  // from a bogus origin (which also put the camera inside buildings).
  if (!prev) return { eye: eye.slice(), target: target.slice() };
  const out = prev;
  const k = 1 - Math.pow(0.0001, dt); // frame-rate independent smoothing
  out.eye[0] = lerp(out.eye[0], eye[0], k); out.eye[1] = lerp(out.eye[1], eye[1], k); out.eye[2] = lerp(out.eye[2], eye[2], k);
  out.target[0] = lerp(out.target[0], target[0], k); out.target[1] = lerp(out.target[1], target[1], k); out.target[2] = lerp(out.target[2], target[2], k);
  out.eye[1] = Math.max(out.eye[1], 2.2);
  return out;
}
