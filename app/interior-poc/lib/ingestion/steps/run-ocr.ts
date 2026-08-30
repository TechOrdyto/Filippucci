// Step 3: Esegue OCR su tutte le pagine normalizzate via PaddleOCR

import type { SagaContext, OcrPageResult } from "../types";
import { createStep } from "../saga";
import { saveOcrResult, deleteFile } from "../store";
import { ocrImage, checkOcrServer } from "../../ocr/client";
import { readFileSync } from "node:fs";

export const runOcrStep = createStep(
  "run-ocr",
  async (ctx: SagaContext) => {
    // Verifica che il servizio OCR sia attivo
    const serverUp = await checkOcrServer();
    if (!serverUp) {
      throw new Error(
        "Servizio PaddleOCR non attivo. Avvia con: bash scripts/start-ocr-server.sh"
      );
    }

    const pages = ctx.normalizedPages ?? [];
    if (pages.length === 0) {
      throw new Error("Nessuna pagina normalizzata disponibile");
    }

    const results: OcrPageResult[] = [];
    for (const page of pages) {
      const imageBuffer = readFileSync(page.imagePath);
      const result = await ocrImage(imageBuffer, { lang: ctx.options?.lang ?? "it" });
      result.pageNumber = page.pageNumber;
      results.push(result);
      console.log(`   📄 Pagina ${page.pageNumber}: ${result.textBlocks.length} blocchi testo`);
    }

    ctx.ocrResults = results;

    // Salva i risultati OCR
    const path = saveOcrResult(ctx.documentId, results);
    return { path, count: results.length };
  },
  async (ctx: SagaContext, result: { path: string }) => {
    deleteFile(result.path);
  },
  (ctx) => `${ctx.documentId}:run-ocr`
);