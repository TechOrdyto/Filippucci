#!/usr/bin/env node
/**
 * Prepara una copia demo del DXF Casa Enri senza modificare il sorgente.
 *
 * Il file ricevuto non contiene ancora una separazione semantica completa:
 * alcuni layer sono già utili (Linee-04 = muri, PROSP = aperture/porte),
 * mentre gli arredi sono linee CAD distribuite su più layer. Questo script:
 *
 * 1. crea un DXF candidato per la demo;
 * 2. assegna i muri affidabili a FP_WALLS e le porte riconoscibili a FP_DOORS;
 * 3. conserva i layer originali e tutto ciò che non può essere classificato
 *    senza interpretazioni rischiose;
 * 4. esporta la geometria normalizzata usata dall'app;
 * 5. genera ancore rettangolari generiche per gli arredi e poligoni candidati
 *    per le stanze, così la demo resta cliccabile senza chiedere al geometra
 *    di ridisegnare ogni mobile.
 *
 * Il risultato è un candidato demo, non sostituisce lo standard definitivo
 * per i nuovi file CAD: le assunzioni vengono registrate nel manifest JSON.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

const INPUT_PATH = resolve(
  process.argv[2] ?? "document/dxf/Casa-Enri-lavoro-geometri.dxf"
);
const OUTPUT_DXF_PATH = resolve(
  process.argv[3] ?? "document/dxf/Casa-Enri-demo-filippucci.dxf"
);
const OUTPUT_DATA_PATH = resolve(
  process.argv[4] ?? "app/interior-poc/data/floorplan-dxf-casa-enri.json"
);
const OUTPUT_MODEL_PATH = resolve(
  process.argv[5] ?? "app/interior-poc/data/floorplan-model-casa-enri.json"
);
const OUTPUT_MANIFEST_PATH = resolve(
  process.argv[6] ?? "document/dxf/Casa-Enri-demo-manifest.json"
);

const REQUIRED_LAYERS = [
  ["FP_WALLS", 7],
  ["FP_DOORS", 1],
  ["FP_WINDOWS", 4],
  ["FP_ROOMS", 3],
  ["FP_OBJECTS", 2],
  ["FP_NOTES", 8],
];

const WALL_SOURCE_LAYERS = new Set(["Linee-04", "FP_WALLS"]);
const DETAIL_SOURCE_LAYERS = new Set([
  "Linee-04",
  "PROSP",
  "prosp1",
  "Linee-02",
  "Linee-01",
  "linee_01",
  "linee_bianche",
  "linee-bianche",
  "ARREDO",
  "04 ARREDI",
  "prospMURI",
  "Linee-03",
  "FP_WALLS",
  "FP_DOORS",
  "FP_WINDOWS",
  "FP_ROOMS",
  "FP_OBJECTS",
]);
const OBJECT_SOURCE_LAYERS = new Set([
  "Linee-02",
  "Linee-01",
  "linee_01",
  "ARREDO",
  "04 ARREDI",
  "FP_OBJECTS",
]);

const GEOMETRIC_TYPES = new Set(["LINE", "ARC", "CIRCLE", "LWPOLYLINE"]);
const EPSILON = 1e-6;

// Calibrazione semantica della demo Casa Enri.
//
// Il DXF originale non contiene un layer stanze affidabile: le aperture e i
// corridoi fanno sì che un flood-fill possa attraversare più ambienti. Per la
// demo manteniamo quindi la sorgente CAD intatta e definiamo qui le sole aree
// cliccabili, seguendo i bordi interni dei muri. Le coordinate sono già nel
// sistema normalizzato usato dall'app (cm, origine in alto a sinistra).
//
// Se in futuro il file avrà un layer FP_ROOMS, questa calibrazione potrà essere
// sostituita dai poligoni letti dal DXF senza toccare il renderer.
const CASA_ENRI_CALIBRATION = {
  width: 1563,
  height: 1361.6,
  rooms: [
    {
      id: "room-1",
      name: "Ambiente 1",
      points: [[398, 96], [585, 96], [585, 325], [398, 325]],
    },
    {
      id: "room-2",
      name: "Ambiente 2",
      points: [[828, 96], [989, 96], [989, 225], [1018, 225], [1018, 319], [828, 319]],
    },
    {
      id: "room-3",
      name: "Ambiente 3",
      points: [[1032, 102], [1307, 102], [1307, 365], [1032, 365]],
    },
    {
      id: "room-4",
      name: "Ambiente 4",
      points: [[1318, 100], [1473, 100], [1473, 365], [1318, 365]],
    },
    {
      id: "room-5",
      name: "Ambiente 5",
      points: [[40, 370], [420, 370], [420, 657], [40, 657]],
    },
    {
      id: "room-6",
      name: "Ambiente 6",
      points: [[40, 800], [420, 800], [420, 1205], [40, 1205]],
    },
    {
      id: "room-7",
      name: "Ambiente 7",
      points: [[590, 366], [958, 366], [958, 778], [590, 778]],
    },
    {
      id: "room-8",
      name: "Ambiente 8",
      points: [[590, 915], [978, 915], [978, 1208], [590, 1208]],
    },
    {
      id: "room-9",
      name: "Ambiente 9",
      points: [[1110, 496], [1471, 496], [1471, 770], [1110, 770]],
    },
  ],
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return distance(point, start);
  let t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return distance(point, [start[0] + t * dx, start[1] + t * dy]);
}

function pairValue(entity, code, occurrence = 0) {
  let seen = 0;
  for (const pair of entity.pairs) {
    if (pair.code !== code) continue;
    if (seen === occurrence) return pair.value;
    seen += 1;
  }
  return undefined;
}

function pairNumbers(entity, code) {
  return entity.pairs
    .filter((pair) => pair.code === code)
    .map((pair) => number(pair.value, NaN))
    .filter(Number.isFinite);
}

function parseDxf(text) {
  const rawLines = text.split(/\r?\n/);
  const pairs = [];
  for (let index = 0; index + 1 < rawLines.length; index += 2) {
    pairs.push({
      code: rawLines[index].trim(),
      value: rawLines[index + 1].trim(),
      codeLine: index,
      valueLine: index + 1,
    });
  }

  const entities = [];
  let section = "";
  let pendingSection = false;
  let current = null;
  let entitiesEndSecLine = null;

  for (const pair of pairs) {
    if (pair.code === "0") {
      if (current && section === "ENTITIES") entities.push(current);
      current = null;

      if (pair.value === "SECTION") {
        pendingSection = true;
      } else if (pair.value === "ENDSEC") {
        if (section === "ENTITIES") entitiesEndSecLine = pair.codeLine;
        section = "";
      } else if (section === "ENTITIES") {
        current = { type: pair.value, pairs: [], startLine: pair.codeLine };
      }
      continue;
    }

    if (pendingSection && pair.code === "2") {
      section = pair.value;
      pendingSection = false;
      continue;
    }

    if (current && section === "ENTITIES") {
      current.pairs.push(pair);
    }
  }

  if (current && section === "ENTITIES") entities.push(current);
  return { rawLines, pairs, entities, entitiesEndSecLine };
}

function entityLayer(entity) {
  return pairValue(entity, "8") ?? "0";
}

function entitySegments(entity) {
  if (entity.type === "LINE") {
    const start = [number(pairValue(entity, "10")), number(pairValue(entity, "20"))];
    const end = [number(pairValue(entity, "11")), number(pairValue(entity, "21"))];
    return distance(start, end) > EPSILON ? [[start, end]] : [];
  }

  if (entity.type === "ARC" || entity.type === "CIRCLE") {
    const center = [number(pairValue(entity, "10")), number(pairValue(entity, "20"))];
    const radius = number(pairValue(entity, "40"));
    if (radius <= EPSILON) return [];
    const rawStart = entity.type === "ARC" ? number(pairValue(entity, "50")) : 0;
    const rawEnd = entity.type === "ARC" ? number(pairValue(entity, "51")) : 360;
    const span = entity.type === "CIRCLE"
      ? 360
      : ((rawEnd - rawStart) % 360 + 360) % 360 || 360;
    const steps = Math.max(4, Math.ceil(span / 12));
    const points = [];
    for (let index = 0; index <= steps; index += 1) {
      const angle = (rawStart + (span * index) / steps) * Math.PI / 180;
      points.push([
        center[0] + Math.cos(angle) * radius,
        center[1] + Math.sin(angle) * radius,
      ]);
    }
    return points.slice(1).map((point, index) => [points[index], point]);
  }

  if (entity.type === "LWPOLYLINE") {
    const xs = pairNumbers(entity, "10");
    const ys = pairNumbers(entity, "20");
    const points = xs.map((x, index) => [x, ys[index] ?? 0]);
    if (points.length < 2) return [];
    const segments = points.slice(1).map((point, index) => [points[index], point]);
    const closed = (number(pairValue(entity, "70")) & 1) === 1;
    if (closed && distance(points[points.length - 1], points[0]) > EPSILON) {
      segments.push([points[points.length - 1], points[0]]);
    }
    return segments;
  }

  return [];
}

function entityEndpoints(entity) {
  const segments = entitySegments(entity);
  if (segments.length === 0) return [];
  return [segments[0][0], segments[segments.length - 1][1]];
}

function arcInfo(entity) {
  const center = [number(pairValue(entity, "10")), number(pairValue(entity, "20"))];
  const radius = number(pairValue(entity, "40"));
  const start = number(pairValue(entity, "50"));
  const end = number(pairValue(entity, "51"));
  const endpoint = (angle) => [
    center[0] + Math.cos(angle * Math.PI / 180) * radius,
    center[1] + Math.sin(angle * Math.PI / 180) * radius,
  ];
  return { entity, center, radius, startPoint: endpoint(start), endPoint: endpoint(end) };
}

function isDoorRelatedLine(entity, doors) {
  if (entity.type !== "LINE") return false;
  const endpoints = entityEndpoints(entity);
  if (endpoints.length !== 2) return false;
  return doors.some((door) => endpoints.some((point) =>
    distance(point, door.center) <= 10 ||
    distance(point, door.startPoint) <= 10 ||
    distance(point, door.endPoint) <= 10
  ));
}

function effectiveLayer(entity, doorArcs) {
  const sourceLayer = entityLayer(entity);
  if (sourceLayer === "Linee-04" && entity.type !== "DIMENSION") return "FP_WALLS";
  if (
    sourceLayer === "PROSP" &&
    (entity.type === "ARC" || isDoorRelatedLine(entity, doorArcs))
  ) {
    return "FP_DOORS";
  }
  return sourceLayer;
}

function selectedForPlan(entity, targetLayer) {
  return (
    DETAIL_SOURCE_LAYERS.has(entityLayer(entity)) ||
    ["FP_WALLS", "FP_DOORS", "FP_WINDOWS", "FP_ROOMS", "FP_OBJECTS"].includes(targetLayer)
  );
}

function findLayerTableEnd(rawLines) {
  let section = "";
  let pendingSection = false;
  let table = "";
  let pendingTable = false;
  for (let index = 0; index + 1 < rawLines.length; index += 2) {
    const code = rawLines[index].trim();
    const value = rawLines[index + 1].trim();
    if (code === "0" && value === "SECTION") {
      pendingSection = true;
      continue;
    }
    if (pendingSection && code === "2") {
      section = value;
      pendingSection = false;
      continue;
    }
    if (code === "0" && value === "TABLE") {
      pendingTable = true;
      continue;
    }
    if (pendingTable && code === "2") {
      table = value;
      pendingTable = false;
      continue;
    }
    if (code === "0" && value === "ENDTAB") {
      if (section === "TABLES" && table === "LAYER") return index;
      table = "";
    }
    if (code === "0" && value === "ENDSEC") section = "";
  }
  return null;
}

function existingLayerNames(rawLines) {
  const names = new Set();
  let section = "";
  let pendingSection = false;
  let table = "";
  let pendingTable = false;
  let inLayerRecord = false;
  for (let index = 0; index + 1 < rawLines.length; index += 2) {
    const code = rawLines[index].trim();
    const value = rawLines[index + 1].trim();
    if (code === "0" && value === "SECTION") {
      pendingSection = true;
      continue;
    }
    if (pendingSection && code === "2") {
      section = value;
      pendingSection = false;
      continue;
    }
    if (code === "0" && value === "TABLE") {
      pendingTable = true;
      continue;
    }
    if (pendingTable && code === "2") {
      table = value;
      pendingTable = false;
      continue;
    }
    if (section === "TABLES" && table === "LAYER" && code === "0" && value === "LAYER") {
      inLayerRecord = true;
      continue;
    }
    if (inLayerRecord && code === "2") {
      names.add(value);
      inLayerRecord = false;
    }
    if (code === "0" && value === "ENDTAB") {
      table = "";
      inLayerRecord = false;
    }
    if (code === "0" && value === "ENDSEC") section = "";
  }
  return names;
}

function ensureLayers(rawLines) {
  const names = existingLayerNames(rawLines);
  const missing = REQUIRED_LAYERS.filter(([name]) => !names.has(name));
  if (missing.length === 0) return rawLines;
  const tableEnd = findLayerTableEnd(rawLines);
  if (tableEnd === null) {
    throw new Error("Impossibile trovare la tabella layer nel DXF");
  }
  const records = [];
  for (const [name, color] of missing) {
    records.push(
      "  0", "LAYER",
      "  2", name,
      " 70", "     0",
      " 62", String(color).padStart(6, " "),
      "  6", "Continuous",
    );
  }
  return [...rawLines.slice(0, tableEnd), ...records, ...rawLines.slice(tableEnd)];
}

function wallSegments(entities, doorArcs) {
  const segments = [];
  for (const entity of entities) {
    const target = effectiveLayer(entity, doorArcs);
    if (target !== "FP_WALLS") continue;
    for (const segment of entitySegments(entity)) segments.push(segment);
  }
  return segments;
}

function allPlanSegments(entities, doorArcs) {
  const segments = [];
  for (const entity of entities) {
    const target = effectiveLayer(entity, doorArcs);
    if (!selectedForPlan(entity, target)) continue;
    for (const segment of entitySegments(entity)) {
      segments.push({ segment, sourceLayer: entityLayer(entity), targetLayer: target });
    }
  }
  return segments;
}

function normalizePoint(point, bounds) {
  // DXF usa Y verso l'alto, SVG usa Y verso il basso: ribaltiamo solo la
  // rappresentazione, non il file originale né le coordinate CAD esportate.
  return [round(point[0] - bounds.minX), round(bounds.maxY - point[1])];
}

function normalizedSegment(segment, bounds) {
  return [normalizePoint(segment[0], bounds), normalizePoint(segment[1], bounds)];
}

function boundsOfSegments(entries) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entry of entries) {
    const segment = Array.isArray(entry) ? entry : entry.segment;
    for (const point of segment) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  if (!Number.isFinite(minX)) throw new Error("Nessuna geometria utile trovata nel DXF");
  return { minX, minY, maxX, maxY };
}

function transformedBounds(bounds) {
  return {
    minX: 0,
    minY: 0,
    maxX: round(bounds.maxX - bounds.minX),
    maxY: round(bounds.maxY - bounds.minY),
  };
}

function bboxOfSegments(segments) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [start, end] of segments) {
    for (const point of [start, end]) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxOfPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function rectanglePoints(box) {
  return [
    [box.x, box.y],
    [round(box.x + box.width), box.y],
    [round(box.x + box.width), round(box.y + box.height)],
    [box.x, round(box.y + box.height)],
  ];
}

function roomPoints(room) {
  return room.points ?? rectanglePoints(room);
}

function pointInPolygon(point, points) {
  const [px, py] = point;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [xi, yi] = points[index];
    const [xj, yj] = points[previous];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function calibratedRoomBoxes(dimensions) {
  const matchesCasaEnri =
    Math.abs(dimensions.maxX - CASA_ENRI_CALIBRATION.width) < 1 &&
    Math.abs(dimensions.maxY - CASA_ENRI_CALIBRATION.height) < 1;
  if (!matchesCasaEnri) return null;

  return CASA_ENRI_CALIBRATION.rooms.map((room) => {
    const bounds = bboxOfPoints(room.points);
    return {
      ...room,
      x: bounds.minX,
      y: bounds.minY,
      width: round(bounds.maxX - bounds.minX),
      height: round(bounds.maxY - bounds.minY),
      center: [
        round(bounds.minX + (bounds.maxX - bounds.minX) / 2),
        round(bounds.minY + (bounds.maxY - bounds.minY) / 2),
      ],
    };
  });
}

function createGrid(width, height) {
  return Array.from({ length: height }, () => new Uint8Array(width));
}

function drawGridSegment(grid, segment, origin, cellSize, weight = 1) {
  const [[x1, y1], [x2, y2]] = segment;
  const gx1 = Math.round((x1 - origin.minX) / cellSize);
  const gy1 = Math.round((origin.maxY - y1) / cellSize);
  const gx2 = Math.round((x2 - origin.minX) / cellSize);
  const gy2 = Math.round((origin.maxY - y2) / cellSize);
  const steps = Math.max(Math.abs(gx2 - gx1), Math.abs(gy2 - gy1), 1);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const gx = Math.round(gx1 + (gx2 - gx1) * t);
    const gy = Math.round(gy1 + (gy2 - gy1) * t);
    for (let dy = -weight; dy <= weight; dy += 1) {
      for (let dx = -weight; dx <= weight; dx += 1) {
        const yy = gy + dy;
        const xx = gx + dx;
        if (yy >= 0 && yy < grid.length && xx >= 0 && xx < grid[0].length) grid[yy][xx] = 1;
      }
    }
  }
}

function addDoorClosures(grid, doorArcs, walls, origin, cellSize) {
  for (const door of doorArcs) {
    const nearestWall = walls
      .map((segment) => ({ segment, distance: pointToSegmentDistance(door.center, segment[0], segment[1]) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearestWall || nearestWall.distance > 18) continue;
    const [[wx1, wy1], [wx2, wy2]] = nearestWall.segment;
    const wallIsHorizontal = Math.abs(wx2 - wx1) >= Math.abs(wy2 - wy1);
    const candidates = [door.startPoint, door.endPoint];
    const closingPoint = candidates
      .filter((point) => wallIsHorizontal ? Math.abs(point[1] - door.center[1]) < 14 : Math.abs(point[0] - door.center[0]) < 14)
      .sort((a, b) => distance(b, door.center) - distance(a, door.center))[0];
    if (closingPoint) {
      drawGridSegment(grid, [door.center, closingPoint], origin, cellSize, 1);
    }
  }
}

function floodRegions(grid, minArea) {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array.from({ length: height }, () => new Uint8Array(width));
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const visit = (startY, startX) => {
    const queue = [[startY, startX]];
    const region = [];
    visited[startY][startX] = 1;
    while (queue.length > 0) {
      const [y, x] = queue.pop();
      region.push([x, y]);
      for (const [dy, dx] of directions) {
        const nextY = y + dy;
        const nextX = x + dx;
        if (
          nextY >= 0 && nextY < height &&
          nextX >= 0 && nextX < width &&
          grid[nextY][nextX] === 0 &&
          !visited[nextY][nextX]
        ) {
          visited[nextY][nextX] = 1;
          queue.push([nextY, nextX]);
        }
      }
    }
    return region;
  };

  // Elimina la regione esterna partendo dai bordi.
  const outside = [];
  for (let x = 0; x < width; x += 1) outside.push([0, x], [height - 1, x]);
  for (let y = 0; y < height; y += 1) outside.push([y, 0], [y, width - 1]);
  for (const [y, x] of outside) {
    if (grid[y][x] === 0 && !visited[y][x]) visit(y, x);
  }

  const regions = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y][x] !== 0 || visited[y][x]) continue;
      const region = visit(y, x);
      if (region.length >= minArea) regions.push(region);
    }
  }
  return regions;
}

function regionBox(region, origin, cellSize) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of region) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const box = {
    x: minX * cellSize,
    y: minY * cellSize,
    width: (maxX - minX + 1) * cellSize,
    height: (maxY - minY + 1) * cellSize,
    area: region.length * cellSize * cellSize,
  };
  return {
    ...box,
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
    center: [round(box.x + box.width / 2), round(box.y + box.height / 2)],
  };
}

function containsBox(outer, inner, margin = 0) {
  return (
    inner.x >= outer.x - margin &&
    inner.y >= outer.y - margin &&
    inner.x + inner.width <= outer.x + outer.width + margin &&
    inner.y + inner.height <= outer.y + outer.height + margin
  );
}

function detectRooms(walls, doorArcs, bounds) {
  const cellSize = 4;
  const width = Math.ceil((bounds.maxX - bounds.minX) / cellSize) + 3;
  const height = Math.ceil((bounds.maxY - bounds.minY) / cellSize) + 3;
  const grid = createGrid(width, height);
  for (const wall of walls) drawGridSegment(grid, wall, bounds, cellSize, 1);
  addDoorClosures(grid, doorArcs, walls, bounds, cellSize);

  const candidates = floodRegions(grid, 500)
    .map((region) => regionBox(region, bounds, cellSize))
    .filter((box) => box.width >= 100 && box.height >= 100 && box.width <= 900 && box.height <= 900)
    .sort((a, b) => b.area - a.area);

  // Le aperture possono lasciare una stessa stanza in più regioni o creare
  // box annidati. Manteniamo i candidati più informativi senza inventare
  // poligoni complessi: per la demo il rettangolo è solo un hit-area/UI.
  const rooms = [];
  for (const candidate of candidates) {
    const duplicate = rooms.some((room) => {
      const overlapX = Math.max(0, Math.min(room.x + room.width, candidate.x + candidate.width) - Math.max(room.x, candidate.x));
      const overlapY = Math.max(0, Math.min(room.y + room.height, candidate.y + candidate.height) - Math.max(room.y, candidate.y));
      const overlap = overlapX * overlapY;
      return containsBox(room, candidate, 35) || overlap > Math.min(room.width * room.height, candidate.width * candidate.height) * 0.72;
    });
    if (!duplicate) rooms.push(candidate);
  }

  return rooms
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 12);
}

function segmentBounds(segment) {
  const [[x1, y1], [x2, y2]] = segment;
  return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
}

function boundsGap(a, b) {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (value) => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };
  return { find, union };
}

function detectObjects(entities, doorArcs, bounds, rooms) {
  const objectSegments = [];
  for (const entity of entities) {
    const source = entityLayer(entity);
    if (!OBJECT_SOURCE_LAYERS.has(source) || !GEOMETRIC_TYPES.has(entity.type)) continue;
    for (const segment of entitySegments(entity)) objectSegments.push(segment);
  }
  if (objectSegments.length === 0) return [];

  const segmentBoxes = objectSegments.map(segmentBounds);
  const unionFind = createUnionFind(objectSegments.length);
  const clusterGap = 24;
  for (let left = 0; left < objectSegments.length; left += 1) {
    for (let right = left + 1; right < objectSegments.length; right += 1) {
      if (boundsGap(segmentBoxes[left], segmentBoxes[right]) <= clusterGap) unionFind.union(left, right);
    }
  }

  const groups = new Map();
  for (let index = 0; index < objectSegments.length; index += 1) {
    const root = unionFind.find(index);
    const group = groups.get(root) ?? [];
    group.push(objectSegments[index]);
    groups.set(root, group);
  }

  const rawObjects = [...groups.values()]
    .map((segments) => {
      const box = bboxOfSegments(segments);
      return {
        segments,
        x: box.minX,
        y: box.minY,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
        center: [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2],
      };
    })
    .filter((object) => {
      const area = object.width * object.height;
      const smallestSide = Math.min(object.width, object.height);
      const largestSide = Math.max(object.width, object.height);
      return (
        object.segments.length >= 2 &&
        area >= 150 &&
        area <= 220000 &&
        smallestSide >= 8 &&
        !(largestSide > 650 && smallestSide < 18)
      );
    });

  const pointInRoom = (point, room) => pointInPolygon(point, roomPoints(room));
  const roomForObject = (center) => {
    const containing = rooms.filter((room) => pointInRoom(center, room));
    if (containing.length > 0) return containing.sort((a, b) => a.width * a.height - b.width * b.height)[0];
    return rooms
      .map((room) => ({ room, distance: distance(center, room.center) }))
      .sort((a, b) => a.distance - b.distance)[0]?.room ?? null;
  };

  return rawObjects
    .map((object, index) => {
      const objectBox = {
        x: round(object.x - bounds.minX - 5),
        y: round(bounds.maxY - object.y - object.height - 5),
        width: round(object.width + 10),
        height: round(object.height + 10),
      };
      const center = [objectBox.x + objectBox.width / 2, objectBox.y + objectBox.height / 2];
      const room = roomForObject(center);
      return {
        id: `obj-${index + 1}`,
        name: `Elemento ${index + 1}`,
        type: "furniture-anchor",
        roomId: room?.id ?? null,
        geometry: { type: "rectangle", ...objectBox },
        actions: [],
        source: "auto-anchor",
      };
    })
    .sort((a, b) => a.geometry.y - b.geometry.y || a.geometry.x - b.geometry.x)
    .map((object, index) => ({ ...object, id: `obj-${index + 1}` }));
}

function nearestWallForDoor(door, walls) {
  return walls
    .map((segment) => ({ segment, distance: pointToSegmentDistance(door.center, segment[0], segment[1]) }))
    .sort((a, b) => a.distance - b.distance)[0]?.segment ?? null;
}

function doorWall(door, walls, bounds) {
  const wall = nearestWallForDoor(door, walls);
  if (!wall) return "north";
  const [[x1, y1], [x2, y2]] = wall;
  const center = normalizePoint(door.center, bounds);
  const midpoint = normalizePoint([(x1 + x2) / 2, (y1 + y2) / 2], bounds);
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) return center[1] > midpoint[1] ? "north" : "south";
  return center[0] > midpoint[0] ? "west" : "east";
}

function makeRooms(roomBoxes, objects, width, height) {
  const rooms = roomBoxes.map((box, index) => ({
    id: box.id ?? `room-${index + 1}`,
    name: box.name ?? `Ambiente ${index + 1}`,
    type: "room",
    geometry: {
      type: "polygon",
      points: roomPoints(box),
    },
    objectIds: [],
  }));
  for (const object of objects) {
    const room = rooms.find((candidate) => candidate.id === object.roomId);
    if (room) room.objectIds.push(object.id);
  }
  return {
    id: "piano-rialzato-casa-enri",
    name: "Casa Enri · Demo Filippucci",
    width,
    height,
    source: "cad",
    rooms,
    objects,
  };
}

function appendLwPolyline(lines, layer, points) {
  const record = [
    "  0", "LWPOLYLINE",
    "  8", layer,
    " 90", String(points.length),
    " 70", "1",
  ];
  for (const [x, y] of points) record.push(" 10", String(round(x, 3)), " 20", String(round(y, 3)));
  lines.push(...record);
}

function inversePoint(point, bounds) {
  return [bounds.minX + point[0], bounds.maxY - point[1]];
}

function appendDemoGeometry(rawLines, entitiesEndSecLine, rooms, objects, bounds) {
  if (entitiesEndSecLine === null) throw new Error("Sezione ENTITIES non trovata");
  const generated = [];
  for (const room of rooms) {
    const points = room.geometry.points.map((point) => inversePoint(point, bounds));
    appendLwPolyline(generated, "FP_ROOMS", points);
  }
  for (const object of objects) {
    const g = object.geometry;
    const points = [
      inversePoint([g.x, g.y], bounds),
      inversePoint([g.x + g.width, g.y], bounds),
      inversePoint([g.x + g.width, g.y + g.height], bounds),
      inversePoint([g.x, g.y + g.height], bounds),
    ];
    appendLwPolyline(generated, "FP_OBJECTS", points);
  }
  return [...rawLines.slice(0, entitiesEndSecLine), ...generated, ...rawLines.slice(entitiesEndSecLine)];
}

function main() {
  const sourceText = readFileSync(INPUT_PATH, "utf8");
  const parsed = parseDxf(sourceText);
  const doorArcs = parsed.entities
    .filter((entity) => entityLayer(entity) === "PROSP" && entity.type === "ARC")
    .map(arcInfo);
  const walls = wallSegments(parsed.entities, doorArcs);
  const planEntries = allPlanSegments(parsed.entities, doorArcs);
  const rawBounds = boundsOfSegments(planEntries);
  const dimensions = transformedBounds(rawBounds);

  const normalizedLines = planEntries.map((entry, index) => {
    const [start, end] = normalizedSegment(entry.segment, rawBounds);
    return {
      id: `dxf-${index + 1}`,
      layer: entry.targetLayer === "FP_WALLS" ? "walls" : "details",
      start,
      end,
    };
  });

  const roomBoxes = calibratedRoomBoxes(dimensions) ?? detectRooms(walls, doorArcs, rawBounds);
  const provisionalRooms = roomBoxes.map((box, index) => ({
    id: box.id ?? `room-${index + 1}`,
    name: box.name ?? `Ambiente ${index + 1}`,
    // regionBox è già espresso nell'origine normalizzata del piano:
    // x parte da minX e y parte dal bordo alto maxY.
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    points: roomPoints(box),
    center: [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ],
  }));
  const provisionalObjects = detectObjects(parsed.entities, doorArcs, rawBounds, provisionalRooms);
  const model = makeRooms(provisionalRooms, provisionalObjects, dimensions.maxX, dimensions.maxY);

  const openings = doorArcs.map((door, index) => ({
    id: `door-${index + 1}`,
    type: "door",
    position: normalizePoint(door.center, rawBounds),
    width: round(door.radius),
    height: 210,
    wall: doorWall(door, walls, rawBounds),
    exposure: doorWall(door, walls, rawBounds),
  }));

  const data = {
    id: model.id,
    name: model.name,
    unit: "cm",
    scale: 1,
    sourceFile: basename(OUTPUT_DXF_PATH),
    width: dimensions.maxX,
    height: dimensions.maxY,
    bounds: {
      minX: round(rawBounds.minX, 3),
      minY: round(rawBounds.minY, 3),
      maxX: round(rawBounds.maxX, 3),
      maxY: round(rawBounds.maxY, 3),
    },
    lines: normalizedLines,
    openings,
  };

  const layerCounts = {};
  for (const entity of parsed.entities) {
    const source = entityLayer(entity);
    const target = effectiveLayer(entity, doorArcs);
    layerCounts[target] = (layerCounts[target] ?? 0) + 1;
    if (source !== target) layerCounts[`${source} → ${target}`] = (layerCounts[`${source} → ${target}`] ?? 0) + 1;
  }

  const candidateLines = ensureLayers(parsed.rawLines);
  const candidateParsed = parseDxf(candidateLines.join("\n"));
  const replacements = new Map();
  for (const entity of candidateParsed.entities) {
    const target = effectiveLayer(entity, doorArcs);
    const layerPair = entity.pairs.find((pair) => pair.code === "8");
    if (!layerPair || target === entityLayer(entity)) continue;
    replacements.set(layerPair.valueLine, target);
  }
  const transformedLines = candidateLines.map((line, index) => replacements.get(index) ?? line);
  const currentParsed = parseDxf(transformedLines.join("\n"));
  const finalDxfLines = appendDemoGeometry(
    transformedLines,
    currentParsed.entitiesEndSecLine,
    model.rooms,
    model.objects,
    rawBounds
  );

  mkdirSync(dirname(OUTPUT_DXF_PATH), { recursive: true });
  mkdirSync(dirname(OUTPUT_DATA_PATH), { recursive: true });
  mkdirSync(dirname(OUTPUT_MODEL_PATH), { recursive: true });
  mkdirSync(dirname(OUTPUT_MANIFEST_PATH), { recursive: true });
  writeFileSync(OUTPUT_DXF_PATH, finalDxfLines.join("\n"));
  writeFileSync(OUTPUT_DATA_PATH, JSON.stringify(data, null, 2));
  writeFileSync(OUTPUT_MODEL_PATH, JSON.stringify(model, null, 2));

  const manifest = {
    version: 1,
    kind: "demo-candidate",
    sourceFile: INPUT_PATH,
    outputFile: OUTPUT_DXF_PATH,
    coordinateSystem: "cm, Y ribaltata solo nell'import app; il DXF resta nelle coordinate CAD originali",
    classification: {
      walls: "Linee-04 → FP_WALLS",
      doors: "archi PROSP e sole linee PROSP collegate agli archi → FP_DOORS",
      windows: "non separati automaticamente: la sorgente li mescola con dettagli/scale in prosp1",
      rooms: "poligoni calibrati sui bordi interni dei muri per la demo Casa Enri; il fallback automatico resta disponibile per file senza calibrazione",
      objects: "polilinee rettangolari demo generate raggruppando la geometria dei layer arredo; tipo volutamente generico",
      untouched: "layer nativi conservati per poter correggere la classificazione senza perdere geometria",
    },
    statistics: {
      sourceEntities: parsed.entities.length,
      importedLines: normalizedLines.length,
      rooms: model.rooms.length,
      objects: model.objects.length,
      doors: openings.length,
      layerCounts,
    },
    reviewBeforeClientDemo: [
      "Controllare visivamente le ancore FP_OBJECTS e rimuovere eventuali falsi positivi non pertinenti.",
      "La calibrazione delle nove aree è specifica per Casa Enri: per un altro DXF usare FP_ROOMS o una nuova calibrazione verificata.",
      "Le finestre restano visibili nei layer nativi ma non sono ancora un layer FP_WINDOWS affidabile.",
    ],
  };
  writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`✅ DXF demo: ${OUTPUT_DXF_PATH}`);
  console.log(`✅ Geometria app: ${OUTPUT_DATA_PATH}`);
  console.log(`✅ Modello app: ${OUTPUT_MODEL_PATH}`);
  console.log(`✅ Manifest: ${OUTPUT_MANIFEST_PATH}`);
  console.log(`   muri=${walls.length} segmenti · linee importate=${normalizedLines.length} · porte=${openings.length}`);
  console.log(`   stanze candidate=${model.rooms.length} · ancore oggetti=${model.objects.length}`);
}

main();
