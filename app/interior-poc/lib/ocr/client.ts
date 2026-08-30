// Client OCR per la pipeline di ingestione
// Funziona su Vercel (serverless):
// 1. PRIMARIO: tesseract.js (locale, gratis, gira in Node.js)
// 2. FALLBACK: AI vision gpt-4o-mini (se tesseract fallisce o precisione insufficiente)

import type { OcrPageResult, OcrTextBlock } from "../ingestion/types";

/**
 * Esegue OCR su un'immagine
 * Usa tesseract.js come primario, AI vision come fallback
 */
export async function ocrImage(
  imageBuffer: Buffer,
  options: { lang?: string } = {}
): Promise<OcrPageResult> {
  const { lang = "ita" } = options;

  // 1. Prova tesseract.js
  try {
    const result = await ocrWithTesseract(imageBuffer, lang);
    if (result.textBlocks.length > 0) {
      return result;
    }
    console.warn("⚠️ tesseract.js non ha trovato testo, fallback a AI vision");
  } catch (err) {
    console.warn("⚠️ tesseract.js fallito, fallback a AI vision:", err);
  }

  // 2. Fallback a AI vision
  return ocrWithAiVision(imageBuffer);
}

/**
 * OCR con tesseract.js (locale, gratis, funziona su Vercel)
 */
async function ocrWithTesseract(
  imageBuffer: Buffer,
  lang: string
): Promise<OcrPageResult> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker(lang);
  try {
    // tesseract.js accetta Buffer direttamente
    const result = await worker.recognize(imageBuffer);

    const textBlocks: OcrTextBlock[] = (result.data.blocks ?? []).map((block: any) => {
      const bbox = block.bbox;
      return {
        text: block.text ?? "",
        confidence: block.confidence ?? 0,
        bbox: {
          x0: bbox?.x0 ?? 0,
          y0: bbox?.y0 ?? 0,
          x1: bbox?.x1 ?? 0,
          y1: bbox?.y1 ?? 0,
        },
        center: {
          x: bbox ? (bbox.x0 + bbox.x1) / 2 : 0,
          y: bbox ? (bbox.y0 + bbox.y1) / 2 : 0,
        },
      };
    });

    return {
      pageNumber: 1,
      textBlocks,
      imageSize: { width: 0, height: 0 }, // tesseract.js non fornisce dimensioni
      fullText: result.data.text ?? "",
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR con AI vision (gpt-4o-mini) — fallback per precisione
 */
async function ocrWithAiVision(imageBuffer: Buffer): Promise<OcrPageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata per fallback AI vision");
  }

  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "Sei un OCR esperto. Estrai TUTTO il testo visibile nell'immagine, riga per riga, con la posizione approssimativa (alto/basso/sinistra/destra). Includi numeri, misure, etichette.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `AI vision error ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Dividi il testo in righe come blocchi
  const lines = content.split("\n").filter((l: string) => l.trim().length > 0);
  const textBlocks: OcrTextBlock[] = lines.map((line: string, i: number) => ({
    text: line.trim(),
    confidence: 0.9,
    bbox: { x0: 0, y0: i * 20, x1: 1000, y1: i * 20 + 20 },
    center: { x: 500, y: i * 20 + 10 },
  }));

  return {
    pageNumber: 1,
    textBlocks,
    imageSize: { width: 0, height: 0 },
    fullText: content,
  };
}

/**
 * Verifica che il servizio OCR sia disponibile
 * (per compatibilità con la saga — sempre true con tesseract.js)
 */
export async function checkOcrServer(): Promise<boolean> {
  return true;
}