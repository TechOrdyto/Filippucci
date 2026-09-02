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
import { PLAN_UNITS_PER_METER } from "../../floorplan/units";

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  // Il DXF importato resta in unità piano (cm). La camera si tiene a
  // circa 30 cm dai muri, ma il calcolo avviene nello stesso sistema della
  // piantina per non alterare la sorgente CAD.
  minDistanceFromWall: 0.3 * PLAN_UNITS_PER_METER,
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
  const minDistance = config.minDistanceFromWall;
  let sequence = 0;

  const addCandidate = (
    position: Point,
    label: string,
    kind: Viewpoint["kind"],
    target = center
  ) => {
    if (!isPositionValid(position, room, walls, minDistance)) return;
    const duplicate = viewpoints.some(
      (viewpoint) => Math.hypot(viewpoint.position.x - position.x, viewpoint.position.y - position.y) < minDistance
    );
    if (duplicate) return;
    sequence += 1;
    viewpoints.push({
      id: `${room.id}-vp-${sequence}`,
      roomId: room.id,
      position,
      rotation: rotationToTarget(position, target),
      fov: config.defaultFov,
      label,
      kind,
    });
  };

  // Se l'import CAD fornisce le aperture, le preferiamo perché danno
  // visuali più naturali. L'attuale DXF resta compatibile anche senza
  // questo metadato e usa i punti geometrici di riserva qui sotto.
  const openingOffset = Math.max(minDistance * 2, 60);
  for (const opening of room.openings) {
    const position = moveOpeningInside(opening, openingOffset);
    const isWindow = opening.type === "window" || opening.type === "french-door";
    addCandidate(
      position,
      isWindow ? "Dalla finestra → interno" : "Dall'ingresso → centro",
      isWindow ? "window" : "door"
    );
  }

  // Quattro angoli: sono sempre comprensibili e garantiscono il ventaglio
  // anche quando il DXF non espone ancora porte/finestre come metadati.
  const corners: Array<[
    "north-west" | "north-east" | "south-west" | "south-east",
    string
  ]> = [
    ["south-west", "Angolo sud-ovest → centro"],
    ["south-east", "Angolo sud-est → centro"],
    ["north-west", "Angolo nord-ovest → centro"],
    ["north-east", "Angolo nord-est → centro"],
  ];
  for (const [direction, label] of corners) {
    const corner = findCorner(points, direction);
    if (corner) addCandidate(insetFromCorner(corner, center, minDistance), label, "corner");
  }

  // Ultimo fallback per stanze strette o poligoni irregolari: un punto
  // centrale valido è preferibile a una lista vuota.
  addCandidate(center, "Centro stanza → interno", "center");

  if (viewpoints.length > 0 && !viewpoints.some((viewpoint) => viewpoint.kind === "recommended")) {
    viewpoints[0] = { ...viewpoints[0], kind: "recommended" };
  }

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
  center: Point,
  inset: number
): Point {
  return {
    // Muoviamo separatamente sugli assi: così anche una stanza stretta
    // mantiene la distanza minima da entrambi i muri dell'angolo.
    x: corner.x + Math.sign(center.x - corner.x) * inset,
    y: corner.y + Math.sign(center.y - corner.y) * inset,
  };
}

function moveOpeningInside(
  opening: FloorplanRoom["openings"][number],
  distance: number
): Point {
  switch (opening.wall) {
    case "north":
      return { x: opening.position.x, y: opening.position.y + distance };
    case "south":
      return { x: opening.position.x, y: opening.position.y - distance };
    case "east":
      return { x: opening.position.x - distance, y: opening.position.y };
    case "west":
    default:
      return { x: opening.position.x + distance, y: opening.position.y };
  }
}
