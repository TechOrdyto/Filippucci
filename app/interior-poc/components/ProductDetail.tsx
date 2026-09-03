"use client";

import { useEffect, useState } from "react";
import type { Product } from "../lib/types";

interface ArticleVariant {
  code: string;
  type: string;
  dimensions: { width?: number; depth?: number; height?: number; diameter?: number };
  weightKg?: number;
  volumeMc?: number;
  colli?: number;
  priceRange?: { min: number; max: number } | null;
  prices?: Record<string, Record<string, number> | number>;
}

interface ArticleData {
  name: string;
  designer: string;
  year: number;
  collection: string;
  description: string;
  materials: Record<string, string>;
  finishes: Record<string, string[]>;
  variants: ArticleVariant[];
  notes?: string[];
  images: string[];
}

interface ProductDetailProps {
  product: Product;
}

// Etichette per le categorie di rivestimento
const CATEGORY_LABELS: Record<string, string> = {
  tessuto: "Tessuto",
  pelle: "Pelle",
  tessutoMt: "Tessuto mt",
  vetro: "Vetro",
  marmo: "Marmo",
  marmoSpeciale: "Marmo (prezzo speciale)",
};

/**
 * Dettaglio prodotto: mostra la base dati completa quando un prodotto
 * viene selezionato. Include varianti, misure e prezzi dal listino.
 */
export default function ProductDetail({ product }: ProductDetailProps) {
  const [articleData, setArticleData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/interior-poc/api/products/${product.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setArticleData(data?.article ?? null);
        if (data?.article?.variants?.length > 0) {
          setSelectedVariant(data.article.variants[0].code);
        }
      })
      .catch(() => setArticleData(null))
      .finally(() => setLoading(false));
  }, [product.id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm text-[var(--text-muted)]">Caricamento dati prodotto...</p>
      </div>
    );
  }

  if (!articleData) return null;

  const selected = articleData.variants.find((v) => v.code === selectedVariant) ?? articleData.variants[0];

  const formatDimensions = (d: ArticleVariant["dimensions"]) => {
    const parts: string[] = [];
    if (d.width) parts.push(`L ${d.width}`);
    if (d.depth) parts.push(`P ${d.depth}`);
    if (d.height) parts.push(`H ${d.height}`);
    if (d.diameter) parts.push(`Ø ${d.diameter}`);
    return parts.join(" × ");
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">{articleData.name}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {articleData.designer} · {articleData.year} · {articleData.collection}
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
        {articleData.description}
      </p>

      {/* Selettore variante */}
      {articleData.variants.length > 1 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Varianti ({articleData.variants.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {articleData.variants.map((v) => (
              <button
                key={v.code}
                type="button"
                onClick={() => setSelectedVariant(v.code)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedVariant === v.code
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-strong)]"
                }`}
              >
                {v.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dettaglio variante selezionata */}
      {selected && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="text-sm font-bold text-[var(--text)]">
            {selected.code} <span className="ml-1 font-normal text-[var(--text-muted)]">{selected.type}</span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {formatDimensions(selected.dimensions)}
            {selected.weightKg ? ` · ${selected.weightKg} kg` : ""}
            {selected.colli ? ` · ${selected.colli} collo` : ""}
          </div>

          {/* Tabella prezzi */}
          {selected.prices && (
            <div className="mt-3">
              <h5 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                Prezzi (€)
              </h5>
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[var(--surface-strong)]">
                    <tr>
                      <th className="px-2 py-1 font-semibold text-[var(--text-muted)]">Rivestimento</th>
                      <th className="px-2 py-1 font-semibold text-[var(--text-muted)]">Colore</th>
                      <th className="px-2 py-1 text-right font-semibold text-[var(--text-muted)]">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selected.prices).map(([category, value]) => {
                      // Struttura {categoria: {colore: prezzo}} o {categoria: prezzo}
                      if (typeof value === "number") {
                        return (
                          <tr key={category} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1 text-[var(--text-muted)]">
                              {CATEGORY_LABELS[category] ?? category}
                            </td>
                            <td className="px-2 py-1 font-semibold text-[var(--text)]">—</td>
                            <td className="px-2 py-1 text-right font-semibold text-[var(--accent-strong)]">
                              €{value.toLocaleString("it-IT")}
                            </td>
                          </tr>
                        );
                      }
                      return Object.entries(value).map(([color, price]) => (
                        <tr key={`${category}-${color}`} className="border-t border-[var(--border)]">
                          <td className="px-2 py-1 text-[var(--text-muted)]">
                            {CATEGORY_LABELS[category] ?? category}
                          </td>
                          <td className="px-2 py-1 font-semibold text-[var(--text)]">{color}</td>
                          <td className="px-2 py-1 text-right font-semibold text-[var(--accent-strong)]">
                            €{price.toLocaleString("it-IT")}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Finiture */}
      {Object.keys(articleData.finishes).length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Finiture
          </h4>
          {Object.entries(articleData.finishes).map(([key, values]) => (
            <div key={key} className="mb-2">
              <p className="mb-1 text-[11px] text-[var(--text-muted)]">{key}</p>
              <div className="flex flex-wrap gap-1.5">
                {values.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      {articleData.notes && articleData.notes.length > 0 && (
        <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Note
          </h4>
          <ul className="list-inside list-disc space-y-1 text-[11px] text-[var(--text-muted)]">
            {articleData.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
