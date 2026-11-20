// SOLMAR HEAT — city.js
// Generates the city of Solmar: a sun-soaked coastal grid city with avenues,
// streets, blocks of buildings, parks, a beach and the sea. Deterministic
// (seeded), so every load builds the same city. Also answers collision and
// placement queries for the rest of the game.
function createCity() {
  const W = 3200, H = 2400;
  const ROAD_W = 96;
  const rng = U.mulberry32(20261120);

  // Avenue (vertical) and street (horizontal) center lines.
  const roadsV = [220, 620, 1020, 1420, 1820, 2220, 2620];
  const roadsH = [220, 620, 1020, 1420, 1820, 2180];

  const buildings = [];
  const parks = [];
  const PALETTES = [
    ['#e8b48a', '#d99a6c', '#c97e4e'], // warm terracotta
    ['#f2d8a7', '#eac07c', '#ddb26a'], // sand
    ['#b8c4d4', '#9fb0c8', '#8498b8'], // cool blue-grey
    ['#e6a3b8', '#d98aa5', '#c9748f'], // rose
    ['#a8c8a0', '#8fb585', '#77a06d'], // sage
    ['#d8c8e8', '#c2aede', '#ab94cf'], // lavender
  ];
  function buildingColor() {
    const pal = U.pick(PALETTES);
    return U.pick(pal);
  }

  // Blocks between roads. Leave the beach strip (x > 2920) and the park block free.
  const parkBlock = { bx: 4, by: 2 }; // block indices (avenue 4..5, street 2..3)
  for (let bi = 0; bi < roadsV.length - 1; bi++) {
    for (let bj = 0; bj < roadsH.length - 1; bj++) {
      const x0 = roadsV[bi] + ROAD_W / 2 + 14;
      const x1 = roadsV[bi + 1] - ROAD_W / 2 - 14;
      const y0 = roadsH[bj] + ROAD_W / 2 + 14;
      const y1 = roadsH[bj + 1] - ROAD_W / 2 - 14;
      if (bi === parkBlock.bx && bj === parkBlock.by) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // Split each block into 1-4 buildings with small gaps.
      const cols = rng() < 0.5 ? 2 : 1;
      const rows = rng() < 0.5 ? 2 : 1;
      const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() < 0.12) continue; // empty lot / parking
          const bx = x0 + c * cw + 8, by = y0 + r * ch + 8;
          const bw = cw - 16, bh = ch - 16;
          if (bw < 40 || bh < 40) continue;
          buildings.push({
            x: bx, y: by, w: bw, h: bh,
            color: buildingColor(),
            roof: rng() < 0.5 ? '#5a5148' : '#6e6258',
            h: U.randi(6, 26), // fake height for the shadow offset
            seed: rng(),
          });
        }
      }
    }
  }

  // Beach + sea along the east edge.
  const beach = { x: 2920, y: 0, w: 130, h: H };
  const water = { x: 3050, y: 0, w: 150, h: H };

  // Landmarks: named buildings the story and missions use.
  function landmarkAt(bx, by, name, tint) {
    // Find the building nearest a block corner and claim it.
    let best = null, bestD = 1e9;
    for (const b of buildings) {
      const d = U.dist2(b.x + b.w / 2, b.y + b.h / 2, bx, by);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) { best.name = name; best.color = tint; }
    return best;
  }
  const landmarks = {};
  landmarks.garage = landmarkAt(620, 620, "Nadia's Garage", '#c9748f');
  landmarks.hospital = landmarkAt(2220, 220, 'Solmar General', '#e8e8e8');
  landmarks.police = landmarkAt(1420, 220, 'Solmar PD', '#8498b8');
  landmarks.bank = landmarkAt(1820, 1020, 'Solmar Reserve', '#ddb26a');
  landmarks.motel = landmarkAt(2620, 1820, 'Palm Court Motel', '#e8b48a');
  landmarks.docks = landmarkAt(2620, 220, 'Solmar Docks', '#9fb0c8');
  landmarks.safehouse = landmarkAt(620, 1820, 'Safehouse', '#a8c8a0');
  landmarks.respray = landmarkAt(1020, 1820, 'Turbo Respray', '#d98aa5');
  // A parking garage for mission 4 (the package).
  landmarks.parking = landmarkAt(2220, 1420, 'Harbor Parking', '#6e6258');

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > W || y > H) return false;
    for (const rx of roadsV) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
    return false;
  }
  function isWater(x, y) {
    return x >= water.x && x <= water.x + water.w && y >= 0 && y <= H;
  }
  function isBeach(x, y) {
    return x >= beach.x && x < water.x && y >= 0 && y <= H;
  }
  function buildingAt(x, y) {
    for (const b of buildings) {
      if (U.pointInRect(x, y, b)) return b;
    }
    return null;
  }
  // Push a circle (player, car, ped) out of buildings and water. Returns true on hit.
  function resolveCircle(p, r) {
    let hit = false;
    for (const b of buildings) {
      if (U.circleRectResolve(p, r, b)) hit = true;
    }
    // Water blocks movement (except the beach edge).
    if (p.x + r > water.x) { p.x = water.x - r; hit = true; }
    if (p.x - r < 0) { p.x = r; hit = true; }
    if (p.y - r < 0) { p.y = r; hit = true; }
    if (p.y + r > H) { p.y = H - r; hit = true; }
    return hit;
  }
  function roadPoint() {
    if (U.chance(0.5)) {
      return { x: U.pick(roadsV) + U.rand(-28, 28), y: U.rand(120, H - 120), vertical: true };
    }
    return { x: U.rand(120, 2860), y: U.pick(roadsH) + U.rand(-28, 28), vertical: false };
  }
  function sidewalkPoint() {
    const p = roadPoint();
    const off = ROAD_W / 2 + U.rand(8, 26);
    if (p.vertical) return { x: p.x + (U.chance(0.5) ? off : -off), y: p.y };
    return { x: p.x, y: p.y + (U.chance(0.5) ? off : -off) };
  }
  function pointNear(x, y, rMin, rMax) {
    for (let i = 0; i < 40; i++) {
      const a = U.rand(0, U.TAU), d = U.rand(rMin, rMax);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (px < 80 || py < 80 || px > 2880 || py > H - 80) continue;
      if (isRoad(px, py) && !buildingAt(px, py)) return { x: px, y: py };
    }
    return roadPoint();
  }
  function buildingCenter(b) {
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  return {
    W, H, ROAD_W, roadsV, roadsH, buildings, parks, beach, water, landmarks,
    isRoad, isWater, isBeach, buildingAt, resolveCircle,
    roadPoint, sidewalkPoint, pointNear, buildingCenter,
  };
}
