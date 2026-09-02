// Modulo dati per l'articolo DEVON (Molteni&C)
// Carica la base dati completa: varianti, misure, prezzi, rivestimenti
// Sorgente: listino prezzi 2026 (pagine 416-418) + catalogo Dining (pagine 104-106)

import devonData from "../data/devon.json";

export interface DevonVariant {
  code: string;
  type: string;
  dimensions: { width: number; depth: number; height: number };
  weightKg: number;
  volumeMc: number;
  colli: number;
  prices: {
    tessuto?: Record<string, number>;
    pelle?: Record<string, number>;
    tessutoMt?: Record<string, number>;
  };
}

export interface DevonData {
  id: string;
  name: string;
  designer: string;
  year: number;
  category: string;
  collection: string;
  description: string;
  materials: Record<string, string>;
  finishes: { base: string[]; upholstery: string[] };
  variants: DevonVariant[];
  upholsteryPrices: Record<string, Record<string, number>>;
  notes: string[];
  source: {
    catalog: string;
    pages: number[];
    priceList: string;
    priceListPages: number[];
  };
}

export const devon: DevonData = devonData as DevonData;

/**
 * Trova una variante DEVON per codice (es. "DSD1")
 */
export function findDevonVariant(code: string): DevonVariant | undefined {
  return devon.variants.find((v) => v.code.toLowerCase() === code.toLowerCase());
}

/**
 * Restituisce il prezzo di una variante per categoria e codice finitura
 * Es. getDevonPrice("DSD1", "tessuto", "B") → 1248
 */
export function getDevonPrice(
  code: string,
  category: "tessuto" | "pelle" | "tessutoMt",
  finishCode: string
): number | null {
  const variant = findDevonVariant(code);
  if (!variant) return null;
  const prices = variant.prices[category];
  if (!prices) return null;
  return prices[finishCode] ?? null;
}

/**
 * Restituisce il prezzo del rivestimento per codice RIV
 * Es. getUpholsteryPrice("RIV/DSD1", "B") → 417
 */
export function getUpholsteryPrice(rivCode: string, finishCode: string): number | null {
  const prices = devon.upholsteryPrices[rivCode];
  if (!prices) return null;
  return prices[finishCode] ?? null;
}

/**
 * Restituisce il range di prezzo di una variante (min-max)
 */
export function getDevonPriceRange(code: string): { min: number; max: number } | null {
  const variant = findDevonVariant(code);
  if (!variant) return null;
  const allPrices = [
    ...Object.values(variant.prices.tessuto ?? {}),
    ...Object.values(variant.prices.pelle ?? {}),
    ...Object.values(variant.prices.tessutoMt ?? {}),
  ];
  if (allPrices.length === 0) return null;
  return { min: Math.min(...allPrices), max: Math.max(...allPrices) };
}
