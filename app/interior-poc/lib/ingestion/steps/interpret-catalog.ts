// Step 4b: Interpreta il catalogo dalle pagine OCR
// Estrae i prodotti strutturati e identifica le regioni immagine

import type { SagaContext, CatalogInterpretation, OcrPageResult } from "../types";
import { createStep } from "../saga";
import { saveInterpretation, deleteFile } from "../store";
import { findProductImageRegion } from "../../geometry/image-cropper";

// Pattern per riconoscere elementi del catalogo
const PRODUCT_NAME_PATTERN = /^([A-Z][A-Z0-9.\s'’-]{2,40})\s*—/;
const DESIGNER_PATTERN = /^([A-Z][A-Za-z\s.]+)$/;
const CATEGORY_PATTERN = /(SEATING SYSTEM|SOFA|SOFAS|ARMCHAIR|ARMCHAIRS|TABLE|TABLES|CHAIR|CHAIRS|COFFEE TABLE|COFFEE TABLES|SIDEBOARD|WALL UNIT|BOOKCASE|BOOKCASES|WARDROBE|CARPET|CARPETS)/i;
const DIMENSIONS_PATTERN = /L\s*(\d+)\s*P\s*(\d+)\s*H\s*(\d+)/i;
const MATERIAL_PATTERN = /(tessuto|pelle|legno|frassino|rovere|acciaio|alluminio|vetro|marmo|ottone|cuoio|metallo|laccato|eucalipto|noce)/gi;

export const interpretCatalogStep = createStep(
  "interpret-catalog",
  async (ctx: SagaContext) => {
    const ocrResults = ctx.ocrResults ?? [];
    if (ocrResults.length === 0) {
      throw new Error("Nessun risultato OCR disponibile");
    }

    const products: CatalogInterpretation["products"] = [];
    const warnings: string[] = [];

    for (const page of ocrResults) {
      const product = interpretPage(page);
      if (product) {
        products.push(product);
      }
    }

    if (products.length === 0) {
      warnings.push("Nessun prodotto riconosciuto nelle pagine");
    }

    const interpretation: CatalogInterpretation = { products, warnings };
    ctx.interpretation = interpretation;

    const path = saveInterpretation(ctx.documentId, interpretation);
    return { path, products: products.length };
  },
  async (ctx: SagaContext, result: { path: string }) => {
    deleteFile(result.path);
  },
  (ctx) => `${ctx.documentId}:interpret-catalog`
);

function interpretPage(page: OcrPageResult): CatalogInterpretation["products"][number] | null {
  // L'AI vision restituisce JSON strutturato nel fullText
  const content = page.fullText;

  // Estrai il JSON dalla risposta
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const product = parsed.product;
    if (!product || !product.name) return null;

    // Cross-check con PaddleOCR: i textBlocks reali sono più affidabili
    // dell'AI vision per nomi e designer (es. "BLEVIO" vs "Blenko").
    // Il nome prodotto e il designer sono spesso i blocchi più grandi in alto.
    const ocrTexts = page.textBlocks.map((t) => t.text.trim()).filter(Boolean);
    const correctedName = correctNameWithOcr(product.name, ocrTexts);
    const correctedDesigner = correctDesignerWithOcr(product.designer, ocrTexts, correctedName);

    // Usa il bbox immagine fornito dall'AI vision (se presente)
    const bbox = product.image_bbox;
    let imageRegion = bbox && bbox.x !== undefined && bbox.y !== undefined
      ? {
          bbox: {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width ?? 90,
            height: bbox.height ?? 50,
          },
          verified: true,
        }
      : undefined;

    // Fallback deterministico: se l'AI non ha fornito un bbox valido,
    // trova la regione immagine (senza testo) usando i bounding box OCR.
    // Questo garantisce che l'immagine prodotto venga comunque ritagliata.
    if (!imageRegion) {
      const crop = findProductImageRegion(page.textBlocks, page.imageSize, product.name);
      if (crop.verified) {
        imageRegion = {
          bbox: crop.region,
          verified: true,
        };
      }
    }

    return {
      id: `MOL-${(product.category ?? "PROD").slice(0, 3).toUpperCase()}-${page.pageNumber}`,
      name: correctedName,
      designer: correctedDesigner,
      category: product.category,
      subcategory: product.category,
      description: product.description,
      dimensions: product.dimensions,
      materials: product.materials,
      finishes: product.finishes,
      pageNumber: page.pageNumber,
      imageRegion,
    };
  } catch {
    return null;
  }
}

function extractDimensions(text: string): { width: number; depth: number; height: number } {
  const match = text.match(DIMENSIONS_PATTERN);
  if (!match) return { width: 0, depth: 0, height: 0 };
  return {
    width: parseInt(match[1]),
    depth: parseInt(match[2]),
    height: parseInt(match[3]),
  };
}


/**
 * Corregge il nome prodotto usando i textBlocks PaddleOCR.
 * L'AI vision può leggere male il nome (es. "Blenko" invece di "BLEVIO").
 * Cerca il blocco di testo in maiuscolo che meglio corrisponde al nome AI.
 */
function correctNameWithOcr(aiName: string, ocrTexts: string[]): string {
  if (!aiName) return aiName;
  const aiLower = aiName.toLowerCase();

  // 1. Cerca un blocco che contiene il nome AI (case-insensitive)
  const exact = ocrTexts.find((t) => t.toLowerCase() === aiLower);
  if (exact) return exact;

  // 2. Cerca un blocco in MAIUSCOLO che è un prefisso del nome AI
  //    (es. AI="Blenko", OCR="BLEVIO" — cerca la parola più simile)
  const upperBlocks = ocrTexts.filter((t) => t === t.toUpperCase() && t.length >= 3);
  if (upperBlocks.length > 0) {
    // Prendi il blocco maiuscolo più simile al nome AI (distanza di Levenshtein)
    let best = upperBlocks[0];
    let bestDist = Infinity;
    for (const block of upperBlocks) {
      const dist = levenshtein(block.toLowerCase(), aiLower);
      if (dist < bestDist) {
        bestDist = dist;
        best = block;
      }
    }
    // Accetta solo se la distanza è ragionevole (nome simile)
    if (bestDist <= Math.max(2, aiName.length * 0.4)) {
      return best;
    }
  }

  return aiName;
}

/**
 * Corregge il designer usando i textBlocks PaddleOCR.
 * Il designer è tipicamente il blocco in MAIUSCOLO subito dopo il nome prodotto
 * (es. "BLEVIO" → "IGNAZIO GARDELLA"). L'AI vision spesso lo legge male.
 */
function correctDesignerWithOcr(
  aiDesigner: string,
  ocrTexts: string[],
  productName?: string
): string {
  if (!aiDesigner) return aiDesigner;
  const aiLower = aiDesigner.toLowerCase();

  // 1. Cerca un blocco che contiene il cognome del designer (ultima parola AI)
  const words = aiDesigner.split(/\s+/);
  const lastName = words[words.length - 1]?.toLowerCase();
  if (lastName) {
    const match = ocrTexts.find((t) => t.toLowerCase().includes(lastName));
    if (match) return match;
  }

  // 2. Il designer è il blocco in MAIUSCOLO subito dopo il nome prodotto
  //    (es. dopo "BLEVIO" viene "IGNAZIO GARDELLA")
  if (productName) {
    const nameIdx = ocrTexts.findIndex(
      (t) => t.toLowerCase() === productName.toLowerCase()
    );
    if (nameIdx >= 0) {
      // Cerca il prossimo blocco in maiuscolo dopo il nome
      for (let i = nameIdx + 1; i < ocrTexts.length; i++) {
        const t = ocrTexts[i];
        if (t === t.toUpperCase() && t.length >= 3 && !t.includes(" ")) {
          return t;
        }
        // Il designer può avere spazi (es. "IGNAZIO GARDELLA")
        if (t === t.toUpperCase() && t.length >= 3) {
          return t;
        }
      }
    }
  }

  return aiDesigner;
}

/**
 * Distanza di Levenshtein (per confrontare nomi simili)
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}
