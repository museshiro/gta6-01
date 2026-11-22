// SOLMAR HEAT 3D — render3d.js
// A hand-written raw WebGL renderer (no library, no vendor files): one
// batched draw call per frame builds Isla Solmar in low-poly 3D — extruded
// buildings, roads, beach and sea, Mount Ember, the Ember Lighthouse,
// cars, people, the CONDOR-1 helicopter and the mission beacon — from a
// perspective camera that follows the player at a ~52 degree pitch.
// Face-shaded vertex colors, distance fog and a day/night light level
// come from the game clock. If WebGL is unavailable (or a shader fails),
// createRenderer3D returns null and the game falls back to the 2D canvas
// renderer in render.js — playability is never sacrificed for the 3D look.
function createRenderer3D(G) {
  const canvas = G.glCanvas;
  if (!canvas) return null;
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false })
    || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const VS = [
    'attribute vec3 aPos;',
    'attribute vec4 aCol;',
    'uniform mat4 uMVP;',
    'uniform mat4 uMV;',
    'varying vec4 vCol;',
    'varying float vDepth;',
    'void main() {',
    '  vec4 p = uMVP * vec4(aPos, 1.0);',
    '  gl_Position = p;',
    '  vCol = aCol;',
    '  vDepth = -(uMV * vec4(aPos, 1.0)).z;',
    '}',
  ].join('\n');
  const FS = [
    'precision mediump float;',
    'varying vec4 vCol;',
    'varying float vDepth;',
    'uniform float uLight;',
    'uniform vec3 uFogColor;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'void main() {',
    '  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
    '  vec3 c = vCol.rgb * uLight;',
    '  gl_FragColor = vec4(mix(c, uFogColor, f), vCol.a);',
    '}',
  ].join('\n');

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aCol = gl.getAttribLocation(prog, 'aCol');
  const uMVP = gl.getUniformLocation(prog, 'uMVP');
  const uMV = gl.getUniformLocation(prog, 'uMV');
  const uLight = gl.getUniformLocation(prog, 'uLight');
  const uFogColor = gl.getUniformLocation(prog, 'uFogColor');
  const uFogNear = gl.getUniformLocation(prog, 'uFogNear');
  const uFogFar = gl.getUniformLocation(prog, 'uFogFar');

  // One dynamic vertex buffer, rebuilt every frame: pos(3) + rgba(4).
  const MAXV = 140000;
  const data = new Float32Array(MAXV * 7);
  let vn = 0;
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
  gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 28, 12);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // ---- tiny mat4 helpers (column-major) ----------------------------------
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    // x = up(0,1,0) x z
    let xx = zz, xy = 0, xz = -zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    // y = z x x
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1,
    ];
  }
  function multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }

  // ---- vertex emission -----------------------------------------------------
  function push(x, y, z, r, g, b, a) {
    if (vn >= MAXV) return;
    const o = vn * 7;
    data[o] = x; data[o + 1] = y; data[o + 2] = z;
    data[o + 3] = r; data[o + 4] = g; data[o + 5] = b; data[o + 6] = a;
    vn++;
  }
  function tri(ax, ay, az, bx, by, bz, cx, cy, cz, col, alpha, shade) {
    const c = U.hexRgb(col);
    const f = shade === undefined ? 1 : shade;
    push(ax, ay, az, c[0] * f, c[1] * f, c[2] * f, alpha);
    push(bx, by, bz, c[0] * f, c[1] * f, c[2] * f, alpha);
    push(cx, cy, cz, c[0] * f, c[1] * f, c[2] * f, alpha);
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col, alpha, shade) {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, col, alpha, shade);
    tri(ax, ay, az, cx, cy, cz, dx, dy, dz, col, alpha, shade);
  }
  // Axis-aligned box, base at y0. rot rotates the footprint around Y.
  // Top face uses roofCol; side faces are shaded by facing.
  function box(cx, y0, cz, w, h, d, col, roofCol, rot) {
    const hw = w / 2, hd = d / 2;
    const cs = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0;
    function rotPt(lx, lz) {
      return [cx + lx * cs - lz * sn, cz + lx * sn + lz * cs];
    }
    const p = [
      rotPt(-hw, -hd), rotPt(hw, -hd), rotPt(hw, hd), rotPt(-hw, hd),
    ];
    const y1 = y0 + h;
    // Top.
    quad(p[0][0], y1, p[0][1], p[1][0], y1, p[1][1], p[2][0], y1, p[2][1], p[3][0], y1, p[3][1], roofCol || col, 1, 1);
    // Sides (south, east, north, west) with sun shading.
    const sh = [0.85, 0.7, 0.6, 0.75];
    for (let s = 0; s < 4; s++) {
      const a = p[s], b = p[(s + 1) % 4];
      quad(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1], col, 1, sh[s]);
    }
  }
  // Flat quad on the ground (y ~ 0.5), e.g. roads, shadows, discs.
  function flat(x, z, w, d, col, alpha, rot) {
    const hw = w / 2, hd = d / 2;
    const cs = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0;
    function rp(lx, lz) { return [x + lx * cs - lz * sn, z + lx * sn + lz * cs]; }
    const a = rp(-hw, -hd), b = rp(hw, -hd), c = rp(hw, hd), e = rp(-hw, hd);
    quad(a[0], 0.6, a[1], b[0], 0.6, b[1], c[0], 0.6, c[1], e[0], 0.6, e[1], col, alpha, 1);
  }
  // Cone / pyramid with n segments, base at y0.
  function cone(cx, y0, cz, r, h, col, n) {
    const top = [cx, y0 + h, cz];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * U.TAU, a1 = ((i + 1) / n) * U.TAU;
      const bx = cx + Math.cos(a0) * r, bz = cz + Math.sin(a0) * r;
      const dx = cx + Math.cos(a1) * r, dz = cz + Math.sin(a1) * r;
      // Shade by facing: sun from the south-east.
      const mid = (a0 + a1) / 2;
      const shade = 0.55 + 0.45 * Math.max(0, Math.cos(mid - 0.8));
      tri(top[0], top[1], top[2], bx, y0, bz, dx, y0, dz, col, 1, shade);
    }
  }
  // Open cylinder side (n segments), base at y0.
  function cylinder(cx, y0, cz, r, h, col, n) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * U.TAU, a1 = ((i + 1) / n) * U.TAU;
      const bx = cx + Math.cos(a0) * r, bz = cz + Math.sin(a0) * r;
      const dx = cx + Math.cos(a1) * r, dz = cz + Math.sin(a1) * r;
      const mid = (a0 + a1) / 2;
      const shade = 0.6 + 0.4 * Math.max(0, Math.cos(mid - 0.8));
      quad(bx, y0, bz, dx, y0, dz, dx, y0 + h, dz, bx, y0 + h, bz, col, 1, shade);
    }
  }

  let lastMVP = null;
  let lastView = null;
  let lastEye = null;

  function draw(cam) {
    vn = 0;
    const W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);

    // ---- day / night from the game clock ---------------------------------
    const mins = G.clockMin || 600;
    const dayF = U.clamp(Math.sin(Math.PI * (mins - 360) / 720), 0, 1);
    const light = 0.35 + 0.65 * dayF;
    const golden = (mins > 960 && mins < 1140) || (mins > 300 && mins < 420) ? 0.6 : 0;
    // Fog / sky color: night blue -> day warm -> golden hour.
    let fr = U.lerp(0.10, 1.0, dayF), fg = U.lerp(0.14, 0.81, dayF), fb = U.lerp(0.25, 0.62, dayF);
    if (golden) { fr = U.lerp(fr, 1.0, golden); fg = U.lerp(fg, 0.60, golden); fb = U.lerp(fb, 0.36, golden); }

    // ---- camera: perspective, ~55 deg pitch, zoom out with speed ----------
    const pl = G.player;
    const speedF = pl.inCar ? U.clamp(Math.abs(pl.inCar.speed) / 730, 0, 1) : 0;
    const dist = 700 * (1 + speedF * 0.28);
    const pitch = 52 * Math.PI / 180;
    const eyeX = cam.x, eyeY = dist * Math.sin(pitch), eyeZ = cam.y + dist * Math.cos(pitch);
    const view = lookAt(eyeX, eyeY, eyeZ, cam.x, 0, cam.y);
    const proj = perspective(55 * Math.PI / 180, W / H, 1, 5200);
    const mvp = multiply(proj, view);
    lastMVP = mvp;
    lastView = view;
    lastEye = [eyeX, eyeY, eyeZ];

    // ---- world -------------------------------------------------------------
    const city = G.city;
    const vx0 = cam.x - 1100, vx1 = cam.x + 1100, vy0 = cam.y - 1100, vy1 = cam.y + 1100;
    const inView = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

    // Ground, beach, sea (extended past the map edge so the camera never sees void).
    flat(1600, 1200, 5600, 4600, '#c9b489', 1);
    flat(2985, 1200, 130, 4600, '#e8d5a0', 1);
    const wave = 0.04 * Math.sin(G.time * 1.4);
    flat(3625, 1200, 1150, 4600, U.shade('#2f7fb8', 1 + wave), 1);
    // Parks.
    for (const p of city.parks) flat(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, '#7fae62', 1);
    // Roads + sidewalks + lane dashes (dashes only in view).
    const RW = city.ROAD_W;
    for (const rx of city.roadsV) {
      flat(rx, 1200, RW, 4600, '#3d3a38', 1);
      flat(rx - RW / 2 - 4, 1200, 8, 4600, '#a89a80', 1);
      flat(rx + RW / 2 + 4, 1200, 8, 4600, '#a89a80', 1);
      for (let y = Math.floor(vy0 / 44) * 44; y < vy1; y += 44) flat(rx, y, 4, 22, '#e8d44d', 1);
    }
    for (const ry of city.roadsH) {
      flat(1600, ry, 5600, RW, '#3d3a38', 1);
      flat(1600, ry - RW / 2 - 4, 5600, 8, '#a89a80', 1);
      flat(1600, ry + RW / 2 + 4, 5600, 8, '#a89a80', 1);
      for (let x = Math.floor(vx0 / 44) * 44; x < vx1; x += 44) flat(x, ry, 22, 4, '#e8d44d', 1);
    }
    // Buildings (extruded boxes, height from the city seed).
    // Cutaway: skip buildings in the corridor between the camera (south
    // of the player) and the player, so a tall block never hides the hero.
    const corrX0 = cam.x - 170, corrX1 = cam.x + 170, corrY0 = cam.y + 30, corrY1 = cam.y + 520;
    for (const b of city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
      if (b.x + b.w > corrX0 && b.x < corrX1 && b.y + b.h > corrY0 && b.y < corrY1) continue;
      box(b.x + b.w / 2, 0, b.y + b.h / 2, b.w, b.h * 6, b.h, b.color, b.roof, 0);
    }
    // Trees in parks: trunk + cone canopy.
    for (const p of city.parks) {
      const rng = U.mulberry32(7);
      for (let i = 0; i < 14; i++) {
        const tx = p.x + 20 + rng() * (p.w - 40);
        const ty = p.y + 20 + rng() * (p.h - 40);
        if (!inView(tx, ty, 40)) continue;
        if (tx > corrX0 && tx < corrX1 && ty > corrY0 && ty < corrY1) continue;
        box(tx, 0, ty, 6, 14, 6, '#6b4a2b', '#6b4a2b', 0);
        cone(tx, 12, ty, 20, 34, '#4e8a3f', 6);
      }
    }
    // Mount Ember: big smoking cone + crater + drifting smoke puffs.
    const v = city.volcano;
    if (inView(v.x, v.y, 300)) {
      cone(v.x, 0, v.y, v.r, v.peak, '#5a3a28', 12);
      flat(v.x, v.y, 70, 70, '#2b1a12', 1);
      for (let i = 0; i < 3; i++) {
        const sy = v.peak + ((G.time * 26 + i * 55) % 130);
        const ss = 26 + i * 10 + ((G.time * 26 + i * 55) % 130) * 0.25;
        box(v.x + Math.sin(G.time * 0.5 + i * 2) * 24, sy, v.y + Math.cos(G.time * 0.4 + i) * 18, ss, ss * 0.7, ss, '#9a9a9a', '#9a9a9a', 0);
      }
    }
    // Ember Lighthouse: striped tower + lamp room.
    const lh = city.lighthouse;
    if (inView(lh.x, lh.y, 120)) {
      cylinder(lh.x, 0, lh.y, lh.r, lh.h * 0.55, '#f2f2f2', 8);
      cylinder(lh.x, lh.h * 0.55, lh.y, lh.r, lh.h * 0.45, '#c94f4f', 8);
      box(lh.x, lh.h, lh.y, 30, 22, 30, '#ffd34d', '#ffd34d', 0);
    }
    // Mission marker: crossed beacon column + ground disc.
    const m = G.missions.marker;
    if (m && inView(m.x, m.y, 120)) {
      const pulse = 0.7 + Math.sin(G.time * 4) * 0.3;
      quad(m.x - 16, 0, m.y, m.x + 16, 0, m.y, m.x + 16, 260, m.y, m.x - 16, 260, m.y, '#ffd34d', 0.30 * pulse, 1);
      quad(m.x, 0, m.y - 16, m.x, 0, m.y + 16, m.x, 260, m.y + 16, m.x, 260, m.y - 16, '#ffd34d', 0.30 * pulse, 1);
      flat(m.x, m.y, 52, 52, '#ffd34d', 0.5, 0);
    }
    // Hidden stashes: gold briefcases.
    for (const s of G.missions.stashes) {
      if (s.taken || !inView(s.x, s.y, 40)) continue;
      const bob = Math.sin(G.time * 3 + s.x) * 3;
      box(s.x, 2 + bob, s.y, 20, 12, 14, '#ffd34d', '#8a6d1f', 0);
    }
    // Pickups.
    for (const pk of G.pickups) {
      if (!inView(pk.x, pk.y, 30)) continue;
      box(pk.x, 4, pk.y, 12, 10, 12, pk.kind === 'cash' ? '#3fce62' : '#ff5a5a', pk.kind === 'cash' ? '#3fce62' : '#ff5a5a', 0);
    }
    // Skid marks.
    for (const s of G.skids) {
      if (!inView(s.x, s.y, 20)) continue;
      flat(s.x, s.y, 8, 5, '#141414', U.clamp(s.life / 6, 0, 0.55), 0);
    }
    // Particles as small bright boxes.
    for (const pt of G.particles) {
      if (!inView(pt.x, pt.y, 20)) continue;
      box(pt.x, 6, pt.y, pt.size * 2, pt.size * 2, pt.size * 2, pt.color, pt.color, 0);
    }
    if (G.muzzle && G.muzzle.t > 0) {
      box(G.muzzle.x, 8, G.muzzle.y, 12, 12, 12, '#ffe08a', '#ffe08a', 0);
    }
    // Cars: body + cabin + light bar / taxi sign.
    const cars = G.vehicles.cars.slice().sort((a, b) => a.y - b.y);
    for (const c of cars) {
      if (!inView(c.x, c.y, 80)) continue;
      if (c.disabled) { box(c.x, 0, c.y, 48, 10, 26, '#3a3a3a', '#222222', c.angle); continue; }
      box(c.x, 0, c.y, 48, 11, 26, c.color, c.color, c.angle);
      box(c.x - 2, 11, c.y, 20, 9, 22, '#1d2733', '#1d2733', c.angle);
      if (c.type === 'police') {
        const on = Math.floor(c.siren / 0.4) % 2 === 0;
        box(c.x - 2, 20, c.y - 6, 8, 5, 8, on ? '#ff2e2e' : '#2e7bff', on ? '#ff2e2e' : '#2e7bff', c.angle);
        box(c.x - 2, 20, c.y + 6, 8, 5, 8, on ? '#2e7bff' : '#ff2e2e', on ? '#2e7bff' : '#ff2e2e', c.angle);
      }
      if (c.type === 'taxi') box(c.x - 2, 20, c.y, 10, 4, 10, '#f2c200', '#f2c200', c.angle);
    }
    // Pedestrians + foot cops: body + head.
    function drawPerson(e, bodyCol, headCol) {
      if (!inView(e.x, e.y, 40)) return;
      if (e.state === 'down') { box(e.x, 0, e.y, 24, 8, 14, bodyCol, bodyCol, e.angle); return; }
      box(e.x, 0, e.y, 16, 20, 16, bodyCol, bodyCol, 0);
      box(e.x, 20, e.y, 10, 9, 10, headCol, headCol, 0);
    }
    for (const p of G.peds.list) drawPerson(p, p.color, '#e8b98a');
    for (const c of G.police.cops) drawPerson(c, '#2f4d7d', '#e8b98a');
    // The player: red jacket, white ground ring so he always reads.
    if (!pl.dead && !pl.inCar) {
      flat(pl.x, pl.y, 34, 34, '#ffffff', 0.85, 0);
      drawPerson(pl, '#d9382b', '#e8b98a');
      if (pl.weapon !== 'fist') {
        const gx = pl.x + Math.cos(pl.angle) * 18, gy = pl.y + Math.sin(pl.angle) * 18;
        box(gx, 12, gy, 14, 3, 3, '#1a1a1a', '#1a1a1a', pl.angle);
      }
    }
    // CONDOR-1: helicopter body + tail + spinning rotor + searchlight pool.
    const heli = G.police.heli;
    if (heli && heli.active) {
      flat(heli.x, heli.y, heli.searchR * 2, heli.searchR * 2, '#ffe08a', 0.16, 0);
      box(heli.x, 150, heli.y, 46, 16, 22, '#2f4d7d', '#2f4d7d', heli.angle);
      box(heli.x - Math.cos(heli.angle) * 34, 152, heli.y - Math.sin(heli.angle) * 34, 26, 8, 8, '#2f4d7d', '#2f4d7d', heli.angle);
      box(heli.x, 168, heli.y, 70, 3, 6, '#1a1a1a', '#1a1a1a', heli.rotor);
      box(heli.x, 168, heli.y, 6, 3, 70, '#1a1a1a', '#1a1a1a', heli.rotor);
    }

    // ---- upload + draw ------------------------------------------------------
    gl.clearColor(fr, fg, fb, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, vn * 7), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(mvp));
    gl.uniformMatrix4fv(uMV, false, new Float32Array(view));
    gl.uniform1f(uLight, light);
    gl.uniform3f(uFogColor, fr, fg, fb);
    gl.uniform1f(uFogNear, 900);
    gl.uniform1f(uFogFar, 2600);
    gl.drawArrays(gl.TRIANGLES, 0, vn);
  }

  // Project a world point to 2D screen pixels (for landmark labels).
  function project(x, y, z) {
    if (!lastMVP) return null;
    const m = lastMVP;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0) return null;
    const nx = cx / cw, ny = cy / cw;
    return {
      x: (nx * 0.5 + 0.5) * G.viewW,
      y: (1 - (ny * 0.5 + 0.5)) * G.viewH,
    };
  }

  // Unproject a screen pixel onto the ground plane (y = 0), so mouse aim
  // works under the perspective camera. Falls back to the player position
  // when the ray does not hit the ground.
  function screenToWorld(sx, sy) {
    if (!lastView || !lastEye) return { x: G.cam.x, y: G.cam.y };
    const nx = (sx / G.viewW) * 2 - 1;
    const ny = 1 - (sy / G.viewH) * 2;
    const tanV = Math.tan((55 * Math.PI / 180) / 2);
    const tanH = tanV * (canvas.width / canvas.height);
    const vx = nx * tanH, vy = ny * tanV, vz = -1;
    const m = lastView;
    const dx = m[0] * vx + m[4] * vy + m[8] * vz;
    const dy = m[1] * vx + m[5] * vy + m[9] * vz;
    const dz = m[2] * vx + m[6] * vy + m[10] * vz;
    if (dy >= -0.001) return { x: G.player.x, y: G.player.y };
    const t = -lastEye[1] / dy;
    return { x: lastEye[0] + dx * t, y: lastEye[2] + dz * t };
  }

  return { draw, project, screenToWorld, is3D: true };
}
