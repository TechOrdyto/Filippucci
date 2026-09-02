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
      const hasVerifiedRegion = (product.imageRegions ?? []).some((r) => r.verified);
      if (!hasVerifiedRegion) {
        warnings.push(`Prodotto "${product.name}": nessuna regione immagine verificata`);
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