// Step 1: Salva il documento originale
// Idempotente: usa il documentId come chiave

import type { SagaContext } from "../types";
import { createStep } from "../saga";
import { computeFileHash, generateDocumentId, saveDocument, deleteFile } from "../store";

export const saveDocumentStep = createStep(
  "save-document",
  async (ctx: SagaContext) => {
    // Calcola hash per dedup
    const hash = computeFileHash(ctx.fileData);
    ctx.fileHash = hash;
    ctx.documentId = generateDocumentId(ctx.type, hash);

    // Estensione dal nome file
    const ext = ctx.fileName.split(".").pop()?.toLowerCase() ?? "pdf";

    // Salva il documento
    const path = saveDocument(ctx.documentId, ctx.fileData, ext);
    return { path, hash };
  },
  async (ctx: SagaContext, result: { path: string }) => {
    deleteFile(result.path);
  },
  (ctx) => `${ctx.documentId}:save-document`
);