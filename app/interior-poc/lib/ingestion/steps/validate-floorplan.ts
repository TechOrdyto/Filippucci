// Step 5a: Valida la geometria del floorplan
// Verifica: nessuna sovrapposizione, confini, coerenza quote

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

    // 1. Verifica sovrapposizioni tra stanze
    const rooms = interpretation.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i].bounds;
        const b = rooms[j].bounds;
        if (a.width === 0 || b.width === 0) continue; // bounds non ancora calcolati

        const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        if (ox > 0.05 && oy > 0.05) {
          errors.push(`Sovrapposizione: "${rooms[i].name}" e "${rooms[j].name}"`);
        }
      }
    }

    // 2. Verifica confini
    for (const room of rooms) {
      const b = room.bounds;
      if (b.width === 0) continue;
      if (b.x < 0 || b.y < 0 || b.x + b.width > W + 0.01 || b.y + b.height > H + 0.01) {
        errors.push(`"${room.name}" fuori dai confini`);
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