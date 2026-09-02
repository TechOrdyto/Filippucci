// Tipi core del modulo Planimetria
// Sistema di coordinate: UNICO, in metri, coincidente con la planimetria
// (width × height della casa). Tutte le geometrie appartengono a questo sistema.
// La visualizzazione usa SVG con viewBox="0 0 width height".

export interface PolygonGeometry {
  type: "polygon";
  points: [number, number][];
}

export interface RectangleGeometry {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleGeometry {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
}

// Estendibili in futuro (CAD): Line, Arc, Path
export interface LineGeometry {
  type: "line";
  start: [number, number];
  end: [number, number];
}

export interface ArcGeometry {
  type: "arc";
  center: [number, number];
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface PathGeometry {
  type: "path";
  d: string;
}

export type Geometry =
  | PolygonGeometry
  | RectangleGeometry
  | CircleGeometry
  | LineGeometry
  | ArcGeometry
  | PathGeometry;

export interface Action {
  id: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  geometry: PolygonGeometry;
  objectIds: string[];
}

export interface FloorPlanObject {
  id: string;
  name: string;
  type: string;
  roomId: string;
  geometry: Geometry;
  actions: Action[];
}

export type FloorPlanSourceRef = "svg" | "image" | "cad";

export interface FloorPlan {
  id: string;
  name: string;
  width: number;
  height: number;
  source: FloorPlanSourceRef;
  rooms: Room[];
  objects: FloorPlanObject[];
}

export type SelectionType = "object" | "room";

export interface Selection {
  type: SelectionType;
  id: string;
}

/**
 * Modalità di selezione a due livelli (layer):
 * - "room": il click seleziona SOLO le stanze
 * - "object": il click seleziona SOLO gli elementi della stanza attiva
 *
 * Il flusso è: prima selezioni una stanza (modalità room), poi selezioni
 * gli elementi di quella stanza (modalità object).
 */
export type SelectionMode = "room" | "object";