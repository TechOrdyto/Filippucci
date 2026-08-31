// Step 5a: Valida la geometria del floorplan
// Verifica: confini, coerenza quote
// NOTA: NON corregge le sovrapposizioni (spostare le stanze rovina la disposizione)
// Le piccole sovrapposizioni sono accettabili se la disposizione è corretta

import type { SagaContext, FloorplanInterpretation, ValidationResult } from "../types";
import { createStep } from "../saga";

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

    // 1. Verifica confini (senza correggere)
    const rooms = interpretation.rooms;
    for (const room of rooms) {
      const b = room.bounds;
      if (b.width === 0) continue;
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > W + 0.5 || b.y + b.height > H + 0.5) {
        warnings.push(`"${room.name}" fuori dai confini (accettato)`);
      }
    }
      }
      if (stillOverlapping) break;
    }

    if (stillOverlapping) {
      warnings.push("Layout AI irrecuperabile: sostituito con layout deterministico");
      const fallback = buildDeterministicFloorplan();
      interpretation.rooms = fallback.rooms;
      interpretation.openings = fallback.openings;
      // 2. Verifica quote coerenti
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