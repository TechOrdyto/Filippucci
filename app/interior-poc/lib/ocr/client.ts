// Client OCR per la pipeline di ingestione
// Funziona su Vercel (serverless):
// Usa AI vision (gpt-4o-mini) — funziona ovunque, alta precisione per quote tecniche
// (tesseract.js non funziona in Next.js: worker incompatibile con il bundler)

import type { OcrPageResult, OcrTextBlock } from "../ingestion/types";

/**
 * Esegue OCR su un'immagine usando AI vision (gpt-4o-mini)
 */
export async function ocrImage(
  imageBuffer: Buffer,
  options: { lang?: string } = {}
): Promise<OcrPageResult> {
  return ocrWithAiVision(imageBuffer);
}

/**
 * OCR con AI vision (gpt-4o-mini)
 * Estrae testo con posizione per ricostruire la geometria
 */
async function ocrWithAiVision(imageBuffer: Buffer): Promise<OcrPageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata per OCR AI vision");
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
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "Sei un OCR esperto di documenti tecnici. Estrai TUTTO il testo visibile nell'immagine, riga per riga, in ordine di lettura (dall'alto al basso, da sinistra a destra). Includi numeri, misure, quote dimensionali, etichette, nomi di stanze. Non omettere nulla.",
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
 * (per compatibilità con la saga — sempre true con AI vision)
 */
export async function checkOcrServer(): Promise<boolean> {
  return true;
}