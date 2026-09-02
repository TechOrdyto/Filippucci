#!/usr/bin/env node
/**
 * Genera il modello semantico (stanze + oggetti) dal DXF.
 *
 * STANZE: flood-fill SOLO sul layer "walls" (muri), bounding box rettangolare.
 *   - filtro anti-corridoio: riempimento della regione rispetto al box
 *   - l'hit-test sceglie la stanza PIÙ PICCOLA che contiene il punto
 *     (risolve le sovrapposizioni dei box di regioni a forma di L).
 *
 * OGGETTI: flood-fill su entrambi i layer, regioni piccole dentro le stanze.
 *
 * Output: app/interior-poc/data/floorplan-model.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = JSON.parse(
  readFileSync(resolve("app/interior-poc/data/floorplan-dxf.json"), "utf8")
);

const W = DATA.width;
const H = DATA.height;
const GW = 1184;
const GH = 1360;

function buildGrid(lines, weightFn) {
  const grid = Array.from({ length: GH }, () => new Uint8Array(GW));
  function drawLine(x1, y1, x2, y2, weight) {
    const gx1 = Math.round(x1), gy1 = Math.round(y1);
    const gx2 = Math.round(x2), gy2 = Math.round(y2);
    const steps = Math.max(Math.abs(gx2 - gx1), Math.abs(gy2 - gy1), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const gx = Math.round(gx1 + (gx2 - gx1) * t);
      const gy = Math.round(gy1 + (gy2 - gy1) * t);
      for (let wy = -weight; wy <= weight; wy++) {
        for (let wx = -weight; wx <= weight; wx++) {
          const yy = gy + wy, xx = gx + wx;
          if (yy >= 0 && yy < GH && xx >= 0 && xx < GW) grid[yy][xx] = 1;
        }
      }
    }
  }
  for (const l of lines) drawLine(l.start[0], l.start[1], l.end[0], l.end[1], weightFn(l));
  return grid;
}

function findRegions(grid, minArea) {
  const visited = Array.from({ length: GH }, () => new Uint8Array(GW));
  const q = [];
  for (let x = 0; x < GW; x++) {
    if (grid[0][x] === 0 && !visited[0][x]) { visited[0][x] = 1; q.push([0, x]); }
    if (grid[GH - 1][x] === 0 && !visited[GH - 1][x]) { visited[GH - 1][x] = 1; q.push([GH - 1, x]); }
  }
  for (let y = 0; y < GH; y++) {
    if (grid[y][0] === 0 && !visited[y][0]) { visited[y][0] = 1; q.push([y, 0]); }
    if (grid[y][GW - 1] === 0 && !visited[y][GW - 1]) { visited[y][GW - 1] = 1; q.push([y, GW - 1]); }
  }
  while (q.length) {
    const [y, x] = q.pop();
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ny = y + dy, nx = x + dx;
      if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] === 0 && !visited[ny][nx]) {
        visited[ny][nx] = 1;
        q.push([ny, nx]);
      }
    }
  }
  const regions = [];
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (grid[y][x] === 0 && !visited[y][x]) {
        const region = [];
        const qq = [[y, x]];
        visited[y][x] = 1;
        while (qq.length) {
          const [cy, cx] = qq.pop();
          region.push([cx, cy]);
          for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const ny = cy + dy, nx = cx + dx;
            if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] === 0 && !visited[ny][nx]) {
              visited[ny][nx] = 1;
              qq.push([ny, nx]);
            }
          }
        }
        if (region.length > minArea) regions.push(region);
      }
    }
  }
  return regions;
}

function boxOf(region) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of region) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  return {
    x: minX, y: minY, w, h,
    area: region.length,
    boxArea: w * h,
    fill: region.length / (w * h),
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
  };
}

// ===== STANZE: solo walls =====
const wallGrid = buildGrid(DATA.lines, (l) => (l.layer === "walls" ? 3 : 0));
const wallRegions = findRegions(wallGrid, 200);

// Filtro stanze: area > 15k e riempimento > 50% (scarta corridoi/vani)
const roomBoxes = wallRegions
  .map(boxOf)
  .filter((b) => b.area > 15000 && b.fill > 0.50)
  .sort((a, b) => a.area - b.area); // crescente: le più piccole prima

console.log(`Stanze rilevate: ${roomBoxes.length}`);
for (const b of roomBoxes) {
  console.log(`  box=${Math.round(b.x)},${Math.round(b.y)}-${Math.round(b.x + b.w)},${Math.round(b.y + b.h)} area=${Math.round(b.area / 1000)}k fill=${Math.round(b.fill * 100)}%`);
}

// ===== OGGETTI: entrambi i layer =====
const fullGrid = buildGrid(DATA.lines, (l) => (l.layer === "walls" ? 3 : 1));
const objRegions = findRegions(fullGrid, 150);
const objBoxes = objRegions
  .map(boxOf)
  .filter((b) => b.area >= 300 && b.area <= 20000);

function pointInBox(px, py, b) {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

const objects = objBoxes.map((b, i) => {
  // Assegna alla stanza più piccola che lo contiene
  let room = roomBoxes.find((r) => pointInBox(b.cx, b.cy, r));
  if (!room) {
    // fallback: stanza più vicina
    room = roomBoxes.reduce((best, r) => {
      const d = Math.hypot(b.cx - r.cx, b.cy - r.cy);
      return best === null || d < best.d ? { r, d } : best;
    }, null)?.r ?? null;
  }
  return {
    id: `obj-${i + 1}`,
    name: `Elemento ${i + 1}`,
    type: "furniture",
    roomId: room ? `room-${roomBoxes.indexOf(room) + 1}` : null,
    geometry: {
      type: "rectangle",
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      width: Math.round(b.w * 10) / 10,
      height: Math.round(b.h * 10) / 10,
    },
    actions: [],
  };
});

console.log(`Oggetti rilevati: ${objects.length}`);

// ===== Modello =====
const rooms = roomBoxes.map((b, i) => ({
  id: `room-${i + 1}`,
  name: `Stanza ${i + 1}`,
  type: "room",
  geometry: {
    type: "polygon",
    points: [
      [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10],
      [Math.round((b.x + b.w) * 10) / 10, Math.round(b.y * 10) / 10],
      [Math.round((b.x + b.w) * 10) / 10, Math.round((b.y + b.h) * 10) / 10],
      [Math.round(b.x * 10) / 10, Math.round((b.y + b.h) * 10) / 10],
    ],
  },
  objectIds: objects.filter((o) => o.roomId === `room-${i + 1}`).map((o) => o.id),
}));

const model = {
  id: "piano-rialzato",
  name: "Piano Rialzato",
  width: Math.round(W * 10) / 10,
  height: Math.round(H * 10) / 10,
  source: "cad",
  rooms,
  objects,
};

writeFileSync(
  resolve("app/interior-poc/data/floorplan-model.json"),
  JSON.stringify(model, null, 2)
);

console.log(`✅ Modello: ${rooms.length} stanze, ${objects.length} oggetti`);
