// Step 6b: Persiste il catalogo validato
// Salva il catalogo in data/ingestion/catalogs/ e aggiorna il catalogo attivo

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

    // Costruisci il catalogo finale
    const catalog = {
      id: `catalog-${ctx.documentId}`,
      name: "Catalogo importato",
      version: "1.0",
      products: interpretation.products.map((p) => ({
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
      // Merge: aggiungi i nuovi prodotti senza duplicare
      const existingIds = new Set(existing.products.map((p: any) => p.id));
      const newProducts = catalog.products.filter((p) => !existingIds.has(p.id));
      existing.products.push(...newProducts);
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