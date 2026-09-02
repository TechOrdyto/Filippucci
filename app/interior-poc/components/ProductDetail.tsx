"use client";

import { useEffect, useState } from "react";
import type { Product } from "../lib/types";

interface DevonVariant {
  code: string;
  type: string;
  dimensions: { width: number; depth: number; height: number };
  weightKg: number;
  volumeMc: number;
  colli: number;
  priceRange?: { min: number; max: number } | null;
  prices: Record<string, Record<string, number>>;
  technicalImage?: string;
}

interface DevonData {
  name: string;
  designer: string;
  year: number;
  description: string;
  materials: Record<string, string>;
  finishes: { base: string[]; upholstery: string[] };
  variants: DevonVariant[];
  notes: string[];
}

interface ProductDetailProps {
  product: Product;
}

/**
 * Dettaglio prodotto: mostra la base dati completa quando un prodotto
 * viene selezionato. Per DEVON include varianti, misure e prezzi dal listino.
 */
export default function ProductDetail({ product }: ProductDetailProps) {
  const [devonData, setDevonData] = useState<DevonData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isDevon = product.name.toLowerCase() === "devon";
    if (!isDevon) {
      setDevonData(null);
      return;
    }

    setLoading(true);
    fetch(`/interior-poc/api/products/${product.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDevonData(data?.devon ?? null))
      .catch(() => setDevonData(null))
      .finally(() => setLoading(false));
  }, [product.id, product.name]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm text-[var(--text-muted)]">Caricamento dati prodotto...</p>
      </div>
    );
  }

  if (!devonData) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">{devonData.name}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {devonData.designer} · {devonData.year}
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
        {devonData.description}
      </p>

      {/* Materiali */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Materiali
        </h4>
        <div className="space-y-1 text-xs text-[var(--text-muted)]">
          {Object.entries(devonData.materials).map(([key, value]) => (
            <p key={key}>
              <span className="font-medium text-[var(--text)]">{key}:</span> {value}
            </p>
          ))}
        </div>
      </div>

      {/* Finiture */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Finiture basamento
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {devonData.finishes.base.map((f) => (
            <span
              key={f}
              className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Varianti */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Varianti ({devonData.variants.length})
        </h4>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {devonData.variants.map((v) => (
            <div
              key={v.code}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[var(--text)]">{v.code}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{v.type}</span>
                </div>
                {v.priceRange && (
                  <span className="text-xs font-medium text-[var(--accent-strong)]">
                    €{v.priceRange.min.toLocaleString("it-IT")}–
                    {v.priceRange.max.toLocaleString("it-IT")}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {v.dimensions.width}×{v.dimensions.depth}×{v.dimensions.height} cm ·{" "}
                {v.weightKg} kg · {v.colli} collo
              </div>
              {v.technicalImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.technicalImage}
                  alt={`Disegno tecnico ${v.code}`}
                  className="mt-2 max-h-32 w-auto rounded-lg border border-[var(--border)] bg-white object-contain"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      {devonData.notes.length > 0 && (
        <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Note
          </h4>
          <ul className="list-inside list-disc space-y-1 text-[11px] text-[var(--text-muted)]">
            {devonData.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
