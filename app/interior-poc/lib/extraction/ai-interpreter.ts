// Interpretazione AI del contenuto estratto (cataloghi e piantine)
// Usa il client AI unificato (opencode con fallback OpenAI)

import {
  chatCompletion,
  chatCompletionWithImage,
  extractJson,
  type AiClientOptions,
} from "../ai-client";

export interface AiInterpretationResult<T> {
  data: T;
  raw: string;
  confidence: number;
  warnings: string[];
  provider: "opencode" | "openai";
}

/**
 * Interpreta testo estratto da un catalogo in prodotti strutturati
 */
export async function interpretCatalogText(
  extractedText: string,
  options: AiClientOptions = {}
): Promise<AiInterpretationResult<any[]>> {
  const systemPrompt = `Sei un esperto di cataloghi di arredamento Molteni&C.
Estrai dal testo del catalogo i prodotti con i seguenti campi JSON:
{
  "products": [
    {
      "id": "MOL-XXX-001",
      "sku": "stringa univoca",
      "name": "nome prodotto",
      "collection": "collezione",
      "category": "Sofas | Chairs | Tables | Living Systems | Carpets",
      "subcategory": "sottocategoria",
      "designer": "designer",
      "description": "descrizione breve in italiano",
      "descriptionForAI": "descrizione dettagliata in inglese per AI generativa",
      "dimensions": { "width": cm, "depth": cm, "height": cm },
      "seatHeight": cm (se presente),
      "materials": ["materiali"],
      "finishes": ["finiture"],
      "catalogRef": "riferimento pagina"
    }
  ]
}
Regole:
- Estrai SOLO prodotti reali, non elementi decorativi o accessori
- Se le dimensioni non sono presenti, usa stime ragionevoli per categoria
- Non inventare prodotti
- Rispondi SOLO con JSON valido, nessun altro testo`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: extractedText },
    ],
    options
  );

  const parsed = extractJson<{ products: any[] }>(response.content);

  return {
    data: parsed.products ?? [],
    raw: response.content,
    confidence: 0.9,
    warnings: [],
    provider: response.provider,
  };
}

/**
 * Interpreta testo OCR di una piantina in dati strutturati
 */
export async function interpretFloorplanText(
  extractedText: string,
  options: AiClientOptions = {}
): Promise<AiInterpretationResult<any>> {
  const systemPrompt = `Sei un architetto esperto. Interpreta il testo OCR di una piantina architettonica.
Estrai i dati strutturati in JSON:
{
  "id": "slug-univoco",
  "name": "nome piano (es. Piano Rialzato)",
  "unit": "m",
  "dimensions": { "width": metri, "height": metri },
  "ceilingHeight": metri,
  "rooms": [
    {
      "id": "slug-stanza",
      "name": "nome stanza",
      "area": mq,
      "bounds": { "x": 0, "y": 0, "width": metri, "height": metri },
      "openings": [
        {
          "id": "slug-apertura",
          "type": "window | french-door | door",
          "position": { "x": metri, "y": metri },
          "width": metri,
          "height": metri,
          "wall": "north | south | east | west",
          "exposure": "north | south | east | west"
        }
      ]
    }
  ]
}
Regole:
- Usa le misure reali presenti nel testo OCR (es. "3.62", "2.61", "mq. 47.09")
- Se una misura manca, stimala in modo plausibile
- Le coordinate bounds devono essere coerenti con le dimensioni totali
- Esposizione: deduci da posizione e contesto
- Rispondi SOLO con JSON valido, nessun altro testo`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: extractedText },
    ],
    options
  );

  const parsed = extractJson<any>(response.content);

  return {
    data: parsed,
    raw: response.content,
    confidence: 0.9,
    warnings: [],
    provider: response.provider,
  };
}

/**
 * Interpreta immagine di una piantina (vision)
 */
export async function interpretFloorplanImage(
  imageDataUrl: string,
  options: AiClientOptions = {}
): Promise<AiInterpretationResult<any>> {
  const systemPrompt = `Sei un architetto esperto. Analizza l'immagine della piantina architettonica.
Estrai i dati strutturati in JSON:
{
  "id": "slug-univoco",
  "name": "nome piano",
  "unit": "m",
  "dimensions": { "width": metri, "height": metri },
  "ceilingHeight": metri,
  "rooms": [
    {
      "id": "slug-stanza",
      "name": "nome stanza",
      "area": mq,
      "bounds": { "x": 0, "y": 0, "width": metri, "height": metri },
      "openings": []
    }
  ]
}
Leggi le misure scritte sulla piantina (es. "3.62", "mq. 47.09").
Rispondi SOLO con JSON valido, nessun altro testo.`;

  const response = await chatCompletionWithImage(systemPrompt, imageDataUrl, options);

  const parsed = extractJson<any>(response.content);

  return {
    data: parsed,
    raw: response.content,
    confidence: 0.9,
    warnings: [],
    provider: response.provider,
  };
}