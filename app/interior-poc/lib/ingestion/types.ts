// Tipi condivisi per la pipeline di ingestione (solo cataloghi).
// La piantina non passa da qui: si importa esclusivamente da DXF.

export type DocumentType = "catalog";

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
  interpretation?: CatalogInterpretation;
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
  output?: CatalogInterpretation;
}
