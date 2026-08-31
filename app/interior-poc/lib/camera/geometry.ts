// Geometria per il posizionamento della camera 2D
// Funzioni pure: point-in-polygon, distanza dai muri, clamp

import type { Point } from "./types";
import type { FloorplanRoom, Wall } from "../types";

/**
 * Verifica se un punto è dentro un poligono (ray casting)
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Converte un polygon di array in array di Point
 */
export function toPoints(polygon: Array<[number, number]>): Point[] {
  return polygon.map(([x, y]) => ({ x, y }));
}

/**
 * Distanza di un punto da un segmento (muro)
 */
export function distanceToSegment(
  point: Point,
  start: Point,
  end: Point
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = start.x + t * dx;
  const projY = start.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Distanza minima di un punto dai muri della stanza
 */
export function distanceToWalls(
  point: Point,
  room: FloorplanRoom,
  walls: Wall[]
): number {
  const polygon = room.polygon ?? [
    [room.bounds.x, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
    [room.bounds.x, room.bounds.y + room.bounds.height],
  ];

  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = distanceToSegment(point, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
    if (d < minDist) minDist = d;
  }

  // Considera anche i muri interni
  for (const wall of walls) {
    const d = distanceToSegment(point, { x: wall.start[0], y: wall.start[1] }, { x: wall.end[0], y: wall.end[1] });
    if (d < minDist) minDist = d;
  }

  return minDist;
}

/**
 * Verifica se una posizione è valida per la camera
 */
export function isPositionValid(
  point: Point,
  room: FloorplanRoom,
  walls: Wall[],
  minDistance: number
): boolean {
  const polygon = room.polygon ?? [
    [room.bounds.x, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
    [room.bounds.x, room.bounds.y + room.bounds.height],
  ];

  // 1. Deve essere dentro il polygon
  if (!pointInPolygon(point, toPoints(polygon))) return false;

  // 2. Deve rispettare la distanza minima dai muri
  const dist = distanceToWalls(point, room, walls);
  if (dist < minDistance) return false;

  return true;
}

/**
 * Clamp di un punto dentro il polygon della stanza
 * (sposta il punto al bordo più vicino se fuori)
 */
export function clampToRoom(point: Point, room: FloorplanRoom): Point {
  const polygon = room.polygon ?? [
    [room.bounds.x, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y],
    [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
    [room.bounds.x, room.bounds.y + room.bounds.height],
  ];

  if (pointInPolygon(point, toPoints(polygon))) {
    return point;
  }

  // Trova il punto più vicino sul bordo del polygon
  let bestPoint = point;
  let bestDist = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const closest = closestPointOnSegment(point, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
    const d = Math.hypot(closest.x - point.x, closest.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = closest;
    }
  }

  return bestPoint;
}

/**
 * Punto più vicino su un segmento
 */
export function closestPointOnSegment(
  point: Point,
  start: Point,
  end: Point
): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return start;

  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
}

/**
 * Trova la stanza che contiene un punto
 */
export function findRoomAtPoint(
  point: Point,
  rooms: FloorplanRoom[]
): FloorplanRoom | null {
  for (const room of rooms) {
    const polygon = room.polygon ?? [
      [room.bounds.x, room.bounds.y],
      [room.bounds.x + room.bounds.width, room.bounds.y],
      [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
      [room.bounds.x, room.bounds.y + room.bounds.height],
    ];
    if (pointInPolygon(point, toPoints(polygon))) {
      return room;
    }
  }
  return null;
}

/**
 * Centro di un polygon
 */
export function polygonCenter(polygon: Array<[number, number]>): Point {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of polygon) {
    cx += x;
    cy += y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

/**
 * Calcola la rotazione (gradi) da un punto verso un target
 * 0 = nord, 90 = est, 180 = sud, 270 = ovest
 */
export function rotationToTarget(from: Point, target: Point): number {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  // atan2(dy, dx) dà l'angolo da est; converti a 0=nord
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (angle + 90 + 360) % 360;
}

/**
 * Vettore direzione da rotazione (gradi)
 */
export function directionFromRotation(rotation: number): { x: number; y: number } {
  const rad = ((rotation - 90) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}