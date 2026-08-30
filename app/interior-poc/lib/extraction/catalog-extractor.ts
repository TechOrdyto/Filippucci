// Estrazione catalogo rule-based (senza AI)
// Analizza il testo estratto dai PDF dei cataloghi Molteni&C

import type { Product } from "../types";

export interface CatalogExtractionResult {
  products: Product[];
  warnings: string[];
  source: "rule-based" | "ai";
}

// Pattern per riconoscere i prodotti nei testi dei cataloghi
const PRODUCT_PATTERNS = {
  // "EMILE — SEATING SYSTEM—" oppure "AUGUSTO — SOFA—"
  productHeader: /^([A-Z][A-Z0-9.\s'’-]+)\s*—\s*([A-Z\s]+)—/gm,

  // "CHRISTOPHE DELCOURT" (designer)
  designer: /^([A-Z][A-Za-z\s.]+)$/m,

  // Dimensioni "L 800 P 840 H 680" o "L 220 P 90 H 85"
  dimensions: /L\s*(\d+)\s*P\s*(\d+)\s*H\s*(\d+)/i,

  // Superficie "mq. 47.09"
  area: /mq\.?\s*([\d.,]+)/i,

  // Materiali comuni
  materials: /(tessuto|pelle|legno|frassino|rovere|acciaio|alluminio|vetro|marmo|ottone|cuoio|metallo|laccato|eucalipto|noce)/gi,
};

const CATEGORY_MAP: Record<string, Product["category"]> = {
  "SEATING SYSTEM": "Sofas",
  SOFA: "Sofas",
  SOFAS: "Sofas",
  ARMCHAIR: "Sofas",
  ARMCHAIRS: "Sofas",
  POUF: "Sofas",
  TABLE: "Tables",
  TABLES: "Tables",
  CHAIR: "Chairs",
  CHAIRS: "Chairs",
  "COFFEE TABLE": "Tables",
  "COFFEE TABLES": "Tables",
  SIDEBOARD: "Living Systems",
  "WALL UNIT": "Living Systems",
  BOOKCASE: "Living Systems",
  BOOKCASES: "Living Systems",
  WARDROBE: "Living Systems",
  CARPET: "Carpets",
  CARPETS: "Carpets",
};

/**
 * Estrae prodotti dal testo di un catalogo usando regole
 */
export function extractCatalogProducts(text: string): CatalogExtractionResult {
  const warnings: string[] = [];
  const products: Product[] = [];

  // Trova tutti gli header prodotto
  const headers = [...text.matchAll(PRODUCT_PATTERNS.productHeader)];

  for (const match of headers) {
    const name = match[1].trim();
    const subcategory = match[2].trim();

    // Salta header non prodotto (es. "CONTENT", "OVERVIEW")
    if (["CONTENT", "OVERVIEW", "MOLTENI"].includes(name.toUpperCase())) continue;

    const category = CATEGORY_MAP[subcategory.toUpperCase()] ?? "Sofas";

    // Cerca designer (riga successiva)
    const afterMatch = text.slice(match.index! + match[0].length, match.index! + match[0].length + 500);
    const designerMatch = afterMatch.match(/^([A-Z][A-Za-z\s.]+)$/m);
    const designer = designerMatch?.[1]?.trim() ?? "Molteni&C";

    // Cerca dimensioni nel contesto
    const dimMatch = afterMatch.match(PRODUCT_PATTERNS.dimensions);
    const dimensions = dimMatch
      ? {
          width: parseInt(dimMatch[1]),
          depth: parseInt(dimMatch[2]),
          height: parseInt(dimMatch[3]),
        }
      : estimateDimensions(category);

    // Cerca materiali
    const materials = [...new Set(
      (afterMatch.match(PRODUCT_PATTERNS.materials) ?? []).map((m) => m.toLowerCase())
    )];

    const id = `MOL-${category.slice(0, 3).toUpperCase()}-${String(products.length + 1).padStart(3, "0")}`;

    products.push({
      id,
      sku: `${name.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${category.slice(0, 3).toUpperCase()}`,
      name,
      nameForAI: `${name} ${subcategory.toLowerCase()}`,
      collection: name,
      category,
      subcategory,
      designer,
      description: `Prodotto ${name} della collezione Molteni&C, categoria ${subcategory.toLowerCase()}.`,
      descriptionForAI: `${name} ${subcategory.toLowerCase()} by ${designer} from Molteni&C collection.`,
      dimensions,
      seatHeight: category === "Sofas" || category === "Chairs" ? 42 : undefined,
      materials: materials.length > 0 ? materials : ["legno"],
      finishes: [],
      images: [],
      catalogRef: "",
      price: null,
    });
  }

  if (products.length === 0) {
    warnings.push("Nessun prodotto riconosciuto con regole. Prova con interpretazione AI.");
  }

  return { products, warnings, source: "rule-based" };
}

/**
 * Stima dimensioni in base alla categoria (fallback)
 */
function estimateDimensions(category: Product["category"]): { width: number; depth: number; height: number } {
  switch (category) {
    case "Sofas":
      return { width: 220, depth: 100, height: 80 };
    case "Tables":
      return { width: 200, depth: 100, height: 74 };
    case "Chairs":
      return { width: 50, depth: 55, height: 80 };
    case "Living Systems":
      return { width: 200, depth: 50, height: 200 };
    case "Carpets":
      return { width: 200, depth: 300, height: 1 };
    default:
      return { width: 100, depth: 100, height: 100 };
  }
}