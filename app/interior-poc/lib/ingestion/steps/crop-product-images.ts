// Step 4c: Ritaglia le immagini prodotto dal catalogo
// Usa il ritaglio deterministico (regione senza testo)
// e salva le immagini in /public/products/

import type { SagaContext, CatalogInterpretation } from "../types";
import { createStep } from "../saga";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const cropProductImagesStep = createStep(
  "crop-product-images",
  async (ctx: SagaContext) => {
    const interpretation = ctx.interpretation as CatalogInterpretation;
    if (!interpretation) {
      throw new Error("Nessuna interpretazione catalogo disponibile");
    }

    const pages = ctx.normalizedPages ?? [];
    const outputDir = resolve(process.cwd(), "public/products");
    mkdirSync(outputDir, { recursive: true });

    const cropped: Array<{ productId: string; path: string }> = [];

    for (const product of interpretation.products) {
      const regions = product.imageRegions ?? [];
      if (regions.length === 0) continue;

      const sharp = (await import("sharp")).default;

      // Ritaglia TUTTE le regioni immagine del prodotto (da più pagine)
      let imgIndex = 1;
      for (const region of regions) {
        const page = pages.find((p) => p.pageNumber === region.pageNumber);
        if (!page) continue;

        const imageBuffer = readFileSync(page.imagePath);
        const metadata = await sharp(imageBuffer).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        const left = Math.round((region.bbox.x / 100) * width);
        const top = Math.round((region.bbox.y / 100) * height);
        const cropWidth = Math.round((region.bbox.width / 100) * width);
        const cropHeight = Math.round((region.bbox.height / 100) * height);

        // Vincoli di sicurezza
        const safeLeft = Math.max(0, Math.min(left, width - 10));
        const safeTop = Math.max(0, Math.min(top, height - 10));
        const safeWidth = Math.max(10, Math.min(cropWidth, width - safeLeft));
        const safeHeight = Math.max(10, Math.min(cropHeight, height - safeTop));

        try {
          const croppedBuffer = await sharp(imageBuffer)
            .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
            .toBuffer();

          // Nome progressivo: {id}-1.png, {id}-2.png, ...
          const filename = regions.length > 1
            ? `${product.id}-${imgIndex}.png`
            : `${product.id}.png`;
          const outputPath = join(outputDir, filename);
          writeFileSync(outputPath, croppedBuffer);

          cropped.push({ productId: product.id, path: outputPath });
          console.log(`   🖼️  Ritagliata: ${product.name} → ${filename} (pagina ${region.pageNumber})`);
          imgIndex++;
        } catch (err) {
          console.warn(`   ⚠️  Ritaglio fallito per ${product.name}: ${err}`);
        }
      }
    }

    ctx.persistedPaths = cropped.map((c) => c.path);
    return cropped;
  },
  async (ctx: SagaContext, result: Array<{ path: string }>) => {
    // Compensazione: rimuovi le immagini ritagliate
    const { unlinkSync } = await import("node:fs");
    for (const item of result) {
      try {
        unlinkSync(item.path);
      } catch {}
    }
  },
  (ctx) => `${ctx.documentId}:crop-product-images`
);