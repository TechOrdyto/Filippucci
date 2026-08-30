// Estrazione testo da PDF usando pdftotext (poppler) come subprocess
// Affidabile in Next.js (nessun worker da configurare)
// Fallback: pdfjs-dist per il browser

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: ExtractedPage[];
  fullText: string;
  pageCount: number;
  metadata?: Record<string, string>;
}

/**
 * Estrae il testo da un PDF usando pdftotext (poppler)
 * Funziona solo lato server (Node.js)
 */
export async function extractTextFromPdf(
  data: ArrayBuffer | Uint8Array
): Promise<PdfExtractionResult> {
  // Salva il PDF in un file temporaneo
  const binaryData =
    typeof Buffer !== "undefined" && Buffer.isBuffer(data)
      ? new Uint8Array(data)
      : data;

  const tmpFile = join(tmpdir(), `ordyto-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(tmpFile, binaryData);

  try {
    // 1. Estrai il testo con pdftotext
    const { stdout } = await execFileAsync("pdftotext", [tmpFile, "-"]);
    const fullText = stdout;

    // 2. Ottieni il numero di pagine con pdfinfo
    let pageCount = 1;
    try {
      const { stdout: info } = await execFileAsync("pdfinfo", [tmpFile]);
      const match = info.match(/Pages:\s+(\d+)/);
      if (match) pageCount = parseInt(match[1], 10);
    } catch {
      // pdfinfo non disponibile, stima dal testo
      pageCount = (fullText.match(/--- PAGE BREAK ---/g) ?? []).length + 1;
    }

    // 3. Dividi il testo in pagine
    const pageTexts = fullText.split(/\f/).filter((p) => p.trim().length > 0);
    const pages: ExtractedPage[] = pageTexts.map((text, i) => ({
      pageNumber: i + 1,
      text: text.trim(),
    }));

    return {
      pages,
      fullText,
      pageCount,
      metadata: {},
    };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // file già rimosso
    }
  }
}

/**
 * Estrae le immagini da un PDF (per OCR o anteprime)
 * Usa pdftoppm (poppler) — ritorna i percorsi dei file
 */
export async function extractImagesFromPdf(
  data: ArrayBuffer | Uint8Array,
  options: { maxPages?: number; scale?: number } = {}
): Promise<Array<{ pageNumber: number; dataUrl: string }>> {
  const binaryData =
    typeof Buffer !== "undefined" && Buffer.isBuffer(data)
      ? new Uint8Array(data)
      : data;

  const tmpFile = join(tmpdir(), `ordyto-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(tmpFile, binaryData);

  const { maxPages = 10, scale = 2 } = options;

  try {
    // Converti le pagine in PNG con pdftoppm
    const tmpPrefix = join(tmpdir(), `ordyto-img-${Date.now()}`);
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(72 * scale),
      "-f",
      "1",
      "-l",
      String(maxPages),
      tmpFile,
      tmpPrefix,
    ]);

    // Leggi i file generati
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(tmpdir())
      .filter((f) => f.startsWith(`ordyto-img-${Date.now()}`) && f.endsWith(".png"))
      .sort();

    const images = files.map((f, i) => ({
      pageNumber: i + 1,
      dataUrl: `file://${join(tmpdir(), f)}`,
    }));

    return images;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // già rimosso
    }
  }
}