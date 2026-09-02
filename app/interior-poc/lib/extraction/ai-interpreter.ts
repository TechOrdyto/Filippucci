// Interpretazione AI del contenuto estratto (cataloghi)
// Usa il client AI unificato (opencode con fallback OpenAI)

import {
  chatCompletion,
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
