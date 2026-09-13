// Step 5b: Valida il catalogo interpretato
// Verifica: prodotti con nome, immagini ritagliate senza testo

import type { SagaContext, CatalogInterpretation, ValidationResult } from "../types";
import { createStep } from "../saga";

export const validateCatalogStep = createStep(
  "validate-catalog",
  async (ctx: SagaContext) => {
    const interpretation = ctx.interpretation as CatalogInterpretation;
    if (!interpretation) {
      throw new Error("Nessuna interpretazione catalogo disponibile");
    }

    const errors: string[] = [];
    const warnings: string[] = [...interpretation.warnings];

    // 1. Verifica che ci siano prodotti
    if (interpretation.products.length === 0) {
      errors.push("Nessun prodotto estratto");
    }

    // 2. Verifica che ogni prodotto abbia nome e immagine
    for (const product of interpretation.products) {
      if (!product.name) {
        errors.push(`Prodotto senza nome (pagina ${product.pageNumber})`);
      }
      const verifiedRegions = (product.imageRegions ?? []).filter((r) => r.verified);
      if (verifiedRegions.length === 0) {
        warnings.push(`Prodotto "${product.name}": nessuna regione immagine verificata`);
      } else if (ctx.persistedPaths) {
        const persistedForProduct = ctx.persistedPaths.filter((path) =>
          path.includes(`${product.id}-`) || path.endsWith(`${product.id}.png`)
        );
        if (persistedForProduct.length < verifiedRegions.length) {
          errors.push(
            `Prodotto "${product.name}": immagini verificate non persistite (${persistedForProduct.length}/${verifiedRegions.length})`
          );
        }
      }
    }

    const result: ValidationResult = { valid: errors.length === 0, errors, warnings };
    ctx.validation = result;

    if (!result.valid) {
      throw new Error(`Validazione catalogo fallita: ${errors.join("; ")}`);
    }

    return result;
  },
  async () => {},
  (ctx) => `${ctx.documentId}:validate-catalog`
);
