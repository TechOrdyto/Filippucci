import { NextResponse } from "next/server";
import { extractTextFromPdf } from "../../lib/extraction/pdf";
import { extractCatalogProducts } from "../../lib/extraction/catalog-extractor";
import { extractFloorplanFromText } from "../../lib/extraction/floorplan-extractor";
import {
  interpretCatalogText,
  interpretFloorplanText,
} from "../../lib/extraction/ai-interpreter";
import { chatCompletionWithImage } from "../../lib/ai-client";
import { extractJson } from "../../lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ExtractRequest {
  type: "catalog" | "floorplan";
  fileName: string;
  fileData: string; // base64
  useAI?: boolean;
}

export async function POST(request: Request) {
  try {
    const body: ExtractRequest = await request.json();

    if (!body.fileData) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    // Decodifica base64
    const buffer = Buffer.from(body.fileData, "base64");

    // 1. Estrai testo dal PDF
    const pdfResult = await extractTextFromPdf(buffer);

    // 2. Interpreta in base al tipo
    if (body.type === "catalog") {
      // Rule-based
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
          // Fallback a rule-based
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
    }

    if (body.type === "floorplan") {
      // Rule-based
      const ruleResult = extractFloorplanFromText(pdfResult.fullText);

      // Se il testo è vuoto (PDF basato su immagini), usa AI vision
      const textEmpty = pdfResult.fullText.trim().length < 50;
      const useAI = body.useAI || ruleResult.floorplan === null || textEmpty;

      if (useAI) {
        try {
          if (textEmpty) {
            // PDF basato su immagini: usa AI vision sulla prima pagina
            const { extractImagesFromPdf } = await import("../../lib/extraction/pdf");
            const images = await extractImagesFromPdf(buffer, { maxPages: 1, scale: 2 });
            if (images.length > 0) {
              const visionResult = await interpretFloorplanImage(images[0].dataUrl);
              return NextResponse.json({
                type: "floorplan",
                floorplan: visionResult.data,
                source: "ai-vision",
                warnings: visionResult.warnings,
                pageCount: pdfResult.pageCount,
                metadata: pdfResult.metadata,
                preview: pdfResult.fullText.slice(0, 2000),
              });
            }
          }

          // Testo disponibile: AI text
          const aiResult = await interpretFloorplanText(pdfResult.fullText);
          return NextResponse.json({
            type: "floorplan",
            floorplan: aiResult.data,
            source: "ai",
            warnings: aiResult.warnings,
            pageCount: pdfResult.pageCount,
            metadata: pdfResult.metadata,
            preview: pdfResult.fullText.slice(0, 2000),
          });
        } catch (err) {
          return NextResponse.json({
            type: "floorplan",
            floorplan: ruleResult.floorplan,
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
        type: "floorplan",
        floorplan: ruleResult.floorplan,
        source: "rule-based",
        warnings: ruleResult.warnings,
        pageCount: pdfResult.pageCount,
        metadata: pdfResult.metadata,
        preview: pdfResult.fullText.slice(0, 2000),
      });
    }

    return NextResponse.json({ error: "Tipo non supportato" }, { status: 400 });
  } catch (err) {
    console.error("Extraction error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}

// Interpreta la piantina da immagine (vision)
async function interpretFloorplanImage(imageDataUrl: string) {
  const systemPrompt = `Sei un architetto esperto. Analizza l'immagine della piantina architettonica.
Estrai i dati strutturati in JSON:
{
  "id": "slug-univoco",
  "name": "nome piano",
  "unit": "m",
  "dimensions": { "width": metri, "height": metri },
  "ceilingHeight": metri,
  "rooms": [
    {
      "id": "slug-stanza",
      "name": "nome stanza",
      "area": mq,
      "bounds": { "x": 0, "y": 0, "width": metri, "height": metri },
      "openings": []
    }
  ]
}
Leggi le misure scritte sulla piantina (es. "3.62", "mq. 47.09").
Le stanze NON devono sovrapporsi.
Rispondi SOLO con JSON valido, nessun altro testo.`;

  const response = await chatCompletionWithImage(systemPrompt, imageDataUrl, {
    temperature: 0.1,
    maxTokens: 8192,
  });

  return {
    data: extractJson<any>(response.content),
    warnings: [],
    provider: response.provider,
  };
}