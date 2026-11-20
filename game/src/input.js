// SOLMAR HEAT — input.js
// Keyboard + mouse state. Tracks held keys and edge-triggered presses
// (cleared once per frame by the main loop). Prevents page scroll on game keys.
function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  const GAME_KEYS = new Set([
    'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
  ]);

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
  }
  function onMouseUp() { mouse.down = false; }
  function onBlur() { keys.clear(); mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    keys, pressed, mouse,
    down(code) { return keys.has(code); },
    wasPressed(code) { return pressed.has(code); },
    // Movement axes: -1..1.
    moveX() {
      let x = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return x;
    },
    moveY() {
      let y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      return y;
    },
    run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    endFrame() { pressed.clear(); mouse.clicked = false; },
  };
}
