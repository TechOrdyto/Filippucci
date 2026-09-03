import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/auth/roles";
import { findProductById } from "../../../lib/catalog";
import { findArticleData, getVariantPriceRange } from "../../../lib/articles";

export const runtime = "nodejs";

/**
 * GET /api/products/[id]
 * Restituisce i dati completi di un prodotto del catalogo.
 * Include la base dati completa (varianti, misure, prezzi, rivestimenti,
 * finiture) per gli articoli che hanno un file dati in data/articles/.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    if (!canAccess(session.user.role, "generate")) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    const product = findProductById(id);

    if (!product) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    // Base dati estesa per gli articoli con file dati
    const articleData = findArticleData(product.name);
    const extendedData = articleData
      ? {
          article: {
            ...articleData,
            variants: articleData.variants.map((v) => ({
              ...v,
              priceRange: getVariantPriceRange(v),
            })),
          },
        }
      : {};

    return NextResponse.json({
      product,
      ...extendedData,
    });
  } catch (err) {
    console.error("Product detail error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
