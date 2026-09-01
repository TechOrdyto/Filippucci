// Builder della saga: assembla gli step per l'ingestione.
// NOTA: la piantina NON viene più importata qui — la sua sorgente è SOLO
// il DXF (importato via scripts/import-dxf.mjs). Questa pipeline gestisce
// esclusivamente i cataloghi (PDF).

import { IngestionSaga } from "./saga";
import { saveDocumentStep } from "./steps/save-document";
import { normalizeStep } from "./steps/normalize";
import { runOcrStep } from "./steps/run-ocr";
import { interpretCatalogStep } from "./steps/interpret-catalog";
import { cropProductImagesStep } from "./steps/crop-product-images";
import { validateCatalogStep } from "./steps/validate-catalog";
import { persistCatalogStep } from "./steps/persist-catalog";

export function buildSaga(): IngestionSaga {
  const saga = new IngestionSaga();

  // Step comuni
  saga.addStep(saveDocumentStep);
  saga.addStep(normalizeStep);
  saga.addStep(runOcrStep);

  // Step catalogo
  saga.addStep(interpretCatalogStep);
  saga.addStep(cropProductImagesStep);
  saga.addStep(validateCatalogStep);
  saga.addStep(persistCatalogStep);

  return saga;
}
