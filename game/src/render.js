// SOLMAR HEAT — render.js
// Draws the whole world on one canvas: ground, sea and beach, roads with
// lane markings, blocks, buildings with sun shadows and rooftops, parks and
// trees, cars, pedestrians, the player, particles and skid marks, then a
// warm sun-soaked light overlay. Camera follows the player with a smooth
// lerp, zooming out at speed, plus trauma-based screen shake.
function createRenderer(G) {
  const ctx = G.ctx;

  function drawGround(cam) {
    const { x0, y0, x1, y1 } = cam.view;
    // Base ground: warm dry grass / dirt.
    ctx.fillStyle = '#c9b489';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Water (east sea) with a slow shimmer.
    const w = G.city.water;
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(w.x, Math.max(y0, 0), w.w, Math.min(y1, G.city.H) - Math.max(y0, 0));
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const t = G.time;
    for (let i = 0; i < 8; i++) {
      const wy = ((i * 300 + t * 22) % (G.city.H + 120)) - 60;
      ctx.fillRect(w.x + 12 + (i % 3) * 44, wy, 60, 3);
    }
    // Beach sand.
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(G.city.beach.x, Math.max(y0, 0), G.city.beach.w, Math.min(y1, G.city.H) - Math.max(y0, 0));
    // Parks.
    for (const p of G.city.parks) {
      ctx.fillStyle = '#7fae62';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#8fbf72';
      ctx.fillRect(p.x + 10, p.y + 10, p.w - 20, p.h - 20);
    }
  }

  function drawRoads(cam) {
    const { x0, y0, x1, y1 } = cam.view;
    const RW = G.city.ROAD_W;
    ctx.fillStyle = '#3d3a38';
    for (const rx of G.city.roadsV) ctx.fillRect(rx - RW / 2, y0, RW, y1 - y0);
    for (const ry of G.city.roadsH) ctx.fillRect(x0, ry - RW / 2, x1 - x0, RW);
    // Sidewalk edging.
    ctx.fillStyle = '#a89a80';
    for (const rx of G.city.roadsV) {
      ctx.fillRect(rx - RW / 2 - 7, y0, 7, y1 - y0);
      ctx.fillRect(rx + RW / 2, y0, 7, y1 - y0);
    }
    for (const ry of G.city.roadsH) {
      ctx.fillRect(x0, ry - RW / 2 - 7, RW + 14, 7);
      ctx.fillRect(x0, ry + RW / 2, RW + 14, 7);
    }
    // Lane dashes.
    ctx.fillStyle = '#e8d44d';
    for (const rx of G.city.roadsV) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(rx - 2, y, 4, 22);
    }
    for (const ry of G.city.roadsH) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, ry - 2, 22, 4);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of G.city.roadsV) {
      for (const ry of G.city.roadsH) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(rx + i * 12 - 4, ry - RW / 2 + 6, 7, 12);
          ctx.fillRect(rx + i * 12 - 4, ry + RW / 2 - 18, 7, 12);
        }
      }
    }
  }

  function drawBuildings(cam) {
    const { x0, y0, x1, y1 } = cam.view;
    for (const b of G.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      // Sun shadow (offset down-right).
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(b.x + b.h * 0.5, b.y + b.h * 0.5, b.w, b.h);
      // Walls.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof inset.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop details (AC units / vents) from the building seed.
      const rng = U.mulberry32(Math.floor(b.seed * 1e9));
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const ux = b.x + 12 + rng() * (b.w - 32);
        const uy = b.y + 12 + rng() * (b.h - 32);
        ctx.fillRect(ux, uy, 14, 10);
      }
      // Landmark label.
      if (b.name) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(b.x + 8, b.y + b.h / 2 - 11, ctx.measureText(b.name).width + 92, 22);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★ ' + b.name, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
    // Trees in parks.
    for (const p of G.city.parks) {
      const rng = U.mulberry32(7);
      for (let i = 0; i < 14; i++) {
        const tx = p.x + 20 + rng() * (p.w - 40);
        const ty = p.y + 20 + rng() * (p.h - 40);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.arc(tx + 4, ty + 5, 13, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#4e8a3f';
        ctx.beginPath(); ctx.arc(tx, ty, 13, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#6fae52';
        ctx.beginPath(); ctx.arc(tx - 3, ty - 3, 8, 0, U.TAU); ctx.fill();
      }
    }
  }

  function drawMarker(cam) {
    const m = G.missions.marker;
    if (!m) return;
    const pulse = 1 + Math.sin(G.time * 4) * 0.12;
    // Beacon column.
    const grad = ctx.createLinearGradient(m.x, m.y - 260, m.x, m.y);
    grad.addColorStop(0, 'rgba(255,211,77,0)');
    grad.addColorStop(1, 'rgba(255,211,77,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(m.x - 16, m.y - 260, 32, 260);
    // Ground ring + arrow.
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, 26 * pulse, 0, U.TAU); ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 14); ctx.lineTo(m.x - 10, m.y + 8); ctx.lineTo(m.x + 10, m.y + 8);
    ctx.closePath(); ctx.fill();
    // Label.
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(m.label).width + 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(m.x - w / 2, m.y - 52, w, 22);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(m.label, m.x, m.y - 36);
  }

  function drawPickups() {
    for (const s of G.missions.stashes) {
      if (s.taken) continue;
      const bob = Math.sin(G.time * 3 + s.x) * 4;
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(s.x - 10, s.y - 7 + bob, 20, 14);
      ctx.fillStyle = '#8a6d1f';
      ctx.fillRect(s.x - 10, s.y - 7 + bob, 20, 4);
      ctx.fillStyle = 'rgba(255,211,77,0.5)';
      ctx.beginPath(); ctx.arc(s.x, s.y + bob, 18 + Math.sin(G.time * 3) * 4, 0, U.TAU); ctx.stroke();
    }
    for (const pk of G.pickups) {
      ctx.fillStyle = pk.kind === 'cash' ? '#3fce62' : '#ff5a5a';
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 7, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'cash' ? '$' : '+', pk.x, pk.y + 3.5);
    }
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-24, -12 + 4, 48, 26);
    if (car.disabled) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(-24, -13, 48, 26);
      ctx.fillStyle = '#222';
      ctx.fillRect(-10, -13, 20, 26);
      ctx.restore();
      return;
    }
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-24, -13, 48, 26, 7);
    ctx.fill();
    // Hood / trunk shading.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-24, -13, 12, 26);
    // Cabin + windows.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-6, -11, 18, 22, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,255,0.5)';
    ctx.fillRect(-2, -9, 10, 18);
    // Wheels.
    ctx.fillStyle = '#151515';
    ctx.fillRect(-17, -16, 10, 5); ctx.fillRect(-17, 11, 10, 5);
    ctx.fillRect(8, -16, 10, 5); ctx.fillRect(8, 11, 10, 5);
    // Headlights.
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(23, -10, 3, 5); ctx.fillRect(23, 5, 3, 5);
    // Taxi sign / police livery.
    if (car.type === 'taxi') {
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(-4, -15, 10, 4);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 6px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 1, -11.5);
    }
    if (car.type === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8, -13, 16, 26);
      ctx.fillStyle = '#2f6fd0';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 2);
      // Flashing light bar.
      const on = Math.floor(car.siren / 0.4) % 2 === 0;
      ctx.fillStyle = on ? '#ff2e2e' : '#2e7bff';
      ctx.beginPath(); ctx.arc(-2, 0, 5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = on ? '#2e7bff' : '#ff2e2e';
      ctx.beginPath(); ctx.arc(6, 0, 5, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(p) {
    const bob = p.state === 'walk' ? Math.sin(G.time * 10 + p.id) * 2 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob * 0.3);
    if (p.state === 'down') {
      ctx.rotate(1.2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, U.TAU); ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow + body.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 4, 9, 5, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.fill();
    // Head.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 - 2, 5, 0, U.TAU); ctx.fill();
    // Direction tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.angle) * 12, Math.sin(p.angle) * 12);
    ctx.stroke();
    if (p.mission === 'guard') {
      ctx.fillStyle = '#ff2e2e';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -14);
    }
    if (p.mission === 'courier') {
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◆', 0, -14);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const pl = G.player;
    if (pl.dead) return;
    if (pl.inCar) return; // drawn as the car
    ctx.save();
    ctx.translate(pl.x, pl.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 5, 11, 6, 0, 0, U.TAU); ctx.fill();
    const bob = pl.moving ? Math.sin(pl.walkPhase) * 1.5 : 0;
    ctx.translate(0, bob * 0.4);
    // White ring so the player always reads at a glance.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, U.TAU); ctx.stroke();
    // Body: red jacket (stands out), dark jeans.
    ctx.fillStyle = '#d9382b';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#22242e';
    ctx.beginPath(); ctx.arc(Math.cos(pl.angle) * 4, Math.sin(pl.angle) * 4, 6, 0, U.TAU); ctx.fill();
    // Head + facing.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(Math.cos(pl.angle) * 5, Math.sin(pl.angle) * 5 - 1, 5.5, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(Math.cos(pl.angle) * 5, Math.sin(pl.angle) * 5 - 3, 5, Math.PI, 0); ctx.fill();
    // Pistol in hand.
    if (pl.hasPistol) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(pl.angle) * 8, Math.sin(pl.angle) * 8);
      ctx.lineTo(Math.cos(pl.angle) * 18, Math.sin(pl.angle) * 18);
      ctx.stroke();
    }
    // Hurt flash.
    if (pl.hurtCd > 0.25) {
      ctx.strokeStyle = 'rgba(255,40,40,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, U.TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    // Skid marks (persistent, fading).
    for (const s of G.skids) {
      ctx.fillStyle = 'rgba(20,20,20,' + U.clamp(s.life / 6, 0, 0.55) + ')';
      ctx.fillRect(s.x - 3, s.y - 2, 6, 4);
    }
    for (const pt of G.particles) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = U.clamp(pt.life / pt.max, 0, 1);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, U.TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (G.muzzle && G.muzzle.t > 0) {
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(G.muzzle.x, G.muzzle.y, 7, 0, U.TAU); ctx.fill();
    }
  }

  function drawLight(cam) {
    // Warm sun wash + vignette for the sun-soaked look.
    const { x0, y0, x1, y1 } = cam.view;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const r = Math.max(x1 - x0, y1 - y0) * 0.75;
    const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    g.addColorStop(0, 'rgba(255,220,150,0.05)');
    g.addColorStop(1, 'rgba(20,10,40,0.20)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function draw(cam) {
    ctx.save();
    // Camera transform with shake.
    const shx = (Math.random() - 0.5) * cam.shake * 14;
    const shy = (Math.random() - 0.5) * cam.shake * 14;
    const vw = G.viewW, vh = G.viewH;
    const zx = vw / 2 - cam.x * cam.zoom + shx;
    const zy = vh / 2 - cam.y * cam.zoom + shy;
    ctx.setTransform(G.dpr * cam.zoom, 0, 0, G.dpr * cam.zoom, G.dpr * zx, G.dpr * zy);
    cam.view = {
      x0: cam.x - vw / 2 / cam.zoom - 40,
      y0: cam.y - vh / 2 / cam.zoom - 40,
      x1: cam.x + vw / 2 / cam.zoom + 40,
      y1: cam.y + vh / 2 / cam.zoom + 40,
    };
    drawGround(cam);
    drawRoads(cam);
    drawBuildings(cam);
    drawMarker(cam);
    drawPickups();
    drawParticles();
    // Cars sorted by y for a hint of depth.
    const cars = G.vehicles.cars.slice().sort((a, b) => a.y - b.y);
    for (const c of cars) drawCar(c);
    for (const p of G.peds.list) drawPed(p);
    for (const c of G.police.cops) drawPed(c);
    drawPlayer();
    drawLight(cam);
    ctx.restore();
    // Reset transform for HUD (drawn in screen space).
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  }

  return { draw };
}
