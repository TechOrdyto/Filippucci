// OCR con tesseract.js — estrae testo da immagini (piantine, scansioni)
// Funziona sia lato client (browser) che lato server

import { createWorker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
  blocks?: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

let workerPromise: Promise<any> | null = null;

async function getWorker(lang = "ita") {
  if (!workerPromise) {
    workerPromise = createWorker(lang);
  }
  return workerPromise;
}

/**
 * Esegue OCR su un'immagine (data URL, URL o path)
 */
export async function ocrImage(
  imageSource: string | ArrayBuffer,
  options: { lang?: string } = {}
): Promise<OcrResult> {
  const { lang = "ita" } = options;
  const worker = await getWorker(lang);

  const result = await worker.recognize(imageSource);
  const { data } = result;

  return {
    text: data.text ?? "",
    confidence: data.confidence ?? 0,
    blocks: data.blocks?.map((b: any) => ({
      text: b.text,
      confidence: b.confidence,
      bbox: b.bbox,
    })),
  };
}

/**
 * OCR su un PDF: converte ogni pagina in immagine e la processa
 */
export async function ocrPdf(
  pdfData: ArrayBuffer,
  options: { lang?: string; maxPages?: number } = {}
): Promise<Array<{ pageNumber: number; text: string; confidence: number }>> {
  const { lang = "ita", maxPages = 10 } = options;

  // Import dinamico per evitare problemi di bundling
  const { extractImagesFromPdf } = await import("./pdf");

  const images = await extractImagesFromPdf(pdfData, { maxPages, scale: 2 });
  const results = [];

  for (const img of images) {
    const ocr = await ocrImage(img.dataUrl, { lang });
    results.push({
      pageNumber: img.pageNumber,
      text: ocr.text,
      confidence: ocr.confidence,
    });
  }

  return results;
}

/**
 * OCR su un'immagine della piantina (screenshot o scansione)
 */
export async function ocrFloorplanImage(
  imageSource: string | ArrayBuffer
): Promise<OcrResult> {
  return ocrImage(imageSource, { lang: "ita" });
}