// input.js — keyboard + mouse state for CALDERA VIVA.
// Keys are tracked by `code`; `wasPressed` is an edge that main.js clears each frame.

export const keys = {};
export const edge = {};
export const mouse = { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldZ: 0 };

let attached = false;

export function initInput(canvas) {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) edge[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
}

export function isDown(code) {
  return !!keys[code];
}

export function wasPressed(code) {
  return !!edge[code];
}

/** Clear all edge flags at the end of a frame. */
export function endFrame() {
  for (const k of Object.keys(edge)) edge[k] = false;
  mouse.clicked = false;
}

/** Driving axes: -1..1 throttle (W/S, Up/Down) and steering (A/D, Left/Right). */
export function driveAxis() {
  const throttle = (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0) - (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0);
  const steer = (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0) - (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0);
  return { throttle, steer };
}

/** On-foot axes from WASD/arrows, relative to the camera heading. */
export function walkAxis() {
  const f = (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0) - (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0);
  const s = (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0) - (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0);
  return { f, s };
}

/** Test hook: pretend a key is held or released. */
export function simulateKey(code, down) {
  if (down && !keys[code]) edge[code] = true;
  keys[code] = down;
}
