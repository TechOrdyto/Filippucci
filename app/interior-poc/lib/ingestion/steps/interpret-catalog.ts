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
      name: product.name,
      designer: product.designer,
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