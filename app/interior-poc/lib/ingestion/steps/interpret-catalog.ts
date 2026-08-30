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
  const blocks = page.textBlocks;

  // 1. Trova il nome prodotto (header in maiuscolo seguito da —)
  const nameBlock = blocks.find((b) => PRODUCT_NAME_PATTERN.test(b.text));
  if (!nameBlock) return null;

  const nameMatch = nameBlock.text.match(PRODUCT_NAME_PATTERN);
  const name = nameMatch ? nameMatch[1].trim() : nameBlock.text.trim();

  // 2. Trova il designer (riga sotto il nome)
  const nameIndex = blocks.indexOf(nameBlock);
  const designerBlock = blocks[nameIndex + 1];
  const designer = designerBlock && DESIGNER_PATTERN.test(designerBlock.text)
    ? designerBlock.text.trim()
    : undefined;

  // 3. Trova la categoria
  const categoryBlock = blocks.find((b) => CATEGORY_PATTERN.test(b.text));
  const category = categoryBlock
    ? categoryBlock.text.match(CATEGORY_PATTERN)?.[1]
    : undefined;

  // 4. Trova le dimensioni
  const dimBlock = blocks.find((b) => DIMENSIONS_PATTERN.test(b.text));
  const dimensions = dimBlock ? extractDimensions(dimBlock.text) : undefined;

  // 5. Trova i materiali
  const materials = [...new Set(
    blocks
      .flatMap((b) => b.text.match(MATERIAL_PATTERN) ?? [])
      .map((m) => m.toLowerCase())
  )];

  // 6. Identifica la regione immagine (ritaglio deterministico)
  const imageRegion = findProductImageRegion(blocks, page.imageSize, name);

  return {
    id: `MOL-${(category ?? "PROD").slice(0, 3).toUpperCase()}-${page.pageNumber}`,
    name,
    designer,
    category,
    subcategory: category,
    dimensions,
    materials: materials.length > 0 ? materials : undefined,
    pageNumber: page.pageNumber,
    imageRegion: {
      bbox: imageRegion.region,
      verified: imageRegion.verified,
    },
  };
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