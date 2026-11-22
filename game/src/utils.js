// SOLMAR HEAT 3D — utils.js
// Small math, random and formatting helpers shared by every system.
// No dependencies. Deterministic helpers (mulberry32) keep the city
// layout identical on every load; the rest is plain arcade math.
const U = {
  TAU: Math.PI * 2,
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  angleLerp(a, b, t) { return a + U.angleDiff(a, b) * t; },
  rand(a, b) { return a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  // Deterministic RNG (mulberry32) so the city layout is identical every load.
  mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  // Circle vs axis-aligned rect: push the circle out, return true on overlap.
  circleRectResolve(p, r, rect) {
    const nx = U.clamp(p.x, rect.x, rect.x + rect.w);
    const ny = U.clamp(p.y, rect.y, rect.y + rect.h);
    const dx = p.x - nx, dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.y = ny + (dy / d) * r;
    } else {
      // Center inside the rect: push out along the smallest penetration axis.
      const left = p.x - rect.x, right = rect.x + rect.w - p.x;
      const top = p.y - rect.y, bottom = rect.y + rect.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = rect.x - r;
      else if (m === right) p.x = rect.x + rect.w + r;
      else if (m === top) p.y = rect.y - r;
      else p.y = rect.y + rect.h + r;
    }
    return true;
  },
  pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  },
  // Nice number formatting for the HUD.
  money(n) { return '$' + Math.floor(n).toLocaleString('en-US'); },
  // Game-clock formatting: minutes since midnight -> "14:05".
  clock(mins) {
    const m = Math.floor(mins) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },
  // Hex color string -> [r, g, b] floats 0..1, for the WebGL renderer.
  hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  },
  // Shade a hex color by a 0..1 factor (lighting on 3D faces).
  shade(hex, f) {
    const c = U.hexRgb(hex);
    const r = Math.round(U.clamp(c[0] * f, 0, 1) * 255);
    const g = Math.round(U.clamp(c[1] * f, 0, 1) * 255);
    const b = Math.round(U.clamp(c[2] * f, 0, 1) * 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  },
};
