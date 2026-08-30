// Client OCR per la pipeline di ingestione
// Funziona su Vercel (serverless):
// Usa AI vision (gpt-4o-mini) — funziona ovunque, alta precisione per quote tecniche

import type { OcrPageResult, OcrTextBlock } from "../ingestion/types";

export interface OcrOptions {
  lang?: string;
  // Tipo di documento per prompt OCR specializzato
  documentType?: "floorplan" | "catalog";
}

/**
 * Esegue OCR su un'immagine usando AI vision (gpt-4o-mini)
 */
export async function ocrImage(
  imageBuffer: Buffer,
  options: OcrOptions = {}
): Promise<OcrPageResult> {
  return ocrWithAiVision(imageBuffer, options);
}

/**
 * OCR con AI vision (gpt-4o-mini)
 * Prompt specializzato per tipo di documento
 */
async function ocrWithAiVision(
  imageBuffer: Buffer,
  options: OcrOptions
): Promise<OcrPageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata per OCR AI vision");
  }

  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  // Prompt specializzato per tipo di documento
  const systemPrompt =
    options.documentType === "catalog"
      ? `Sei un OCR esperto di cataloghi di arredamento Molteni&C.
Analizza QUESTA pagina di catalogo ed estrai i dati del prodotto in formato JSON:
{
  "product": {
    "name": "nome prodotto (es. Emile, Augusto, Cleo)",
    "designer": "designer (es. Vincent Van Duysen)",
    "category": "categoria (es. Seating System, Sofa, Armchair, Table)",
    "description": "descrizione breve",
    "materials": ["materiali"],
    "finishes": ["finiture"],
    "dimensions": { "width": cm, "depth": cm, "height": cm } (se presenti),
    "image_bbox": {
      "x": percentuale dal bordo sinistro (0-100),
      "y": percentuale dal bordo superiore (0-100),
      "width": larghezza in percentuale (0-100),
      "height": altezza in percentuale (0-100)
    }
  }
}
IMPORTANTE: image_bbox deve indicare la regione dell'IMMAGINE del prodotto (la foto del divano/poltrona), NON il testo. Osserva dove sta la foto nella pagina e indica il suo rettangolo in percentuale.
Se la pagina non contiene un prodotto, rispondi con {"product": null}.
Rispondi SOLO con JSON valido, nessun altro testo.`
      : `Sei un OCR esperto di documenti tecnici. Estrai TUTTO il testo visibile nell'immagine, riga per riga, in ordine di lettura (dall'alto al basso, da sinistra a destra). Includi numeri, misure, quote dimensionali, etichette, nomi di stanze. Non omettere nulla.`;

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
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            // detail: "low" riduce i token (importante per rate limit)
            { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
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

  // Per il catalogo, il contenuto è già JSON strutturato
  if (options.documentType === "catalog") {
    const textBlocks: OcrTextBlock[] = [
      {
        text: content,
        confidence: 0.9,
        bbox: { x0: 0, y0: 0, x1: 1000, y1: 20 },
        center: { x: 500, y: 10 },
      },
    ];
    return {
      pageNumber: 1,
      textBlocks,
      imageSize: { width: 0, height: 0 },
      fullText: content,
    };
  }

  // Per il floorplan, dividi il testo in righe
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