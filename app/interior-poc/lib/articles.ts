// Modulo dati per gli articoli del catalogo
// Carica i file dati completi (immagini, info, listini prezzi) per ogni articolo
// La struttura è DINAMICA: ogni articolo ha un file JSON in data/articles/

import arcData from "../data/articles/arc.json";
import gloveData from "../data/articles/glove.json";
import portaVoltaData from "../data/articles/porta-volta.json";
import emileData from "../data/articles/emile.json";
import augustoData from "../data/articles/augusto.json";
import devonData from "../data/devon.json";

export interface ArticleVariant {
  code: string;
  type: string;
  dimensions: { width?: number; depth?: number; height?: number; diameter?: number };
  weightKg?: number;
  volumeMc?: number;
  colli?: number;
  // Prezzi: può essere {categoria: {colore: prezzo}} (es. tessuto: {B: 1248})
  // oppure {materiale: prezzo} (es. vetro: 3944)
  prices?: Record<string, Record<string, number> | number>;
}

export interface ArticleData {
  id: string;
  name: string;
  designer: string;
  year: number;
  category: string;
  collection: string;
  description: string;
  materials: Record<string, string>;
  finishes: Record<string, string[]>;
  variants: ArticleVariant[];
  upholsteryPrices?: Record<string, Record<string, number>>;
  notes?: string[];
  images: string[];
  source: {
    catalog: string;
    pages: number[];
    priceList: string | null;
    priceListPages: number[];
  };
}

// Mappa nome → dati articolo (case-insensitive)
const articlesMap: Record<string, ArticleData> = {
  "arc": arcData as ArticleData,
  "glove": gloveData as ArticleData,
  "porta volta": portaVoltaData as ArticleData,
  "emile": emileData as ArticleData,
  "augusto": augustoData as ArticleData,
  "devon": devonData as unknown as ArticleData,
};

/**
 * Trova i dati completi di un articolo per nome (case-insensitive)
 */
export function findArticleData(name: string): ArticleData | null {
  const key = name.toLowerCase().trim();
  return articlesMap[key] ?? null;
}

/**
 * Restituisce il range di prezzo di una variante (min-max)
 */
export function getVariantPriceRange(variant: ArticleVariant): { min: number; max: number } | null {
  if (!variant.prices) return null;
  const allPrices: number[] = [];
  for (const category of Object.values(variant.prices)) {
    if (typeof category === "number") {
      allPrices.push(category);
    } else {
      for (const price of Object.values(category)) {
        if (typeof price === "number") allPrices.push(price);
      }
    }
  }
  if (allPrices.length === 0) return null;
  return { min: Math.min(...allPrices), max: Math.max(...allPrices) };
}
