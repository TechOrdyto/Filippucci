import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/auth/roles";
import { extractTextFromPdf } from "../../lib/extraction/pdf";
import { extractCatalogProducts } from "../../lib/extraction/catalog-extractor";
import { interpretCatalogText } from "../../lib/extraction/ai-interpreter";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ExtractRequest {
  type: "catalog";
  fileName: string;
  fileData: string; // base64
  useAI?: boolean;
}

export async function POST(request: Request) {
  try {
    // Guard: autenticazione + ruolo
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    if (!canAccess(session.user.role, "extract")) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    const body: ExtractRequest = await request.json();

    if (!body.fileData) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }
    if (body.type !== "catalog") {
      return NextResponse.json(
        { error: "Tipo non supportato: solo 'catalog'" },
        { status: 400 }
      );
    }

    // Decodifica base64
    const buffer = Buffer.from(body.fileData, "base64");

    // 1. Estrai testo dal PDF
    const pdfResult = await extractTextFromPdf(buffer);

    // 2. Rule-based
    const ruleResult = extractCatalogProducts(pdfResult.fullText);

    // AI (opzionale o automatico se rule-based non trova nulla)
    const useAI = body.useAI || ruleResult.products.length === 0;
    if (useAI) {
      try {
        const aiResult = await interpretCatalogText(pdfResult.fullText);
        return NextResponse.json({
          type: "catalog",
          products: aiResult.data,
          source: "ai",
          warnings: aiResult.warnings,
          pageCount: pdfResult.pageCount,
          metadata: pdfResult.metadata,
          preview: pdfResult.fullText.slice(0, 2000),
        });
      } catch (err) {
        return NextResponse.json({
          type: "catalog",
          products: ruleResult.products,
          source: "rule-based",
          warnings: [
            ...ruleResult.warnings,
            `AI fallita (${err instanceof Error ? err.message : "errore"}), usato rule-based`,
          ],
          pageCount: pdfResult.pageCount,
          metadata: pdfResult.metadata,
          preview: pdfResult.fullText.slice(0, 2000),
        });
      }
    }

    return NextResponse.json({
      type: "catalog",
      products: ruleResult.products,
      source: "rule-based",
      warnings: ruleResult.warnings,
      pageCount: pdfResult.pageCount,
      metadata: pdfResult.metadata,
      preview: pdfResult.fullText.slice(0, 2000),
    });
  } catch (err) {
    console.error("Extraction error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
