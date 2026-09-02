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
  prices: Record<string, Record<string, number>>;
  technicalImage?: string;
}

interface DevonData {
  name: string;
  designer: string;
  year: number;
  collection: string;
  description: string;
  materials: Record<string, string>;
  finishes: { base: string[]; upholstery: string[] };
  variants: DevonVariant[];
  notes: string[];
}

interface ProductDetailProps {
  product: Product;
}

// Etichette per le categorie di rivestimento
const CATEGORY_LABELS: Record<string, string> = {
  tessuto: "Tessuto",
  pelle: "Pelle",
  tessutoMt: "Tessuto mt",
};

/**
 * Dettaglio prodotto: mostra la base dati completa quando un prodotto
 * viene selezionato. Per DEVON include varianti, misure e prezzi dal listino.
 */
export default function ProductDetail({ product }: ProductDetailProps) {
  const [devonData, setDevonData] = useState<DevonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  useEffect(() => {
    const isDevon = product.name.toLowerCase() === "devon";
    if (!isDevon) {
      setDevonData(null);
      return;
    }

    setLoading(true);
    fetch(`/interior-poc/api/products/${product.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setDevonData(data?.devon ?? null);
        if (data?.devon?.variants?.length > 0) {
          setSelectedVariant(data.devon.variants[0].code);
        }
      })
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

  const selected = devonData.variants.find((v) => v.code === selectedVariant) ?? devonData.variants[0];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">{devonData.name}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {devonData.designer} · {devonData.year} · {devonData.collection}
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
        {devonData.description}
      </p>

      {/* Selettore variante */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Varianti ({devonData.variants.length})
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {devonData.variants.map((v) => (
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

      {/* Dettaglio variante selezionata */}
      {selected && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[var(--text)]">
                {selected.code} <span className="ml-1 font-normal text-[var(--text-muted)]">{selected.type}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
                <span>Larghezza: <b className="text-[var(--text)]">{selected.dimensions.width} cm</b></span>
                <span>Profondità: <b className="text-[var(--text)]">{selected.dimensions.depth} cm</b></span>
                <span>Altezza: <b className="text-[var(--text)]">{selected.dimensions.height} cm</b></span>
                <span>Peso: <b className="text-[var(--text)]">{selected.weightKg} kg</b></span>
              </div>

              {/* Tabella prezzi per rivestimento e colore */}
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
                      {Object.entries(selected.prices).map(([category, colors]) =>
                        Object.entries(colors).map(([color, price]) => (
                          <tr key={`${category}-${color}`} className="border-t border-[var(--border)]">
                            <td className="px-2 py-1 text-[var(--text-muted)]">
                              {CATEGORY_LABELS[category] ?? category}
                            </td>
                            <td className="px-2 py-1 font-semibold text-[var(--text)]">{color}</td>
                            <td className="px-2 py-1 text-right font-semibold text-[var(--accent-strong)]">
                              €{price.toLocaleString("it-IT")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {selected.technicalImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.technicalImage}
                alt={`Disegno tecnico ${selected.code}`}
                className="h-40 w-auto shrink-0 rounded-lg border border-[var(--border)] bg-white object-contain"
              />
            )}
          </div>
        </div>
      )}

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
