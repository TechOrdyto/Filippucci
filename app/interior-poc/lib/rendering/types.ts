// Tipi del contratto di scena per la generazione render.
//
// Il contratto (RenderSceneSpec) è una ALLOWLIST ASSOLUTA: il modello
// immagini può renderizzare solo ciò che è descritto qui. Le tre fonti
// autorevoli sono:
//   1. Planimetria  → stanza, muri, aperture, camera, posizione/ingombro arredi
//   2. Catalogo     → identità, design, materiali, colori, dimensioni dei mobili
//   3. Campi utente → finiture e indicazioni esplicitamente inserite dall'utente
//
// Tutte le misure geometriche sono in METRI (il DXF resta in unità piano/cm;
// la conversione avviene in buildRenderScene).

import type { Geometry } from "../../floorplan/types";
import type { ObjectProductAssignment, Product } from "../types";

export interface RenderFinishes {
  walls: string | null;
  floor: string | null;
  doors: string | null;
  windows: string | null;
}

export interface RenderSceneOpening {
  id: string;
  type: "door" | "window" | "french-door";
  position: { x: number; y: number }; // metri
  width: number; // metri
  height?: number; // metri
  wall: "north" | "south" | "east" | "west";
  exposure?: "north" | "south" | "east" | "west";
}

export interface RenderSceneRoom {
  id: string;
  name: string;
  type?: string;
  polygon: [number, number][]; // metri
  bounds: { x: number; y: number; width: number; height: number }; // metri
  width: number; // metri
  depth: number; // metri
  area: number; // m²
  ceilingHeight: number; // metri
  walls: Array<{ id: string; start: [number, number]; end: [number, number] }>; // metri
  doors: RenderSceneOpening[];
  windows: RenderSceneOpening[];
  openings: RenderSceneOpening[];
}

export interface RenderSceneCamera {
  x: number; // metri
  y: number; // metri
  rotation: number; // gradi, 0 = nord, 90 = est, 180 = sud, 270 = ovest
  direction: string; // cardinale (north, north-east, ...)
  fov: number; // gradi
  height: number; // metri, default 1.5
  roomId: string;
  insideRoom: boolean;
}

export interface RenderSceneObject {
  objectId: string;
  roomId: string;
  anchor: Geometry;
  anchorCenter: { x: number; y: number }; // metri
  productId: string;
  productName: string;
  productDimensions: Product["dimensions"];
  catalogImage: string | null;
}

/**
 * Istanza fisica di un prodotto nella stanza.
 * Distinzione fondamentale:
 * - prodotto catalogo: identità/design/dimensioni (fonte: catalog.json);
 * - istanza fisica: una per ogni ancora CAD associata (fonte: planimetria).
 * La lista delle istanze NON viene mai deduplicata: due ancore associate allo
 * stesso prodotto generano due istanze separate dello stesso divano.
 */
export interface FurnitureInstance {
  instanceId: string;
  anchorId: string;
  roomId: string;
  productId: string;
  productName: string;
  productDesigner: string;
  position: { x: number; y: number }; // metri, centro dell'ancora CAD
  footprint: { width: number; depth: number; height: number }; // metri
  materials: string[];
  finishes: string[];
  catalogImage: string | null;
}

export interface RenderSceneSpec {
  version: 2;
  floorplanId: string;
  prompt: string;
  userDirection: string;
  room: RenderSceneRoom | null;
  camera: RenderSceneCamera | null;
  objects: RenderSceneObject[];
  furnitureInstances: FurnitureInstance[];
  finishes: RenderFinishes;
  unresolvedAssignments: ObjectProductAssignment[];
}

export interface PromptSection {
  id: string;
  title: string;
  body: string;
}

export interface RenderPromptResult {
  providerPrompt: string;
  debugPrompt: string;
  scene: RenderSceneSpec;
}
