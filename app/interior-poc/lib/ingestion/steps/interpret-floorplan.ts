// Step 4a: Interpreta il floorplan dal JSON strutturato dell'AI vision
// Usa il quote-solver per risolvere le quote mancanti
// e costruisce la griglia di stanze

import type { SagaContext, FloorplanInterpretation, OcrPageResult } from "../types";
import { createStep } from "../saga";
import { saveInterpretation, deleteFile } from "../store";
import { solveQuotes, validateQuotes } from "../../geometry/quote-solver";

export const interpretFloorplanStep = createStep(
  "interpret-floorplan",
  async (ctx: SagaContext) => {
    const ocrResults = ctx.ocrResults ?? [];
    if (ocrResults.length === 0) {
      throw new Error("Nessun risultato OCR disponibile");
    }

    // Usa la prima pagina (la piantina è su una pagina)
    const page: OcrPageResult = ocrResults[0];

    // Estrai il JSON strutturato dall'AI vision
    const parsed = parseFloorplanJson(page.fullText);
    if (!parsed) {
      throw new Error("Nessun floorplan JSON valido nella risposta OCR");
    }

    const fp = parsed.floorplan;
    if (!fp) {
      throw new Error("AI vision non ha riconosciuto la piantina");
    }

    const warnings: string[] = [];

    // 1. Dimensioni totali
    const totalWidth = fp.dimensions?.width ?? 15.1;
    const totalHeight = fp.dimensions?.height ?? 15.1;
    console.log(`   📐 Dimensioni totali: ${totalWidth}m × ${totalHeight}m`);

    // 2. Quote (dall'AI vision + risoluzione mancanti)
    const rawQuotes = (fp.quotes ?? []).map((q: any) => ({
      value: q.value,
      axis: q.axis === "y" ? "y" as const : "x" as const,
      position: 0,
    }));
    const { quotes, warnings: quoteWarnings } = solveQuotes(rawQuotes, totalWidth, totalHeight);
    warnings.push(...quoteWarnings);

    // 3. Verifica coerenza quote
    const quoteErrors = validateQuotes(quotes, totalWidth, totalHeight);
    warnings.push(...quoteErrors);

    // 4. Stanze (bounds dall'AI vision)
    const rooms = (fp.rooms ?? []).map((room: any, i: number) => ({
      name: room.name ?? `Stanza ${i + 1}`,
      area: room.area,
      bounds: {
        x: room.bounds?.x ?? 0,
        y: room.bounds?.y ?? 0,
        width: room.bounds?.width ?? 0,
        height: room.bounds?.height ?? 0,
      },
    }));
    console.log(`   🏠 Stanze: ${rooms.length}`);

    // 5. Aperture (porte e finestre)
    const openings = (fp.openings ?? []).map((o: any, i: number) => ({
      type: (o.type ?? "door") as "window" | "door" | "french-door",
      position: { x: o.position?.x ?? 0, y: o.position?.y ?? 0 },
      width: o.width ?? 0.8,
      height: o.height ?? 2.1,
      wall: (o.wall ?? "north") as "north" | "south" | "east" | "west",
      exposure: (o.wall ?? "north") as "north" | "south" | "east" | "west",
    }));
    console.log(`   🚪 Aperture: ${openings.length}`);

    // 6. Altezza soffitto
    const ceilingHeight = fp.ceilingHeight ?? 2.75;

    const interpretation: FloorplanInterpretation = {
      dimensions: { width: totalWidth, height: totalHeight },
      ceilingHeight,
      quotes,
      rooms,
      openings,
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

function parseFloorplanJson(content: string): any | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
