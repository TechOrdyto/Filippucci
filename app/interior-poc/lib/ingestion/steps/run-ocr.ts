// Step 3: Esegue OCR su tutte le pagine normalizzate
// Usa tesseract.js (primario) con fallback AI vision

import type { SagaContext, OcrPageResult } from "../types";
import { createStep } from "../saga";
import { saveOcrResult, deleteFile } from "../store";
import { ocrImage, checkOcrServer } from "../../ocr/client";
import { readFileSync } from "node:fs";

export const runOcrStep = createStep(
  "run-ocr",
  async (ctx: SagaContext) => {
    // Verifica che il servizio OCR sia disponibile
    const serverUp = await checkOcrServer();
    if (!serverUp) {
      throw new Error("Servizio OCR non disponibile");
    }

    const pages = ctx.normalizedPages ?? [];
    if (pages.length === 0) {
      throw new Error("Nessuna pagina normalizzata disponibile");
    }

    const results: OcrPageResult[] = [];
    for (const page of pages) {
      const imageBuffer = readFileSync(page.imagePath);
      // Passa il tipo di documento per prompt OCR specializzato
      const result = await ocrImage(imageBuffer, {
        lang: ctx.options?.lang ?? "it",
        documentType: ctx.type,
      });
      result.pageNumber = page.pageNumber;
      results.push(result);
      console.log(`   📄 Pagina ${page.pageNumber}: ${result.textBlocks.length} blocchi testo`);

      // Delay tra le pagine per rispettare il rate limit TPM di gpt-4o-mini
      if (pages.length > 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
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