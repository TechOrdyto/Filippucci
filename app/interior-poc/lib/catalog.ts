import type { Product, ProductMention } from "./types";
import catalogData from "../data/catalog.json";

export const catalog: Product[] = catalogData.products as Product[];

export function findProductById(id: string): Product | undefined {
  return catalog.find((p) => p.id === id);
}

export function findProductsByQuery(query: string): Product[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return catalog.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.collection.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.designer.toLowerCase().includes(q) ||
      p.subcategory.toLowerCase().includes(q)
  );
}

export function findProductByName(name: string): Product | undefined {
  const n = name.toLowerCase().trim();
  return catalog.find(
    (p) =>
      p.name.toLowerCase() === n ||
      p.collection.toLowerCase() === n ||
      p.name.toLowerCase().includes(n) ||
      p.collection.toLowerCase().includes(n)
  );
}

// Parsing @mentions nel prompt utente
// Formato: "@Nome Prodotto" — il nome può contenere spazi
// Il testo dopo il nome prodotto è testo libero (es. "@Augusto di fianco alla finestra")
export function parseMentions(rawPrompt: string): ProductMention[] {
  const mentions: ProductMention[] = [];
  const regex = /@([^@\n]+)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawPrompt)) !== null) {
    const afterAt = match[1].trim();

    // Cerca il prodotto il cui nome è un PREFISSO del testo dopo @
    // (il nome più lungo che corrisponde all'inizio)
    const product = findProductByPrefix(afterAt);

    if (product) {
      mentions.push({
        type: "explicit",
        productId: product.id,
        displayName: product.name,
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 1.0,
      });
    }
  }

  return mentions;
}

/**
 * Trova il prodotto il cui nome è un prefisso del testo
 * Es: "Augusto di fianco alla finestra" → "Augusto" (match)
 * Es: "Emile e tavolo" → "Emile" (match)
 */
function findProductByPrefix(text: string): Product | undefined {
  const lower = text.toLowerCase();
  let bestMatch: Product | undefined;

  for (const product of catalog) {
    const nameLower = product.name.toLowerCase();
    const collectionLower = product.collection.toLowerCase();

    // Il nome prodotto deve essere un prefisso del testo
    // (seguito da spazio, virgola, punto o fine testo)
    if (
      lower === nameLower ||
      lower.startsWith(nameLower + " ") ||
      lower.startsWith(nameLower + ",") ||
      lower.startsWith(nameLower + ".") ||
      lower.startsWith(nameLower + " e ") ||
      lower.startsWith(nameLower + " di ") ||
      lower.startsWith(nameLower + " con ")
    ) {
      // Preferisci il match più lungo (nome completo vs collezione)
      if (!bestMatch || product.name.length > bestMatch.name.length) {
        bestMatch = product;
      }
    }
  }

  return bestMatch;
}

export function getCategories(): string[] {
  return [...new Set(catalog.map((p) => p.category))];
}

export function getProductsByCategory(category: string): Product[] {
  return catalog.filter((p) => p.category === category);
}