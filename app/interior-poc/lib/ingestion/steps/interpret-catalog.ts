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

    // Raccogli i prodotti da tutte le pagine, poi raggruppa per nome
    // (le pagine 13-18 di Blevio sono lo stesso articolo con più foto)
    const rawProducts: CatalogInterpretation["products"] = [];
    for (const page of ocrResults) {
      const product = interpretPage(page);
      if (product) {
        rawProducts.push(product);
      }
    }

    // Raggruppa per nome (case-insensitive, con similarità):
    // unisci le imageRegions. "BLENIO" e "BLEVIO" sono lo stesso articolo
    // (PaddleOCR può leggere male una lettera), quindi usa la distanza di
    // Levenshtein per raggruppare nomi simili.
    const byName = new Map<string, CatalogInterpretation["products"][number]>();
    for (const product of rawProducts) {
      const key = product.name.toLowerCase();
      // Cerca un gruppo esistente con nome simile
      let existing: CatalogInterpretation["products"][number] | undefined;
      for (const [k, v] of byName) {
        if (levenshtein(k, key) <= Math.max(1, key.length * 0.2)) {
          existing = v;
          break;
        }
      }
      if (!existing) {
        byName.set(key, product);
      } else {
        // Unisci: mantieni i dati più completi e accumula le imageRegions
        existing.imageRegions = [
          ...(existing.imageRegions ?? []),
          ...(product.imageRegions ?? []),
        ];
        if (!existing.designer && product.designer) existing.designer = product.designer;
        if (!existing.dimensions && product.dimensions) existing.dimensions = product.dimensions;
        if ((!existing.materials || existing.materials.length === 0) && product.materials?.length) {
          existing.materials = product.materials;
        }
      }
    }
    products.push(...byName.values());

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
  let product: any = null;
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      product = parsed.product;
    } catch {
      product = null;
    }
  }

  // PaddleOCR è la fonte PRIMARIA per nome e designer:
  // legge "BLEVIO" e "IGNAZIO GARDELLA" in tutte le pagine con alta confidenza,
  // mentre l'AI vision spesso restituisce null o nomi errati nelle pagine di varianti.
  const ocrTexts = page.textBlocks.map((t) => t.text.trim()).filter(Boolean);
  const ocrName = findProductNameFromOcr(ocrTexts);
  const ocrDesigner = findDesignerFromOcr(ocrTexts, ocrName);

  // Se PaddleOCR non trova un nome, usa quello dell'AI vision (se presente)
  const aiName = product?.name;
  const aiDesigner = product?.designer;
  const name = ocrName ?? aiName;
  if (!name) return null;

  const correctedName = name;
  const correctedDesigner = ocrDesigner ?? aiDesigner;

    // Raccogli TUTTE le regioni immagine della pagina.
    // L'AI vision può fornire più image_bbox (una per foto del prodotto).
    const imageRegions: NonNullable<CatalogInterpretation["products"][number]["imageRegions"]> = [];

    // 1. Regioni fornite dall'AI vision (può essere un singolo bbox o un array)
    const aiBboxes = Array.isArray(product?.image_bbox)
      ? product.image_bbox
      : product?.image_bbox
        ? [product.image_bbox]
        : [];
    for (const bbox of aiBboxes) {
      if (bbox && bbox.x !== undefined && bbox.y !== undefined) {
        imageRegions.push({
          bbox: {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width ?? 90,
            height: bbox.height ?? 50,
          },
          verified: true,
          pageNumber: page.pageNumber,
        });
      }
    }

    // 2. Fallback deterministico: se l'AI non ha fornito bbox validi,
    //    trova la regione immagine (senza testo) usando i bounding box OCR.
    if (imageRegions.length === 0) {
      const crop = findProductImageRegion(page.textBlocks, page.imageSize, product?.name);
      if (crop.verified) {
        imageRegions.push({
          bbox: crop.region,
          verified: true,
          pageNumber: page.pageNumber,
        });
      }
    }

    return {
      id: `MOL-${(product?.category ?? "PROD").slice(0, 3).toUpperCase()}-${page.pageNumber}`,
      name: correctedName,
      designer: correctedDesigner,
      category: product?.category,
      subcategory: product?.category,
      description: product?.description,
      dimensions: product?.dimensions,
      materials: product?.materials,
      finishes: product?.finishes,
      pageNumber: page.pageNumber,
      imageRegions,
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


/**
 * Trova il nome prodotto dai textBlocks PaddleOCR.
 * Il nome è tipicamente il primo blocco in MAIUSCOLO (es. "BLEVIO").
 */
function findProductNameFromOcr(ocrTexts: string[]): string | null {
  // Cerca il primo blocco in maiuscolo con 3+ caratteri, senza spazi
  // (i nomi prodotto Molteni sono singole parole in maiuscolo)
  for (const t of ocrTexts) {
    const clean = t.trim();
    if (
      clean === clean.toUpperCase() &&
      clean.length >= 3 &&
      !clean.includes(" ") &&
      !/^[0-9]+$/.test(clean) &&
      !/^[A-Z]\s*[<>]+$/.test(clean) // esclude "A E <>" (rumore)
    ) {
      return clean;
    }
  }
  return null;
}

/**
 * Trova il designer dai textBlocks PaddleOCR.
 * Il designer è il blocco in MAIUSCOLO subito dopo il nome prodotto
 * (es. dopo "BLEVIO" viene "IGNAZIO GARDELLA").
 */
function findDesignerFromOcr(ocrTexts: string[], productName: string | null): string | null {
  if (!productName) return null;
  const nameIdx = ocrTexts.findIndex((t) => t.trim() === productName);
  if (nameIdx < 0) return null;

  // Cerca il prossimo blocco in maiuscolo dopo il nome
  for (let i = nameIdx + 1; i < ocrTexts.length; i++) {
    const t = ocrTexts[i].trim();
    if (
      t === t.toUpperCase() &&
      t.length >= 3 &&
      !/^[0-9]+$/.test(t) &&
      !/^[A-Z]\s*[<>]+$/.test(t)
    ) {
      return t;
    }
  }
  return null;
}
