// Builder della saga: assembla gli step in base al tipo di documento

import { IngestionSaga } from "./saga";
import { saveDocumentStep } from "./steps/save-document";
import { normalizeStep } from "./steps/normalize";
import { runOcrStep } from "./steps/run-ocr";
import { interpretFloorplanStep } from "./steps/interpret-floorplan";
import { interpretCatalogStep } from "./steps/interpret-catalog";
import { cropProductImagesStep } from "./steps/crop-product-images";
import { validateFloorplanStep } from "./steps/validate-floorplan";
import { validateCatalogStep } from "./steps/validate-catalog";
import { persistFloorplanStep } from "./steps/persist-floorplan";
import { persistCatalogStep } from "./steps/persist-catalog";
import type { DocumentType } from "./types";

export function buildSaga(type: DocumentType): IngestionSaga {
  const saga = new IngestionSaga();

  // Step comuni
  saga.addStep(saveDocumentStep);
  saga.addStep(normalizeStep);
  saga.addStep(runOcrStep);

  // Step tipo-specifici
  if (type === "floorplan") {
    saga.addStep(interpretFloorplanStep);
    saga.addStep(validateFloorplanStep);
    saga.addStep(persistFloorplanStep);
  } else if (type === "catalog") {
    saga.addStep(interpretCatalogStep);
    saga.addStep(cropProductImagesStep);
    saga.addStep(validateCatalogStep);
    saga.addStep(persistCatalogStep);
  }

  return saga;
}