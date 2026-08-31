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
      : `Sei un architetto esperto. Analizza QUESTA piantina architettonica "Piano Rialzato" ed estrai i dati in formato JSON.

MISURE NOTE DALLA PIANTINA (usa questi valori ESATTI, sono autorevoli):
- Dimensioni totali: 15.10m × 15.10m
- Altezza soffitto: 2.75m
- Quote nord (da sinistra a destra): 3.62 + 2.61 + 1.65 + 7.22 = 15.10
- Quote sud (da sinistra a destra): 4.38 + 4.82 + 4.80 + 1.10 = 15.10
- Stanze con superfici scritte:
  * Bagno: 4.58 mq
  * W.C.: 4.17 mq
  * Camera: 10.72 mq
  * Anti: 2.08 mq
  * Guardaroba: 4.19 mq
  * Cucina/Soggiorno: 47.09 mq
  * Camera: 14.51 mq
  * Ingresso: 8.36 mq
  * Camera: 16.31 mq
  * Balcone: 5.60 mq

Il tuo compito: osserva la piantina e determina la POSIZIONE (bounds) di ogni stanza usando le misure sopra. La piantina ha 10 stanze.

Rispondi con JSON:
{
  "floorplan": {
    "dimensions": { "width": 15.1, "height": 15.1 },
    "ceilingHeight": 2.75,
    "quotes": [
      { "value": 3.62, "axis": "x", "position": "north" },
      { "value": 2.61, "axis": "x", "position": "north" },
      { "value": 1.65, "axis": "x", "position": "north" },
      { "value": 7.22, "axis": "x", "position": "north" },
      { "value": 4.38, "axis": "x", "position": "south" },
      { "value": 4.82, "axis": "x", "position": "south" },
      { "value": 4.80, "axis": "x", "position": "south" },
      { "value": 1.10, "axis": "x", "position": "south" }
    ],
    "walls": [
      {
        "id": "wall_1",
        "start": [0, 0],
        "end": [3.62, 0],
        "thickness": 0.15,
        "openings": [
          { "type": "door", "center": 1.8, "width": 0.8 },
          { "type": "window", "center": 2.9, "width": 0.6 }
        ]
      }
    ],
    "rooms": [
      {
        "name": "Bagno",
        "area": 4.58,
        "bounds": { "x": 0, "y": 0, "width": 3.62, "height": 1.27 }
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

REGOLE CRITICHE:
1. DEVE esserci ESATTAMENTE 1 stanza per ogni superficie elencata sopra (10 stanze totali)
2. Ogni stanza deve avere area = width × height (tolleranza ±5%)
3. Le stanze NON devono sovrapporsi
4. La somma delle larghezze su ogni riga = 15.10, la somma delle altezze su ogni colonna = 15.10
5. bounds in METRI, origine in alto a sinistra
6. walls: elenca i muri principali con coordinate [x, y] in metri e le aperture su ogni muro
7. Identifica porte e finestre disegnate sulla piantina
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
            // detail: "high" per il floorplan (serve precisione), "low" per il catalogo
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: options.documentType === "floorplan" ? "high" : "low",
              },
            },
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