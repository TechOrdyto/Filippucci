"use client";

import { useMemo, useState } from "react";
import MentionInput from "./components/MentionInput";
import FloorplanViewer from "./components/FloorplanViewer";
import DesignSummary from "./components/DesignSummary";
import RenderResult from "./components/RenderResult";
import { catalog, findProductById, parseMentions } from "./lib/catalog";
import type { DesignProposal, DesignState, ProductMention } from "./lib/types";
import floorplanData from "./data/floorplan.json";
import designerRules from "./data/designer-rules.json";

const floorplan = floorplanData as any;
const rules = designerRules as any;

function createInitialProposal(): DesignProposal {
  return {
    explicitProducts: [],
    suggestedProducts: [],
    style: rules.style.primary,
    atmosphere: {
      warmth: 5,
      elegance: 5,
      minimalism: 5,
      cozy: 5,
    },
    lighting: {
      type: "natural",
      mood: "bright",
      naturalLightEmphasis: true,
    },
    decorativeElements: [],
    narrative: "",
  };
}

export default function InteriorPocPage() {
  const [prompt, setPrompt] = useState("");
  const [mentions, setMentions] = useState<ProductMention[]>([]);
  const [state, setState] = useState<DesignState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const explicitProducts = useMemo(
    () => mentions.map((m) => findProductById(m.productId)).filter(Boolean),
    [mentions]
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Build proposal from mentions + prompt
      const proposal: DesignProposal = {
        ...createInitialProposal(),
        explicitProducts: explicitProducts as any[],
        suggestedProducts: [],
        narrative: prompt,
      };

      // 2. Update state
      const newState: DesignState = {
        sessionId: crypto.randomUUID(),
        current: proposal,
        history: [
          ...(state?.history ?? []),
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            prompt,
            resultingProposal: proposal,
          },
        ],
      };
      setState(newState);

      // 3. Call generation API
      const res = await fetch("/interior-poc/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          productIds: explicitProducts.map((p) => (p as any).id),
          floorplanId: floorplan.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Errore nella generazione");
      }

      const data = await res.json();
      setImageUrl(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveSuggested = (productId: string) => {
    if (!state) return;
    setState({
      ...state,
      current: {
        ...state.current,
        suggestedProducts: state.current.suggestedProducts.filter(
          (p) => p.id !== productId
        ),
      },
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Ordyto — Interior Design AI
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            PoC: da planimetria a render fotorealistico con catalogo Molteni&C
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Colonna sinistra: input + planimetria */}
          <div className="space-y-6">
            {/* Prompt input */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                Descrivi l'ambiente
              </h2>
              <MentionInput
                value={prompt}
                onChange={setPrompt}
                onMentionsChange={setMentions}
              />

              {/* Prodotti rilevati */}
              {explicitProducts.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Prodotti rilevati dal catalogo
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {explicitProducts.map((p) => (
                      <span
                        key={(p as any).id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                      >
                        ✅ {(p as any).name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? "Generazione in corso..." : "🎨 Genera Render"}
              </button>
            </section>

            {/* Planimetria */}
            <FloorplanViewer floorplan={floorplan} />
          </div>

          {/* Colonna destra: proposta + render */}
          <div className="space-y-6">
            {state && (
              <DesignSummary
                proposal={state.current}
                onRemoveSuggested={handleRemoveSuggested}
              />
            )}
            <RenderResult
              imageUrl={imageUrl}
              isLoading={isGenerating}
              error={error}
              onRegenerate={handleGenerate}
            />
          </div>
        </div>

        {/* Catalogo disponibile */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Catalogo disponibile ({catalog.length} prodotti)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((product) => (
              <div
                key={product.id}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xl">
                      {product.category === "Sofas" ? "🛋️" : product.category === "Tables" ? "🪑" : "📦"}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {product.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {product.category} · {product.designer}
                        </div>
                      </div>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {product.id}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {product.dimensions
                        ? `${product.dimensions.width}×${product.dimensions.depth}×${product.dimensions.height} cm`
                        : "Dimensioni non disponibili"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {product.materials?.join(", ") ?? "Materiali non disponibili"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}