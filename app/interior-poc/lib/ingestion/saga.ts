// Orchestratore saga per la pipeline di ingestione
// Ogni step è atomico e idempotente
// Se uno step fallisce, gli step precedenti vengono compensati (rollback)

import type { SagaContext, SagaResult, SagaStep } from "./types";
import { isStepDone, markStepDone, clearSagaState } from "./store";

export class IngestionSaga {
  private steps: SagaStep[] = [];

  addStep(step: SagaStep): this {
    this.steps.push(step);
    return this;
  }

  async run(ctx: SagaContext): Promise<SagaResult> {
    const executed: { step: SagaStep; result: any }[] = [];

    try {
      for (const step of this.steps) {
        // Idempotenza: se lo step è già stato eseguito, salta
        const key = step.idempotencyKey(ctx);
        if (isStepDone(ctx.documentId, key)) {
          console.log(`⏭️  Step ${step.id} già eseguito (idempotente), salto`);
          executed.push({ step, result: null });
          continue;
        }

        console.log(`▶️  Step ${step.id} in esecuzione...`);
        const result = await step.execute(ctx);
        markStepDone(ctx.documentId, key, result);
        executed.push({ step, result });
        console.log(`✅ Step ${step.id} completato`);
      }

      return {
        success: true,
        documentId: ctx.documentId,
        executedSteps: executed.map((e) => e.step.id),
        output: ctx.interpretation,
      };
    } catch (err) {
      console.error(`❌ Saga fallita: ${err instanceof Error ? err.message : err}`);

      // Compensazione: rollback degli step eseguiti (in ordine inverso)
      const compensated: string[] = [];
      for (const { step, result } of executed.reverse()) {
        try {
          await step.compensate(ctx, result);
          compensated.push(step.id);
          console.log(`↩️  Step ${step.id} compensato`);
        } catch (compErr) {
          console.error(`⚠️  Compensazione fallita per ${step.id}:`, compErr);
        }
      }

      // Pulisci lo stato della saga
      clearSagaState(ctx.documentId);

      return {
        success: false,
        documentId: ctx.documentId,
        executedSteps: compensated,
        error: err instanceof Error ? err.message : "Errore sconosciuto",
      };
    }
  }
}

// Helper per creare step con idempotenza standard
export function createStep<T>(
  id: string,
  execute: (ctx: SagaContext) => Promise<T>,
  compensate: (ctx: SagaContext, result: T) => Promise<void> = async () => {},
  idempotencyKey: (ctx: SagaContext) => string = (ctx) => `${ctx.documentId}:${id}`
): SagaStep<T> {
  return { id, execute, compensate, idempotencyKey };
}