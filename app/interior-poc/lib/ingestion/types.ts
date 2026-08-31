// Tipi condivisi per la pipeline di ingestione

export type DocumentType = "floorplan" | "catalog";

export interface IngestRequest {
  type: DocumentType;
  fileName: string;
  fileData: string; // base64
  options?: {
    lang?: string;
    dpi?: number;
    maxPages?: number;
  };
}

export interface SagaContext {
  documentId: string;
  type: DocumentType;
  fileName: string;
  fileData: Buffer;
  fileHash: string;
  options?: {
    lang?: string;
    dpi?: number;
    maxPages?: number;
  };
  // Popolati durante la saga
  normalizedPages?: NormalizedPage[];
  ocrResults?: OcrPageResult[];
  interpretation?: FloorplanInterpretation | CatalogInterpretation;
  validation?: ValidationResult;
  persistedPaths?: string[];
}

export interface NormalizedPage {
  pageNumber: number;
  imagePath: string; // path del PNG normalizzato
  width: number;
  height: number;
}

export interface OcrTextBlock {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  center: { x: number; y: number };
}

export interface OcrPageResult {
  pageNumber: number;
  textBlocks: OcrTextBlock[];
  imageSize: { width: number; height: number };
  fullText: string;
}

// ─── Interpretazione Floorplan ─────────────────────────────────

export interface FloorplanInterpretation {
  dimensions: { width: number; height: number };
  ceilingHeight: number;
  quotes: Quote[];
  walls: Wall[];
  rooms: InterpretedRoom[];
  openings: InterpretedOpening[];
  warnings: string[];
}

export interface Wall {
  id: string;
  start: [number, number]; // [x, y] in metri
  end: [number, number]; // [x, y] in metri
  thickness: number;
  openings: Array<{
    type: "door" | "window" | "french-door";
    center: number; // posizione lungo il muro
    width: number;
  }>;
}

export interface Quote {
  value: number;
  axis: "x" | "y";
  start: number;
  end: number;
  wall?: "north" | "south" | "east" | "west";
  source: "ocr" | "derived"; // derivata = sottrazione dal totale
}

export interface InterpretedRoom {
  name: string;
  area?: number;
  bounds: { x: number; y: number; width: number; height: number };
  textBlockRef?: string;
}

export interface InterpretedOpening {
  type: "window" | "door" | "french-door";
  position: { x: number; y: number };
  width: number;
  height: number;
  wall: "north" | "south" | "east" | "west";
  exposure: "north" | "south" | "east" | "west";
}

// ─── Interpretazione Catalogo ──────────────────────────────────

export interface CatalogInterpretation {
  products: InterpretedProduct[];
  warnings: string[];
}

export interface InterpretedProduct {
  id: string;
  name: string;
  designer?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  dimensions?: { width: number; depth: number; height: number };
  materials?: string[];
  finishes?: string[];
  pageNumber: number;
  imageRegion?: {
    bbox: { x: number; y: number; width: number; height: number };
    verified: boolean;
  };
}

// ─── Validazione ────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Saga ───────────────────────────────────────────────────────

export interface SagaStep<T = any> {
  id: string;
  execute: (ctx: SagaContext) => Promise<T>;
  compensate: (ctx: SagaContext, result: T) => Promise<void>;
  idempotencyKey: (ctx: SagaContext) => string;
}

export interface SagaResult {
  success: boolean;
  documentId: string;
  executedSteps: string[];
  error?: string;
  output?: FloorplanInterpretation | CatalogInterpretation;
}