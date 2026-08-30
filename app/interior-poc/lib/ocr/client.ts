// Client HTTP per il servizio PaddleOCR (Python sidecar)
// Il servizio gira su localhost:8001 e espone POST /ocr

import type { OcrPageResult, OcrTextBlock } from "../ingestion/types";

const OCR_SERVER_URL = process.env.OCR_SERVER_URL ?? "http://localhost:8001";

export interface OcrServerResponse {
  text_blocks: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    center: { x: number; y: number };
  }>;
  image_size: { width: number; height: number };
}

/**
 * Esegue OCR su un'immagine via PaddleOCR
 */
export async function ocrImage(
  imageBuffer: Buffer,
  options: { lang?: string } = {}
): Promise<OcrPageResult> {
  const { lang = "it" } = options;

  const res = await fetch(`${OCR_SERVER_URL}/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBuffer.toString("base64"),
      lang,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? `OCR server error ${res.status}`);
  }

  const data: OcrServerResponse = await res.json();

  const textBlocks: OcrTextBlock[] = data.text_blocks.map((b) => ({
    text: b.text,
    confidence: b.confidence,
    bbox: b.bbox,
    center: b.center,
  }));

  return {
    pageNumber: 1,
    textBlocks,
    imageSize: data.image_size,
    fullText: textBlocks.map((t) => t.text).join("\n"),
  };
}

/**
 * Verifica che il servizio OCR sia attivo
 */
export async function checkOcrServer(): Promise<boolean> {
  try {
    const res = await fetch(`${OCR_SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}