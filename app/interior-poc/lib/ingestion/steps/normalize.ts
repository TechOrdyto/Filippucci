// Step 2: Normalizza il documento (PDF → PNG ad alta risoluzione)
// Usa pdftoppm (poppler) per convertire il PDF in immagini

import type { SagaContext, NormalizedPage } from "../types";
import { createStep } from "../saga";
import { saveNormalizedPage, deleteFile } from "../store";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const execFileAsync = promisify(execFile);

export const normalizeStep = createStep(
  "normalize",
  async (ctx: SagaContext) => {
    const dpi = ctx.options?.dpi ?? 300;
    const maxPages = ctx.options?.maxPages ?? 20;

    // Salva il PDF in un file temporaneo
    const tmpPdf = join(tmpdir(), `${ctx.documentId}.pdf`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(tmpPdf, ctx.fileData);

    try {
      // Converti in PNG con pdftoppm
      const tmpPrefix = join(tmpdir(), `${ctx.documentId}-page`);
      await execFileAsync("pdftoppm", [
        "-png",
        "-r",
        String(dpi),
        "-f",
        "1",
        "-l",
        String(maxPages),
        tmpPdf,
        tmpPrefix,
      ]);

      // Raccogli le pagine generate
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(tmpdir())
        .filter((f) => f.startsWith(`${ctx.documentId}-page`) && f.endsWith(".png"))
        .sort((a, b) => {
          const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
          const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
          return na - nb;
        });

      const pages: NormalizedPage[] = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = join(tmpdir(), files[i]);
        const pngBuffer = readFileSync(filePath);

        // Ottieni dimensioni
        const { execFileSync } = await import("node:child_process");
        let width = 0;
        let height = 0;
        try {
          const info = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]).toString();
          const wMatch = info.match(/pixelWidth: (\d+)/);
          const hMatch = info.match(/pixelHeight: (\d+)/);
          width = wMatch ? parseInt(wMatch[1]) : 0;
          height = hMatch ? parseInt(hMatch[1]) : 0;
        } catch {
          // sips non disponibile
        }

        // Salva la pagina normalizzata nello store
        const savedPath = saveNormalizedPage(ctx.documentId, i + 1, pngBuffer);
        pages.push({
          pageNumber: i + 1,
          imagePath: savedPath,
          width,
          height,
        });
      }

      ctx.normalizedPages = pages;
      return pages;
    } finally {
      // Pulisci file temporanei
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(tmpPdf);
      } catch {}
    }
  },
  async (ctx: SagaContext, result: NormalizedPage[]) => {
    // Compensazione: rimuovi le pagine normalizzate
    for (const page of result) {
      deleteFile(page.imagePath);
    }
  },
  (ctx) => `${ctx.documentId}:normalize`
);