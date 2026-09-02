import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/auth/roles";
import { buildSaga } from "../../lib/ingestion/builder";
import type { IngestRequest, SagaContext } from "../../lib/ingestion/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minuti per OCR

export async function POST(request: Request) {
  try {
    // Guard: autenticazione + ruolo
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    if (!canAccess(session.user.role, "ingest")) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    const body: IngestRequest = await request.json();

    if (!body.fileData) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }
    if (body.type !== "catalog") {
      return NextResponse.json(
        { error: "Tipo non valido: solo 'catalog' (la piantina si importa da DXF)" },
        { status: 400 }
      );
    }

    // Decodifica base64
    const buffer = Buffer.from(body.fileData, "base64");

    // Costruisci il contesto della saga
    const ctx: SagaContext = {
      documentId: "", // verrà impostato dallo step save-document
      type: body.type,
      fileName: body.fileName,
      fileData: buffer,
      fileHash: "",
      options: body.options,
    };

    // Esegui la saga
    const saga = buildSaga();
    const result = await saga.run(ctx);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Saga fallita" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      executedSteps: result.executedSteps,
      output: result.output,
    });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
