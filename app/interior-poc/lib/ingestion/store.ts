// Store file system per la pipeline di ingestione
// Ogni step della saga scrive in una cartella dedicata
// L'idempotenza è garantita dal documentId come chiave unica

import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const DATA_ROOT = resolve(process.cwd(), "data/ingestion");

const DIRS = {
  documents: "documents",
  normalized: "normalized",
  ocr: "ocr-results",
  interpretations: "interpretations",
  floorplans: "floorplans",
  catalogs: "catalogs",
  saga: "saga-state",
} as const;

function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    mkdirSync(join(DATA_ROOT, dir), { recursive: true });
  }
}

ensureDirs();

export function computeFileHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export function generateDocumentId(type: string, hash: string): string {
  return `${type}-${hash}`;
}

// ─── Documenti ──────────────────────────────────────────────────

export function saveDocument(documentId: string, data: Buffer, ext: string): string {
  const path = join(DATA_ROOT, DIRS.documents, `${documentId}.${ext}`);
  writeFileSync(path, data);
  return path;
}

export function getDocumentPath(documentId: string, ext: string): string {
  return join(DATA_ROOT, DIRS.documents, `${documentId}.${ext}`);
}

// ─── Pagine normalizzate ────────────────────────────────────────

export function saveNormalizedPage(documentId: string, pageNumber: number, pngBuffer: Buffer): string {
  const path = join(DATA_ROOT, DIRS.normalized, `${documentId}-p${pageNumber}.png`);
  writeFileSync(path, pngBuffer);
  return path;
}

// ─── OCR results ────────────────────────────────────────────────

export function saveOcrResult(documentId: string, result: unknown): string {
  const path = join(DATA_ROOT, DIRS.ocr, `${documentId}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

export function loadOcrResult<T>(documentId: string): T | null {
  const path = join(DATA_ROOT, DIRS.ocr, `${documentId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// ─── Interpretazioni ────────────────────────────────────────────

export function saveInterpretation(documentId: string, result: unknown): string {
  const path = join(DATA_ROOT, DIRS.interpretations, `${documentId}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

export function loadInterpretation<T>(documentId: string): T | null {
  const path = join(DATA_ROOT, DIRS.interpretations, `${documentId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// ─── Floorplan / Catalogo finali ────────────────────────────────

export function saveFloorplan(documentId: string, floorplan: unknown): string {
  const path = join(DATA_ROOT, DIRS.floorplans, `${documentId}.json`);
  writeFileSync(path, JSON.stringify(floorplan, null, 2));
  return path;
}

export function saveCatalog(documentId: string, catalog: unknown): string {
  const path = join(DATA_ROOT, DIRS.catalogs, `${documentId}.json`);
  writeFileSync(path, JSON.stringify(catalog, null, 2));
  return path;
}

// ─── Saga state (idempotenza) ───────────────────────────────────

export function markStepDone(documentId: string, stepId: string, result: unknown): void {
  const path = join(DATA_ROOT, DIRS.saga, `${documentId}.json`);
  let state: Record<string, unknown> = {};
  if (existsSync(path)) {
    state = JSON.parse(readFileSync(path, "utf-8"));
  }
  state[stepId] = result;
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function isStepDone(documentId: string, stepId: string): boolean {
  const path = join(DATA_ROOT, DIRS.saga, `${documentId}.json`);
  if (!existsSync(path)) return false;
  const state = JSON.parse(readFileSync(path, "utf-8"));
  return stepId in state;
}

export function getStepResult<T>(documentId: string, stepId: string): T | null {
  const path = join(DATA_ROOT, DIRS.saga, `${documentId}.json`);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf-8"));
  return (state[stepId] as T) ?? null;
}

export function clearSagaState(documentId: string): void {
  const path = join(DATA_ROOT, DIRS.saga, `${documentId}.json`);
  if (existsSync(path)) unlinkSync(path);
}

// ─── Pulizia (compensazione) ────────────────────────────────────

export function deleteFile(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // file già rimosso
  }
}

export function deleteDocumentArtifacts(documentId: string): void {
  // Rimuove tutti gli artefatti del documento
  for (const dir of Object.values(DIRS)) {
    const dirPath = join(DATA_ROOT, dir);
    if (!existsSync(dirPath)) continue;
    const files = require("node:fs").readdirSync(dirPath);
    for (const file of files) {
      if (file.startsWith(documentId)) {
        deleteFile(join(dirPath, file));
      }
    }
  }
}