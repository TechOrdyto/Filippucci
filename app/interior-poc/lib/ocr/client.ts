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
    "description": "descrizione breve in italiano",
    "materials": ["materiali in italiano (es. tessuto, pelle, legno, acciaio)"],
    "finishes": ["finiture (es. Web W6281, Kendal KI642)"],
    "dimensions": { "width": cm, "depth": cm, "height": cm } (se presenti, cerca pattern come L 220 P 90 H 85),
    "image_bbox": {
      "x": percentuale dal bordo sinistro (0-100),
      "y": percentuale dal bordo superiore (0-100),
      "width": larghezza in percentuale (0-100),
      "height": altezza in percentuale (0-100)
    }
  }
}
IMPORTANTE:
- image_bbox deve indicare la regione dell'IMMAGINE del prodotto (la foto del divano/poltrona), NON il testo. Osserva dove sta la foto nella pagina e indica il suo rettangolo in percentuale.
- materials in ITALIANO (tessuto, pelle, legno, ecc.)
- Se le dimensioni non sono leggibili, usa null
Se la pagina non contiene un prodotto, rispondi con {"product": null}.
Rispondi SOLO con JSON valido, nessun altro testo.`
      : `Sei un architetto esperto. Analizza QUESTA piantina architettonica ed estrai i dati in formato JSON:
{
  "floorplan": {
    "dimensions": { "width": metri, "height": metri },
    "ceilingHeight": metri,
    "quotes": [
      { "value": metri, "axis": "x" | "y", "position": "north" | "south" | "east" | "west" }
    ],
    "rooms": [
      {
        "name": "nome stanza (es. Bagno, Camera, Cucina/Soggiorno)",
        "area": mq (se presente),
        "bounds": { "x": metri, "y": metri, "width": metri, "height": metri }
      }
    ],
    "openings": [
      {
        "type": "window" | "door" | "french-door",
        "position": { "x": metri, "y": metri },
        "width": metri,
        "height": metri,
        "wall": "north" | "south" | "east" | "west"
      }
    ]
  }
}
IMPORTANTE:
- Leggi TUTTE le quote dimensionali scritte sulla piantina (es. 3.62, 2.61, 1.65, 7.22, 4.38, 4.82, 4.80, 1.10) e includile in quotes
- Le dimensioni totali sono le quote più grandi (es. 15.10 × 15.10)
- Elenca TUTTE le stanze visibili: Bagno, WC, Cucina/Soggiorno, Camere, Anti, Guardaroba, Ingresso, Balcone, ecc.
- bounds delle stanze in METRI, con origine in alto a sinistra
- Le stanze NON devono sovrapporsi: la somma delle larghezze su ogni riga = larghezza totale, la somma delle altezze su ogni colonna = altezza totale
- Identifica porte e finestre disegnate (porte tra stanze, finestre sui muri esterni)
- Se una stanza non ha area scritta, calcolala da width × height
Se non riesci a leggere la piantina, rispondi con {"floorplan": null}.
Rispondi SOLO con JSON valido, nessun altro testo.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // gpt-4o per il floorplan (più potente per piantine complesse),
      // gpt-4o-mini per il catalogo (più economico)
      model: options.documentType === "floorplan" ? "gpt-4o" : "gpt-4o-mini",
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

  // Per catalogo e floorplan, il contenuto è già JSON strutturato
  if (options.documentType === "catalog" || options.documentType === "floorplan") {
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

  // Fallback: dividi il testo in righe
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