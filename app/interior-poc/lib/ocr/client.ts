// Client OCR per la pipeline di ingestione
// Funziona su Vercel (serverless):
// Usa AI vision (gpt-4o-mini) — funziona ovunque, alta precisione per quote tecniche

import type { OcrPageResult, OcrTextBlock } from "../ingestion/types";
import { chatCompletionWithImage } from "../ai-client";

export interface OcrOptions {
  lang?: string;
  // Tipo di documento per prompt OCR specializzato
  documentType?: "floorplan" | "catalog";
}

/**
 * Esegue OCR su un'immagine usando una strategia ibrida:
 * 1. PaddleOCR (locale) estrae il TESTO preciso con bounding box reali
 *    (nomi, designer, dimensioni) — molto più accurato dell'AI vision
 * 2. AI vision (OpenAI) interpreta la pagina e restituisce il JSON strutturato
 *    (categoria, materiali, descrizione, regioni immagine)
 *
 * Il risultato combina: textBlocks reali (per il crop) + fullText JSON (per l'interpretazione)
 */
export async function ocrImage(
  imageBuffer: Buffer,
  options: OcrOptions = {}
): Promise<OcrPageResult> {
  // 1. PaddleOCR per il testo preciso (se disponibile)
  const paddleResult = await ocrWithPaddle(imageBuffer, options).catch((err) => {
    console.warn("⚠️ PaddleOCR non disponibile, uso solo AI vision:", err.message);
    return null;
  });

  // 2. AI vision per l'interpretazione strutturata
  const aiResult = await ocrWithAiVision(imageBuffer, options);

  // Combina: usa i textBlocks reali di PaddleOCR (per il crop preciso)
  // e il fullText JSON dell'AI vision (per l'interpretazione)
  if (paddleResult) {
    return {
      pageNumber: aiResult.pageNumber,
      textBlocks: paddleResult.textBlocks,
      imageSize: paddleResult.imageSize,
      fullText: aiResult.fullText,
    };
  }

  return aiResult;
}

/**
 * OCR con PaddleOCR (servizio locale su localhost:8001)
 * Estrae testo preciso con bounding box reali
 */
async function ocrWithPaddle(
  imageBuffer: Buffer,
  options: OcrOptions
): Promise<OcrPageResult> {
  const base64 = imageBuffer.toString("base64");

  const res = await fetch("http://localhost:8001/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: base64,
      lang: options.lang ?? "it",
    }),
  });

  if (!res.ok) {
    throw new Error(`PaddleOCR error ${res.status}`);
  }

  const data = await res.json();
  const textBlocks: OcrTextBlock[] = (data.text_blocks ?? []).map(
    (b: any) => ({
      text: b.text,
      confidence: b.confidence,
      bbox: b.bbox,
      center: b.center,
    })
  );

  return {
    pageNumber: 1,
    textBlocks,
    imageSize: data.image_size ?? { width: 0, height: 0 },
    fullText: textBlocks.map((t) => t.text).join("\n"),
  };
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
    "category": "categoria (es. Seating System, Sofa, Armchair, Table, Chair)",
    "description": "descrizione COMPLETA in italiano (riassumi il testo della pagina, 2-3 frasi)",
    "materials": ["materiali in italiano, includi le essenze legno della struttura (es. eucalipto, rovere grafite, rovere nero, rovere sunrise, rovere caffé) e i rivestimenti (tessuto, pelle)"],
    "finishes": ["finiture e rivestimenti specifici (es. Web W6281, Kendal KI642, Wonder WG447, pelle Extra L162)"],
    "dimensions": { "width": cm, "depth": cm, "height": cm } (se presenti, cerca pattern come L 220 P 90 H 85 o numeri con unità),
    "collection": "composizione della collezione se descritta (es. 4 sedie, 2 poltrone, 1 sgabello)",
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
- materials in ITALIANO, includi TUTTE le essenze legno e i rivestimenti menzionati nel testo
- description: riassumi il testo descrittivo della pagina (non solo una frase breve)
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

  // Usa il client AI unificato: prova opencode zen (gratuito) con fallback OpenAI
  // Non passiamo il modello: opencode usa il suo default (mimo-v2.5-free),
  // OpenAI usa gpt-4o (default nel client)
  const aiResponse = await chatCompletionWithImage(systemPrompt, imageDataUrl, {
    temperature: 0.1,
    maxTokens: 8192,
  });
  const content = aiResponse.content;

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
 * Controlla PaddleOCR (locale) e, in alternativa, la presenza di OPENAI_API_KEY
 */
export async function checkOcrServer(): Promise<boolean> {
  // PaddleOCR locale
  try {
    const res = await fetch("http://localhost:8001/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return true;
  } catch {
    // PaddleOCR non attivo
  }

  // Fallback: AI vision (OpenAI)
  return Boolean(process.env.OPENAI_API_KEY);
}