// utils.js — seeded RNG, small math helpers and a minimal mat4 for the WebGL renderer.
// CALDERA VIVA (Isla Caldera): every helper here is written for this game only.

/** Deterministic RNG (mulberry32): same seed, same stream, every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-path angle interpolation (angles in radians). */
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Wrap an angle to [-PI, PI]. */
export function angleWrap(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

/** Forward vector for a heading (0 faces -z, north). */
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

// ---------------------------------------------------------------- mat4 (column-major, WebGL style)

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mat4LookAt(eye, target, up) {
  const zx = eye.x - target.x;
  const zy = eye.y - target.y;
  const zz = eye.z - target.z;
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  const z0 = zx / len, z1 = zy / len, z2 = zz / len;
  const xx = up.y * z2 - up.z * z1;
  const xy = up.z * z0 - up.x * z2;
  const xz = up.x * z1 - up.y * z0;
  len = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  const x0 = xx / len, x1 = xy / len, x2 = xz / len;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  const m = new Float32Array(16);
  m[0] = x0; m[1] = y0; m[2] = z0; m[3] = 0;
  m[4] = x1; m[5] = y1; m[6] = z1; m[7] = 0;
  m[8] = x2; m[9] = y2; m[10] = z2; m[11] = 0;
  m[12] = -(x0 * eye.x + x1 * eye.y + x2 * eye.z);
  m[13] = -(y0 * eye.x + y1 * eye.y + y2 * eye.z);
  m[14] = -(z0 * eye.x + z1 * eye.y + z2 * eye.z);
  m[15] = 1;
  return m;
}

/** out = a * b (both column-major). */
export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}
