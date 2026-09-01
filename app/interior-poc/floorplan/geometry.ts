// Funzioni geometriche pure nel sistema di coordinate della planimetria

import type { CircleGeometry, Geometry, RectangleGeometry } from "./types";

export interface Point {
  x: number;
  y: number;
}

export function pointInPolygon(
  px: number,
  py: number,
  points: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInRectangle(
  px: number,
  py: number,
  rect: RectangleGeometry
): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

export function pointInCircle(
  px: number,
  py: number,
  circle: CircleGeometry
): boolean {
  const dx = px - circle.cx;
  const dy = py - circle.cy;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

export function pointInGeometry(
  px: number,
  py: number,
  geometry: Geometry
): boolean {
  switch (geometry.type) {
    case "rectangle":
      return pointInRectangle(px, py, geometry);
    case "polygon":
      return pointInPolygon(px, py, geometry.points);
    case "circle":
      return pointInCircle(px, py, geometry);
    default:
      return false;
  }
}

export function geometryBounds(geometry: Geometry): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  switch (geometry.type) {
    case "rectangle":
      return {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      };
    case "polygon": {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of geometry.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case "circle":
      return {
        x: geometry.cx - geometry.radius,
        y: geometry.cy - geometry.radius,
        width: geometry.radius * 2,
        height: geometry.radius * 2,
      };
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function geometryCenter(geometry: Geometry): Point {
  const b = geometryBounds(geometry);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function polygonCenter(points: [number, number][]): Point {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

export function boundsFromPolygon(points: [number, number][]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}