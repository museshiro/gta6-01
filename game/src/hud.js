// SOLMAR HEAT 3D — hud.js
// Everything on screen that is not the world: health, cash, wanted stars,
// ammo, speed, the minimap, mission objectives, district + clock + respect,
// the weapon wheel, toasts, and every menu — start screen with 3 save
// slots, pause with district standing, mission briefings, the garage
// upgrade dialog, busted/wasted, and the ending.
function createHud(G) {
  const ctx = G.ctx;
  const toasts = [];
  let dialog = null; // {title, lines}

  function toast(msg, dur) {
    toasts.push({ msg, t: dur || 3.2 });
    if (toasts.length > 3) toasts.shift();
  }
  function showDialog(title, lines) {
    dialog = { title, lines };
    G.state = 'dialog';
  }
  function closeDialog() {
    dialog = null;
    G.garageOpen = false;
    if (G.state === 'dialog') G.state = 'playing';
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function drawStars(x, y) {
    const lvl = G.police.wanted.level;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < lvl ? '#ffd34d' : 'rgba(0,0,0,0.45)';
      ctx.fillText('★', x + i * 26, y);
    }
  }

  function drawMinimap() {
    const mw = 196, mh = 150;
    const x = G.viewW - mw - 14, y = 14;
    const sx = mw / G.city.W, sy = mh / G.city.H;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.78)';
    rr(x - 6, y - 6, mw + 12, mh + 12, 10);
    ctx.beginPath();
    ctx.rect(x, y, mw, mh);
    ctx.clip();
    // Water + ground.
    ctx.fillStyle = '#274b63';
    ctx.fillRect(x, y, mw, mh);
    ctx.fillStyle = '#8a7a5c';
    ctx.fillRect(x, y, mw, mh - 0);
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(x + G.city.water.x * sx, y, G.city.water.w * sx, mh);
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(x + G.city.beach.x * sx, y, G.city.beach.w * sx, mh);
    // Volcano on the minimap.
    ctx.fillStyle = '#5a3a28';
    ctx.beginPath(); ctx.arc(x + G.city.volcano.x * sx, y + G.city.volcano.y * sy, 7, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#ff5a3a';
    ctx.beginPath(); ctx.arc(x + G.city.volcano.x * sx, y + G.city.volcano.y * sy, 3, 0, U.TAU); ctx.fill();
    // Roads.
    ctx.strokeStyle = '#3d3a38';
    ctx.lineWidth = 3;
    for (const rx of G.city.roadsV) {
      ctx.beginPath(); ctx.moveTo(x + rx * sx, y); ctx.lineTo(x + rx * sx, y + mh); ctx.stroke();
    }
    for (const ry of G.city.roadsH) {
      ctx.beginPath(); ctx.moveTo(x, y + ry * sy); ctx.lineTo(x + mw, y + ry * sy); ctx.stroke();
    }
    // Parks.
    ctx.fillStyle = '#5d8a48';
    for (const p of G.city.parks) ctx.fillRect(x + p.x * sx, y + p.y * sy, p.w * sx, p.h * sy);
    // Mission marker.
    const m = G.missions.marker;
    if (m) {
      const pulse = 1 + Math.sin(G.time * 5) * 0.3;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, 5 * pulse, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, 5 * pulse, 0, U.TAU); ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#4da3ff';
    for (const c of G.police.cops) {
      ctx.beginPath(); ctx.arc(x + c.x * sx, y + c.y * sy, 3, 0, U.TAU); ctx.fill();
    }
    for (const car of G.vehicles.cars) {
      if (car.driver === 'police') {
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath(); ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, U.TAU); ctx.fill();
      }
    }
    // CONDOR-1 blip.
    const heli = G.police.heli;
    if (heli && heli.active) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(x + heli.x * sx, y + heli.y * sy, 4.5, 0, U.TAU); ctx.fill();
    }
    // Player arrow.
    const pl = G.player;
    ctx.save();
    ctx.translate(x + pl.x * sx, y + pl.y * sy);
    ctx.rotate(pl.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Border + label.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, mw + 12, mh + 12, 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ISLA SOLMAR', x, y + mh + 20);
  }

  function drawBar(x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    rr(x, y, w, h, 5);
    ctx.fillStyle = color;
    rr(x + 2, y + 2, Math.max(0, (w - 4) * U.clamp(frac, 0, 1)), h - 4, 4);
  }

  function drawHud() {
    const pl = G.player;
    // Top-left block: stars, health, cash, weapon, respect, district, clock.
    ctx.textAlign = 'left';
    drawStars(16, 34);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(14, 44, 220, 84, 8);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('LEO MARÍN  ·  ' + G.missions.respectName(), 24, 62);
    drawBar(24, 68, 140, 10, pl.hp / pl.maxHp, pl.hp > 35 ? '#3fce62' : '#ff5a5a');
    ctx.fillStyle = '#3fce62';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(U.money(pl.cash), 172, 79);
    ctx.fillStyle = '#ffd34d';
    ctx.font = '13px sans-serif';
    const wname = pl.weapon === 'fist' ? 'Fist' : pl.weapon === 'pistol' ? 'Pistol' : pl.weapon === 'smg' ? 'SMG' : 'Shotgun';
    ctx.fillText('▸ ' + wname + (pl.weapon === 'fist' ? '' : '  ' + pl.ammo), 24, 98);
    if (pl.inCar) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px sans-serif';
      ctx.fillText('▸ ' + pl.inCar.name + (pl.inCar.hp < 45 ? '  — SMOKING' : ''), 24, 116);
      if (pl.upgrades.nitro) {
        ctx.fillStyle = pl.nitroCd <= 0 ? '#7df9ff' : '#888888';
        ctx.fillText(pl.nitroCd <= 0 ? '▸ NITRO ready (Shift)' : '▸ NITRO ' + Math.ceil(pl.nitroCd) + 's', 140, 116);
      }
    }
    // District + clock (top center, under the objective).
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const mins = G.clockMin || 600;
    const day = mins >= 360 && mins < 1080;
    ctx.fillText(G.city.districtAt(pl.x, pl.y).toUpperCase() + '   ·   ' + (day ? '☀ ' : '☾ ') + U.clock(mins) + '   ·   ' + G.audio.stationName(), G.viewW / 2, 56);
    // Speed when driving.
    if (pl.inCar) {
      const kmh = Math.round(Math.abs(pl.inCar.speed) * 0.32);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(G.viewW - 240, G.viewH - 64, 110, 50, 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(kmh), G.viewW - 168, G.viewH - 30);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('km/h', G.viewW - 142, G.viewH - 30);
    }
    // Mission objective (top center).
    const obj = G.missions.objective;
    if (obj && G.missions.idx >= 0 && G.missions.idx < 10) {
      ctx.font = 'bold 14px sans-serif';
      const w = ctx.measureText(obj).width + 28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      rr((G.viewW - w) / 2, 12, w, 30, 8);
      ctx.fillStyle = '#ffd34d';
      ctx.textAlign = 'center';
      ctx.fillText('◆ ' + obj, G.viewW / 2, 32);
    }
    // Toasts (bottom center).
    ctx.textAlign = 'center';
    let ty = G.viewH - 96;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      ctx.font = 'bold 15px sans-serif';
      const w = ctx.measureText(t.msg).width + 24;
      ctx.globalAlpha = U.clamp(t.t, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      rr((G.viewW - w) / 2, ty - 22, w, 28, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.msg, G.viewW / 2, ty - 3);
      ctx.globalAlpha = 1;
      ty -= 36;
    }
    drawMinimap();
    // Controls hint (fades after the first minute).
    if (G.time < 45 && G.state === 'playing') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WASD move/drive · E enter car · Space punch · Click shoot · Q weapon wheel · R radio · Shift run/nitro · M mute · P pause', 16, G.viewH - 14);
    }
    // Weapon wheel overlay.
    if (G.wheelOpen) drawWheel();
    // 3D landmark labels (projected from the WebGL camera).
    if (G.renderer && G.renderer.project) drawLabels();
  }

  // Landmark name chips projected from the 3D camera onto the 2D HUD.
  function drawLabels() {
    const L = G.city.landmarks;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    for (const key of Object.keys(L)) {
      const b = L[key];
      if (!b) continue;
      const c = G.city.buildingCenter(b);
      const s = G.renderer.project(c.x, (b.h || 10) * 6 + 20, c.y);
      if (!s || s.x < -40 || s.x > G.viewW + 40 || s.y < -20 || s.y > G.viewH + 20) continue;
      // Keep labels off the HUD: top band (objective/clock), the top-left
      // status panel, and the minimap.
      if (s.y < 110) continue;
      if (s.x < 260 && s.y < 150) continue;
      if (s.x > G.viewW - 240 && s.y < 210) continue;
      const w = ctx.measureText(b.name).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(s.x - w / 2, s.y - 11, w, 20, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('★ ' + b.name, s.x, s.y + 3);
    }
  }

  // Radial weapon wheel: 4 slots, mouse angle or number keys pick.
  function drawWheel() {
    const pl = G.player;
    const cx = G.viewW / 2, cy = G.viewH / 2, R = 130;
    ctx.fillStyle = 'rgba(5,8,16,0.55)';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    const slots = [
      { key: 'fist', label: '1  FIST', sub: 'always ready' },
      { key: 'pistol', label: '2  PISTOL', sub: pl.weapons.pistol.owned ? pl.weapons.pistol.ammo + ' rounds' : 'locked — job 3' },
      { key: 'smg', label: '3  SMG', sub: pl.weapons.smg.owned ? pl.weapons.smg.ammo + ' rounds' : 'locked — job 8' },
      { key: 'shotgun', label: '4  SHOTGUN', sub: pl.weapons.shotgun.owned ? pl.weapons.shotgun.ammo + ' shells' : 'locked — $800 garage' },
    ];
    slots.forEach((s, i) => {
      const a = -Math.PI / 2 + i * (Math.PI / 2);
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const owned = pl.weapons[s.key].owned;
      const sel = G.wheelSel === i;
      ctx.fillStyle = sel ? 'rgba(255,211,77,0.9)' : owned ? 'rgba(20,28,44,0.9)' : 'rgba(20,28,44,0.45)';
      ctx.beginPath(); ctx.arc(x, y, 52, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, 52, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = sel ? '#111111' : owned ? '#ffffff' : '#888888';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, x, y - 2);
      ctx.font = '11px sans-serif';
      ctx.fillText(s.sub, x, y + 16);
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WEAPON WHEEL', cx, cy - 190);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Click a slot or press 1–4 · Q to close', cx, cy + 200);
  }

  function drawMenu() {
    const cx = G.viewW / 2, cy = G.viewH / 2;
    // Sun-soaked gradient backdrop.
    const g = ctx.createLinearGradient(0, 0, 0, G.viewH);
    g.addColorStop(0, '#ff9a5c');
    g.addColorStop(0.45, '#e85d75');
    g.addColorStop(1, '#3d2b63');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    // Palm silhouettes.
    ctx.fillStyle = 'rgba(20,10,30,0.35)';
    for (let i = 0; i < 7; i++) {
      const px = (i * 197 + 60) % G.viewW;
      ctx.fillRect(px, G.viewH - 180, 10, 180);
      for (let f = 0; f < 5; f++) {
        const a = -0.4 - f * 0.35;
        ctx.beginPath();
        ctx.moveTo(px + 5, G.viewH - 180);
        ctx.quadraticCurveTo(px + 5 + Math.cos(a) * 70, G.viewH - 200 + Math.sin(a) * 30, px + 5 + Math.cos(a) * 120, G.viewH - 150 + Math.sin(a) * 60);
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(20,10,30,0.35)';
        ctx.stroke();
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.fillText('SOLMAR', cx, cy - 116);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('HEAT 3D', cx, cy - 28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9c9';
    ctx.font = '20px sans-serif';
    ctx.fillText('Ten jobs on volcanic Isla Solmar — steal, drive, run, and pay off the debt.', cx, cy + 16);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Hand-written WebGL 3D · 10 story missions · SMPD RAM / PIT / CONDOR-1 · weapon wheel · garage · radio · respect ranks', cx, cy + 48);
    ctx.fillText('WASD move / drive · E enter or steal a car · Space punch · Click to shoot · Q weapon wheel · R radio', cx, cy + 72);
    // Save slots.
    const saves = G.listSaves();
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('SAVE SLOTS — press 1, 2 or 3 to pick', cx, cy + 112);
    ctx.font = '14px sans-serif';
    saves.forEach((s, i) => {
      const sel = G.saveSlot === i;
      const label = s
        ? 'Slot ' + (i + 1) + ' — Job ' + (s.mission + 1) + '/10 · ' + U.money(s.cash) + ' · ' + s.respect + ' · ' + new Date(s.time).toLocaleDateString()
        : 'Slot ' + (i + 1) + ' — empty';
      ctx.fillStyle = sel ? '#ffd34d' : 'rgba(255,255,255,0.75)';
      ctx.font = (sel ? 'bold ' : '') + '15px sans-serif';
      ctx.fillText((sel ? '▶ ' : '    ') + label, cx, cy + 138 + i * 24);
    });
    const hasSave = !!saves[G.saveSlot];
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(hasSave ? '▶  Press ENTER — Continue' : '▶  Press ENTER — New Game', cx, cy + 228);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('A wholly original game. No Rockstar / GTA names, art, music or assets.', cx, G.viewH - 24);
    ctx.fillText('Headphones recommended — all sound is synthesized live.', cx, G.viewH - 44);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(5,8,16,0.72)';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('PAUSED', G.viewW / 2, G.viewH / 2 - 90);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText('P / Esc — resume', G.viewW / 2, G.viewH / 2 - 40);
    ctx.fillText('S — save game (slot ' + (G.saveSlot + 1) + ')', G.viewW / 2, G.viewH / 2 - 12);
    ctx.fillText('M — mute sound', G.viewW / 2, G.viewH / 2 + 16);
    ctx.fillText('Q — quit to menu', G.viewW / 2, G.viewH / 2 + 44);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Respect: ' + G.missions.respectName() + '  ·  Jobs done: ' + G.missions.completed + '/10', G.viewW / 2, G.viewH / 2 + 84);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '14px sans-serif';
    const st = G.missions.standing;
    ctx.fillText('District standing — Downtown ' + st.Downtown + ' · Docks ' + st['The Docks'] + ' · Palm Court ' + st['Palm Court'] + ' · Ember Hills ' + st['Ember Hills'] + ' · Beach ' + st['Solmar Beach'], G.viewW / 2, G.viewH / 2 + 110);
    const up = G.player.upgrades;
    ctx.fillText('Garage — Engine Lv' + up.engine + '/3 · Armor Lv' + up.armor + '/2 · Nitro ' + (up.nitro ? 'owned' : 'not owned'), G.viewW / 2, G.viewH / 2 + 134);
  }

  function drawDialog() {
    if (!dialog) return;
    ctx.fillStyle = 'rgba(5,8,16,0.6)';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    const w = Math.min(620, G.viewW - 80);
    const x = (G.viewW - w) / 2, y = G.viewH / 2 - 110;
    const h = 30 + dialog.lines.length * 26 + 44;
    ctx.fillStyle = 'rgba(12,16,28,0.95)';
    rr(x, y, w, h, 12);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(dialog.title, x + 20, y + 32);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '16px sans-serif';
    dialog.lines.forEach((ln, i) => ctx.fillText(ln, x + 20, y + 62 + i * 26));
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.garageOpen ? 'Press 1 / 2 / 3 to buy · E to leave' : 'Press E to continue', G.viewW / 2, y + 62 + dialog.lines.length * 26 + 16);
  }

  function drawOverlay(title, sub, color) {
    ctx.fillStyle = 'rgba(5,8,16,0.66)';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = color || '#ff5a5a';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(title, G.viewW / 2, G.viewH / 2 - 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText(sub, G.viewW / 2, G.viewH / 2 + 34);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Press ENTER to continue', G.viewW / 2, G.viewH / 2 + 78);
  }

  function drawEnding() {
    ctx.fillStyle = '#0e1420';
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('DEBT PAID.', G.viewW / 2, G.viewH / 2 - 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('Leo walked out of the Summit with the package and walked', G.viewW / 2, G.viewH / 2 - 8);
    ctx.fillText('back into the sun. Kroll is square. Isla Solmar is his.', G.viewW / 2, G.viewH / 2 + 22);
    ctx.fillStyle = '#9fe8b0';
    ctx.font = '17px sans-serif';
    ctx.fillText('Free roam unlocked — keep the island. Thanks for playing SOLMAR HEAT 3D.', G.viewW / 2, G.viewH / 2 + 66);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Press ENTER to keep playing', G.viewW / 2, G.viewH / 2 + 112);
  }

  function update(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].t -= dt;
      if (toasts[i].t <= 0) toasts.splice(i, 1);
    }
  }

  return {
    toast, showDialog, closeDialog,
    drawHud, drawMenu, drawPause, drawDialog, drawOverlay, drawEnding,
    update,
    get dialog() { return dialog; },
  };
}
