// Step 5a: Valida e corregge la geometria del floorplan
// Verifica: nessuna sovrapposizione, confini, coerenza quote
// CORREGGE automaticamente le sovrapposizioni (sposta le stanze)

import type { SagaContext, FloorplanInterpretation, ValidationResult } from "../types";
import { createStep } from "../saga";
import { buildDeterministicFloorplan } from "./interpret-floorplan";

export const validateFloorplanStep = createStep(
  "validate-floorplan",
  async (ctx: SagaContext) => {
    const interpretation = ctx.interpretation as FloorplanInterpretation;
    if (!interpretation) {
      throw new Error("Nessuna interpretazione floorplan disponibile");
    }

    const errors: string[] = [];
    const warnings: string[] = [...interpretation.warnings];

    const { width: W, height: H } = interpretation.dimensions;

    // 1. Corregge le sovrapposizioni tra stanze (loop fino a risoluzione)
    const rooms = interpretation.rooms;
    let maxIterations = 10;
    let fixed = 0;
    while (maxIterations-- > 0) {
      let foundOverlap = false;
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i].bounds;
          const b = rooms[j].bounds;
          if (a.width === 0 || b.width === 0) continue;

          const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
          const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          if (ox > 0.05 && oy > 0.05) {
            fixed++;
            foundOverlap = true;
            // Sposta la stanza j fuori dalla sovrapposizione
            fixOverlap(rooms[j], { x: ox, y: oy, width: ox, height: oy });
          }
        }
      }
      if (!foundOverlap) break;
    }

    // Se dopo il loop ci sono ANCORA sovrapposizioni, il layout AI è irrecuperabile:
    // sostituisci con il layout deterministico di fallback
    let stillOverlapping = false;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i].bounds;
        const b = rooms[j].bounds;
        if (a.width === 0 || b.width === 0) continue;
        const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        if (ox > 0.05 && oy > 0.05) {
          stillOverlapping = true;
          break;
        }
      }
      if (stillOverlapping) break;
    }

    if (stillOverlapping) {
      warnings.push("Layout AI irrecuperabile: sostituito con layout deterministico");
      const fallback = buildDeterministicFloorplan();
      interpretation.rooms = fallback.rooms;
      interpretation.openings = fallback.openings;
      interpretation.quotes = fallback.quotes;
      interpretation.dimensions = fallback.dimensions;
      interpretation.ceilingHeight = fallback.ceilingHeight;
    } else if (fixed > 0) {
      warnings.push(`${fixed} sovrapposizioni corrette`);
    }

    // 2. Corregge i confini
    for (const room of rooms) {
      const b = room.bounds;
      if (b.width === 0) continue;
      if (b.x < 0 || b.y < 0 || b.x + b.width > W + 0.01 || b.y + b.height > H + 0.01) {
        warnings.push(`"${room.name}" fuori dai confini — corretto`);
        b.x = Math.max(0, Math.min(b.x, W - b.width));
        b.y = Math.max(0, Math.min(b.y, H - b.height));
      }
    }

    // 3. Verifica quote coerenti
    const xSum = interpretation.quotes.filter((q) => q.axis === "x").reduce((s, q) => s + q.value, 0);
    const ySum = interpretation.quotes.filter((q) => q.axis === "y").reduce((s, q) => s + q.value, 0);

    if (Math.abs(xSum - W) > 0.1) {
      warnings.push(`Somma quote X (${xSum.toFixed(2)}) ≠ larghezza (${W})`);
    }
    if (Math.abs(ySum - H) > 0.1) {
      warnings.push(`Somma quote Y (${ySum.toFixed(2)}) ≠ altezza (${H})`);
    }

    const result: ValidationResult = { valid: errors.length === 0, errors, warnings };
    ctx.validation = result;

    if (!result.valid) {
      throw new Error(`Validazione fallita: ${errors.join("; ")}`);
    }

    return result;
  },
  async () => {},
  (ctx) => `${ctx.documentId}:validate-floorplan`
);

/**
 * Sposta una stanza fuori dalla sovrapposizione
 */
function fixOverlap(room: any, overlap: { x: number; y: number; width: number; height: number }) {
  const b = room.bounds;
  const dx = overlap.width;
  const dy = overlap.height;

  if (dx <= dy) {
    // Sposta orizzontalmente
    if (b.x + b.width / 2 < overlap.x + overlap.width / 2) {
      b.x = overlap.x + overlap.width;
    } else {
      b.x = overlap.x - b.width;
    }
  } else {
    // Sposta verticalmente
    if (b.y + b.height / 2 < overlap.y + overlap.height / 2) {
      b.y = overlap.y + overlap.height;
    } else {
      b.y = overlap.y - b.height;
    }
  }
}