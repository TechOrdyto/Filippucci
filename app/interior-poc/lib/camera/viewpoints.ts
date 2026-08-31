// Generazione viewpoint deterministici per ogni stanza
// Basata sulla geometria: angoli, porte, finestre, centro

import type { Viewpoint, Point, CameraConfig } from "./types";
import type { FloorplanRoom, Wall } from "../types";
import {
  polygonCenter,
  rotationToTarget,
  isPositionValid,
  toPoints,
} from "./geometry";

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  minDistanceFromWall: 0.3,
  defaultFov: 70,
  defaultViewpoints: 4,
};

/**
 * Genera viewpoint deterministici per una stanza
 * @param room La stanza
 * @param walls I muri (per validazione distanza)
 * @param config Configurazione
 */
export function generateViewpoints(
  room: FloorplanRoom,
  walls: Wall[],
  config: CameraConfig = DEFAULT_CAMERA_CONFIG
): Viewpoint[] {
  const polygon = room.polygon ?? [
    [room.bounds.x, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
    [room.bounds.x, room.bounds.y + room.bounds.height],
  ];

  const center = polygonCenter(polygon);
  const points = toPoints(polygon);
  const viewpoints: Viewpoint[] = [];

  // 1. Angolo sud-ovest → guarda nord-est
  const sw = findCorner(points, "south-west");
  if (sw) {
    const pos = insetFromCorner(sw, polygon, config.minDistanceFromWall);
    if (isPositionValid(pos, room, walls, config.minDistanceFromWall)) {
      viewpoints.push({
        id: `${room.id}-vp-1`,
        roomId: room.id,
        position: pos,
        rotation: rotationToTarget(pos, center),
        fov: config.defaultFov,
        label: "Angolo sud-ovest → nord-est",
      });
    }
  }

  // 2. Angolo sud-est → guarda nord-ovest
  const se = findCorner(points, "south-east");
  if (se) {
    const pos = insetFromCorner(se, polygon, config.minDistanceFromWall);
    if (isPositionValid(pos, room, walls, config.minDistanceFromWall)) {
      viewpoints.push({
        id: `${room.id}-vp-2`,
        roomId: room.id,
        position: pos,
        rotation: rotationToTarget(pos, center),
        fov: config.defaultFov,
        label: "Angolo sud-est → nord-ovest",
      });
    }
  }

  // 3. Vicino all'ingresso → guarda il centro
  const door = room.openings.find((o) => o.type === "door");
  if (door) {
    const pos = {
      x: door.position.x + (door.position.x < center.x ? 0.5 : -0.5),
      y: door.position.y + (door.position.y < center.y ? 0.5 : -0.5),
    };
    if (isPositionValid(pos, room, walls, config.minDistanceFromWall)) {
      viewpoints.push({
        id: `${room.id}-vp-3`,
        roomId: room.id,
        position: pos,
        rotation: rotationToTarget(pos, center),
        fov: config.defaultFov,
        label: "Vicino all'ingresso → centro",
      });
    }
  }

  // 4. Davanti alla finestra → guarda l'interno
  const window = room.openings.find((o) => o.type === "window" || o.type === "french-door");
  if (window) {
    const pos = {
      x: window.position.x + (window.position.x < center.x ? 0.8 : -0.8),
      y: window.position.y + (window.position.y < center.y ? 0.8 : -0.8),
    };
    if (isPositionValid(pos, room, walls, config.minDistanceFromWall)) {
      viewpoints.push({
        id: `${room.id}-vp-4`,
        roomId: room.id,
        position: pos,
        rotation: rotationToTarget(pos, center),
        fov: config.defaultFov,
        label: "Davanti alla finestra → interno",
      });
    }
  }

  // 5. Centro stanza → guarda la finestra principale
  if (window) {
    const pos = center;
    if (isPositionValid(pos, room, walls, config.minDistanceFromWall)) {
      viewpoints.push({
        id: `${room.id}-vp-5`,
        roomId: room.id,
        position: pos,
        rotation: rotationToTarget(pos, { x: window.position.x, y: window.position.y }),
        fov: config.defaultFov,
        label: "Centro stanza → finestra",
      });
    }
  }

  // Limita al numero richiesto
  return viewpoints.slice(0, config.defaultViewpoints);
}

/**
 * Trova un angolo del polygon in base alla direzione
 */
function findCorner(
  points: Point[],
  direction: "north-west" | "north-east" | "south-west" | "south-east"
): Point | null {
  if (points.length === 0) return null;

  let best = points[0];
  let bestScore = -Infinity;

  for (const p of points) {
    let score = 0;
    if (direction.includes("north")) score -= p.y;
    if (direction.includes("south")) score += p.y;
    if (direction.includes("west")) score -= p.x;
    if (direction.includes("east")) score += p.x;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

/**
 * Sposta un punto dall'angolo verso l'interno della stanza
 */
function insetFromCorner(
  corner: Point,
  polygon: Array<[number, number]>,
  inset: number
): Point {
  const center = polygonCenter(polygon);
  const dx = center.x - corner.x;
  const dy = center.y - corner.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return corner;

  const nx = dx / len;
  const ny = dy / len;

  return {
    x: corner.x + nx * inset * 2,
    y: corner.y + ny * inset * 2,
  };
}