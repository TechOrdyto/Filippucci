// Step 4a: Interpreta il floorplan dalle quote OCR
// Usa il quote-solver per risolvere le quote mancanti
// e costruisce la griglia di stanze

import type { SagaContext, FloorplanInterpretation, OcrPageResult } from "../types";
import { createStep } from "../saga";
import { saveInterpretation, deleteFile } from "../store";
import { solveQuotes, validateQuotes } from "../../geometry/quote-solver";

// Pattern per riconoscere quote dimensionali nel testo OCR
const QUOTE_PATTERN = /(\d+[.,]\d+)/g;
const ROOM_NAME_PATTERN = /^(BAGNO|W\.?C\.?|CAMERA|CUCINA|SOGGIORNO|ANTI|GUARDAROBA|INGRESSO|BALCONE|DISIMPEGNO|SALA|STUDIO|LAVANDERIA)/i;
const AREA_PATTERN = /mq[.,]?\s*([\d.,]+)/i;
const HEIGHT_PATTERN = /H\.?\s*([\d.,]+)/i;

export const interpretFloorplanStep = createStep(
  "interpret-floorplan",
  async (ctx: SagaContext) => {
    const ocrResults = ctx.ocrResults ?? [];
    if (ocrResults.length === 0) {
      throw new Error("Nessun risultato OCR disponibile");
    }

    // Usa la prima pagina (la piantina è su una pagina)
    const page: OcrPageResult = ocrResults[0];

    // 1. Estrai le quote dimensionali
    const rawQuotes = extractQuotes(page);
    console.log(`   📏 Quote estratte: ${rawQuotes.length}`);

    // 2. Estrai le dimensioni totali (le più grandi)
    const { totalWidth, totalHeight } = extractTotalDimensions(page);
    console.log(`   📐 Dimensioni totali: ${totalWidth}m × ${totalHeight}m`);

    // 3. Risolvi le quote mancanti per sottrazione
    const { quotes, warnings } = solveQuotes(rawQuotes, totalWidth, totalHeight);

    // 4. Verifica coerenza quote
    const quoteErrors = validateQuotes(quotes, totalWidth, totalHeight);
    warnings.push(...quoteErrors);

    // 5. Estrai le stanze
    const rooms = extractRooms(page);

    // 6. Estrai l'altezza soffitto
    const ceilingHeight = extractCeilingHeight(page);

    const interpretation: FloorplanInterpretation = {
      dimensions: { width: totalWidth, height: totalHeight },
      ceilingHeight,
      quotes,
      rooms,
      openings: [], // le aperture verranno aggiunte in una fase successiva
      warnings,
    };

    ctx.interpretation = interpretation;

    // Salva l'interpretazione
    const path = saveInterpretation(ctx.documentId, interpretation);
    return { path, rooms: rooms.length, quotes: quotes.length };
  },
  async (ctx: SagaContext, result: { path: string }) => {
    deleteFile(result.path);
  },
  (ctx) => `${ctx.documentId}:interpret-floorplan`
);

// ─── Helpers ────────────────────────────────────────────────────

function extractQuotes(page: OcrPageResult): Array<{ value: number; axis: "x" | "y"; position: number }> {
  const quotes: Array<{ value: number; axis: "x" | "y"; position: number }> = [];

  for (const block of page.textBlocks) {
    const matches = block.text.match(QUOTE_PATTERN);
    if (!matches) continue;

    for (const match of matches) {
      const value = parseFloat(match.replace(",", "."));
      if (value < 0.5 || value > 30) continue; // quote plausibili

      // Determina l'asse in base alla posizione del blocco
      const { width, height } = page.imageSize;
      const isHorizontal = block.center.y < height * 0.15 || block.center.y > height * 0.85;
      const isVertical = block.center.x < width * 0.15 || block.center.x > width * 0.85;

      const axis: "x" | "y" = isVertical && !isHorizontal ? "y" : "x";

      quotes.push({
        value,
        axis,
        position: axis === "x" ? block.center.x : block.center.y,
      });
    }
  }

  return quotes;
}

function extractTotalDimensions(page: OcrPageResult): { totalWidth: number; totalHeight: number } {
  const quotes = extractQuotes(page);

  const xQuotes = quotes.filter((q) => q.axis === "x").map((q) => q.value);
  const yQuotes = quotes.filter((q) => q.axis === "y").map((q) => q.value);

  const totalWidth = xQuotes.length > 0 ? Math.max(...xQuotes) : 15.1;
  const totalHeight = yQuotes.length > 0 ? Math.max(...yQuotes) : 15.1;

  return { totalWidth, totalHeight };
}

function extractRooms(page: OcrPageResult): FloorplanInterpretation["rooms"] {
  const rooms: FloorplanInterpretation["rooms"] = [];

  for (const block of page.textBlocks) {
    const nameMatch = block.text.match(ROOM_NAME_PATTERN);
    if (!nameMatch) continue;

    const areaMatch = block.text.match(AREA_PATTERN);
    const area = areaMatch ? parseFloat(areaMatch[1].replace(",", ".")) : undefined;

    rooms.push({
      name: nameMatch[1],
      area,
      bounds: { x: 0, y: 0, width: 0, height: 0 }, // verrà calcolato dal layout builder
      textBlockRef: block.text,
    });
  }

  return rooms;
}

function extractCeilingHeight(page: OcrPageResult): number {
  for (const block of page.textBlocks) {
    const match = block.text.match(HEIGHT_PATTERN);
    if (match) {
      return parseFloat(match[1].replace(",", "."));
    }
  }
  return 2.75; // default
}