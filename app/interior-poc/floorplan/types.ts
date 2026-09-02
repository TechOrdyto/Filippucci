// Tipi core del modulo Planimetria
// Sistema di coordinate: unico e coincidente con la sorgente DXF.
// Le geometrie restano nelle unità piano importate (viewBox SVG); la
// conversione in metri avviene solo nei calcoli semantici della camera/API.

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
