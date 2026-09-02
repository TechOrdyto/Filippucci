// Step 6b: Persiste il catalogo validato
// Salva il catalogo in data/ingestion/catalogs/ e aggiorna il catalogo attivo
// Deduplica i prodotti con lo stesso nome (mantiene il più completo)

import type { SagaContext, CatalogInterpretation } from "../types";
import { createStep } from "../saga";
import { saveCatalog, deleteFile } from "../store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const persistCatalogStep = createStep(
  "persist-catalog",
  async (ctx: SagaContext) => {
    const interpretation = ctx.interpretation as CatalogInterpretation;
    if (!interpretation) {
      throw new Error("Nessuna interpretazione catalogo disponibile");
    }

    // Deduplica per nome: mantieni il prodotto più completo
    const deduped = deduplicateProducts(interpretation.products);

    // Costruisci il catalogo finale
    const catalog = {
      id: `catalog-${ctx.documentId}`,
      name: "Catalogo importato",
      version: "1.0",
      products: deduped.map((p) => ({
        id: p.id,
        name: p.name,
        designer: p.designer,
        category: p.category,
        subcategory: p.subcategory,
        dimensions: p.dimensions,
        materials: p.materials,
        finishes: p.finishes,
        images: p.imageRegion ? [`/products/${p.id}.png`] : [],
        catalogRef: `pagina ${p.pageNumber}`,
      })),
    };

    // Salva nello store
    const storedPath = saveCatalog(ctx.documentId, catalog);

    // Aggiorna il catalogo attivo (merge con l'esistente)
    const activePath = resolve(process.cwd(), "app/interior-poc/data/catalog.json");
    try {
      const fs = require("node:fs");
      const existing = JSON.parse(fs.readFileSync(activePath, "utf-8"));

      // Merge intelligente: aggiorna i prodotti esistenti con dati migliori,
      // aggiunge i nuovi prodotti
      const existingByName = new Map<string, any>(
        existing.products.map((p: any) => [p.name.toLowerCase(), p])
      );

      for (const newProduct of catalog.products) {
        const key = newProduct.name.toLowerCase();
        const existingProduct = existingByName.get(key);

        if (!existingProduct) {
          // Nuovo prodotto: aggiungi
          existing.products.push(newProduct);
          existingByName.set(key, newProduct);
        } else {
          // Prodotto esistente: aggiorna i campi mancanti con dati migliori
          if (!existingProduct.designer && newProduct.designer) {
            existingProduct.designer = newProduct.designer;
          }
          if (!existingProduct.dimensions && newProduct.dimensions) {
            existingProduct.dimensions = newProduct.dimensions;
          }
          if ((!existingProduct.materials || existingProduct.materials.length === 0) && newProduct.materials?.length) {
            existingProduct.materials = newProduct.materials;
          }
          if ((!existingProduct.finishes || existingProduct.finishes.length === 0) && newProduct.finishes?.length) {
            existingProduct.finishes = newProduct.finishes;
          }
          // Aggiungi l'immagine se il prodotto esistente non ne ha
          if ((!existingProduct.images || existingProduct.images.length === 0) && newProduct.images?.length) {
            existingProduct.images = newProduct.images;
          }
        }
      }

      fs.writeFileSync(activePath, JSON.stringify(existing, null, 2));
    } catch {
      // Se il catalogo attivo non esiste, crealo
      writeFileSync(activePath, JSON.stringify(catalog, null, 2));
    }

    return { storedPath, activePath };
  },
  async (ctx: SagaContext, result: { storedPath: string }) => {
    deleteFile(result.storedPath);
  },
  (ctx) => `${ctx.documentId}:persist-catalog`
);

/**
 * Deduplica i prodotti per nome, mantenendo il più completo
 */
function deduplicateProducts(products: CatalogInterpretation["products"]) {
  const byName = new Map<string, CatalogInterpretation["products"][number]>();

  for (const product of products) {
    const key = product.name.toLowerCase();
    const existing = byName.get(key);

    if (!existing) {
      byName.set(key, product);
      continue;
    }

    // Mantieni il prodotto con più dati (dimensioni, designer, immagine)
    const existingScore = completenessScore(existing);
    const newScore = completenessScore(product);
    if (newScore > existingScore) {
      byName.set(key, product);
    }
  }

  return [...byName.values()];
}

function completenessScore(p: CatalogInterpretation["products"][number]): number {
  let score = 0;
  if (p.designer) score += 1;
  if (p.dimensions) score += 2;
  if (p.materials && p.materials.length > 0) score += 1;
  if (p.finishes && p.finishes.length > 0) score += 1;
  if (p.imageRegion?.verified) score += 2;
  if (p.description) score += 1;
  return score;
}
