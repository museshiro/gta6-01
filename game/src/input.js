// input.js — keyboard + mouse state for CALDERA VIVA.

export function createInput(canvas) {
  const keys = {};
  const pressed = {}; // edge-triggered: true only on the frame the key went down
  const mouse = { x: 0, y: 0, down: false, clicked: false, dragDX: 0, dragDY: 0, wheel: 0 };
  let dragging = false, lastX = 0, lastY = 0;

  const norm = (e) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
  window.addEventListener('keydown', (e) => {
    const k = norm(e);
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[norm(e)] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', (e) => { mouse.down = true; mouse.clicked = true; dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', () => { mouse.down = false; dragging = false; });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (dragging) { mouse.dragDX += e.clientX - lastX; mouse.dragDY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; }
  });
  canvas.addEventListener('wheel', (e) => { mouse.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    keys, pressed, mouse,
    down(...ks) { return ks.some((k) => keys[k]); },
    hit(...ks) { return ks.some((k) => pressed[k]); },
    endFrame() {
      for (const k in pressed) pressed[k] = false;
      mouse.clicked = false; mouse.dragDX = 0; mouse.dragDY = 0; mouse.wheel = 0;
    },
  };
}
