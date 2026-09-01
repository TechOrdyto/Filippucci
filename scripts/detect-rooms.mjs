#!/usr/bin/env node
/**
 * Ricostruisce le stanze dalla piantina DXF usando flood-fill.
 *
 * 1. Rasterizza le linee PDF_STROKES (muri) su una griglia
 * 2. Trova le regioni chiuse (stanze) con flood-fill
 * 3. Ogni regione = bounding box di una stanza
 *
 * Output: app/interior-poc/data/floorplan-rooms-auto.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const DATA = JSON.parse(
  readFileSync(resolve("app/interior-poc/data/floorplan-dxf.json"), "utf8")
);

const W = DATA.width;
const H = DATA.height;
// Griglia a piena risoluzione per chiudere meglio i muri
const GW = 1184;
const GH = 1360;
const SX = GW / W;
const SY = GH / H;

// 1. Rasterizza i muri (walls) e i contorni (details)
const grid = Array.from({ length: GH }, () => new Uint8Array(GW));

function drawLine(x1, y1, x2, y2, weight) {
  const gx1 = Math.round(x1 * SX);
  const gy1 = Math.round(y1 * SY);
  const gx2 = Math.round(x2 * SX);
  const gy2 = Math.round(y2 * SY);
  const dx = Math.abs(gx2 - gx1);
  const dy = Math.abs(gy2 - gy1);
  const steps = Math.max(dx, dy, 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const gx = Math.round(gx1 + (gx2 - gx1) * t);
    const gy = Math.round(gy1 + (gy2 - gy1) * t);
    for (let wy = -weight; wy <= weight; wy++) {
      for (let wx = -weight; wx <= weight; wx++) {
        const yy = gy + wy;
        const xx = gx + wx;
        if (yy >= 0 && yy < GH && xx >= 0 && xx < GW) {
          grid[yy][xx] = 1;
        }
      }
    }
  }
}

for (const l of DATA.lines) {
  const weight = l.layer === "walls" ? 3 : 1;
  drawLine(l.start[0], l.start[1], l.end[0], l.end[1], weight);
}

// 2. Flood-fill per trovare le regioni chiuse
// Marca i pixel di bordo (esterno) come visitati
const visited = Array.from({ length: GH }, () => new Uint8Array(GW));
const queue = [];

// Bordi
for (let x = 0; x < GW; x++) {
  if (grid[0][x] === 0 && !visited[0][x]) { visited[0][x] = 1; queue.push([0, x]); }
  if (grid[GH - 1][x] === 0 && !visited[GH - 1][x]) { visited[GH - 1][x] = 1; queue.push([GH - 1, x]); }
}
for (let y = 0; y < GH; y++) {
  if (grid[y][0] === 0 && !visited[y][0]) { visited[y][0] = 1; queue.push([y, 0]); }
  if (grid[y][GW - 1] === 0 && !visited[y][GW - 1]) { visited[y][GW - 1] = 1; queue.push([y, GW - 1]); }
}

// Flood-fill esterno
while (queue.length) {
  const [y, x] = queue.pop();
  for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const ny = y + dy, nx = x + dx;
    if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] === 0 && !visited[ny][nx]) {
      visited[ny][nx] = 1;
      queue.push([ny, nx]);
    }
  }
}

// 3. Trova le regioni interne (non visitate, non muro)
const regions = [];
for (let y = 0; y < GH; y++) {
  for (let x = 0; x < GW; x++) {
    if (grid[y][x] === 0 && !visited[y][x]) {
      // Nuova regione: flood-fill
      const region = [];
      const q = [[y, x]];
      visited[y][x] = 1;
      while (q.length) {
        const [cy, cx] = q.pop();
        region.push([cx, cy]);
        for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const ny = cy + dy, nx = cx + dx;
          if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] === 0 && !visited[ny][nx]) {
            visited[ny][nx] = 1;
            q.push([ny, nx]);
          }
        }
      }
      if (region.length > 800) { // min area per filtrare rumore/fori piccoli
        regions.push(region);
      }
    }
  }
}

// 4. Converti in bounding box (coordinate piano)
const rooms = regions.map((region, i) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of region) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return {
    id: `room-auto-${i + 1}`,
    name: `Stanza ${i + 1}`,
    bounds: {
      x: Math.round((minX / SX) * 10) / 10,
      y: Math.round((minY / SY) * 10) / 10,
      width: Math.round(((maxX - minX + 1) / SX) * 10) / 10,
      height: Math.round(((maxY - minY + 1) / SY) * 10) / 10,
    },
    area: Math.round((region.length / (SX * SY)) * 10) / 10,
  };
}).sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

console.log(`Regioni trovate: ${rooms.length}`);
for (const r of rooms) {
  console.log(`  ${r.name}: x=${r.bounds.x} y=${r.bounds.y} w=${r.bounds.width} h=${r.bounds.height} area=${r.area}`);
}

const output = { width: W, height: H, rooms };
mkdirSync(dirname(resolve("app/interior-poc/data/floorplan-rooms-auto.json")), { recursive: true });
writeFileSync(resolve("app/interior-poc/data/floorplan-rooms-auto.json"), JSON.stringify(output, null, 2));
console.log("✅ Scritto floorplan-rooms-auto.json");