"use client";

import type { DesignProposal, Product } from "../lib/types";

interface DesignSummaryProps {
  proposal: DesignProposal;
  onRemoveSuggested?: (productId: string) => void;
}

function ProductRow({
  product,
  label,
  removable,
  onRemove,
}: {
  product: Product;
  label: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
      <div className="flex items-center gap-3">
        {product.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            {product.category.slice(0, 3)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text)]">{product.name}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">
            {product.dimensions.width}×{product.dimensions.depth}×{product.dimensions.height} cm ·{" "}
            {product.designer}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            label === "Scelto da te"
              ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "bg-[var(--surface-strong)] text-[var(--text-muted)]"
          }`}
        >
          {label}
        </span>
        {removable && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-[var(--text-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
            aria-label={`Rimuovi ${product.name}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-medium text-[var(--text)]">{value}/10</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

function readableStyle(value: string) {
  const labels: Record<string, string> = {
    "italian-minimal": "Minimal italiano",
    contemporary: "Contemporaneo",
    architectural: "Architettonico",
  };
  return labels[value] ?? value.replaceAll("-", " ");
}

function readableLighting(value: string) {
  const labels: Record<string, string> = {
    natural: "naturale",
    artificial: "artificiale",
    mixed: "naturale e artificiale",
    bright: "luminosa",
    warm: "calda",
    neutral: "neutra",
    soft: "morbida",
  };
  return labels[value] ?? value.replaceAll("-", " ");
}

export default function DesignSummary({ proposal, onRemoveSuggested }: DesignSummaryProps) {
  return (
    <section className="panel rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Riepilogo della proposta</p>
          <h3 className="display-title text-2xl text-[var(--text)]">Queste sono le scelte inserite.</h3>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--accent)]">✦</span>
      </div>

      {/* Prodotti */}
      <div className="mb-4">
        <div className="eyebrow mb-2">
          Prodotti
        </div>
        <div className="space-y-2">
          {proposal.explicitProducts.map((p) => (
            <ProductRow key={p.id} product={p} label="Scelto da te" />
          ))}
          {proposal.suggestedProducts.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              label="Suggerito"
              removable
              onRemove={() => onRemoveSuggested?.(p.id)}
            />
          ))}
          {proposal.explicitProducts.length === 0 && proposal.suggestedProducts.length === 0 && (
            <p className="text-sm text-[var(--text-soft)]">Nessun prodotto selezionato</p>
          )}
        </div>
      </div>

      {/* Stile */}
      <div className="mb-4">
        <div className="eyebrow mb-2">
          Stile
        </div>
        <p className="text-sm capitalize text-[var(--text)]">{readableStyle(proposal.style)}</p>
      </div>

      {/* Atmosfera */}
      <div className="mb-4">
        <div className="eyebrow mb-2">
          Atmosfera
        </div>
        <div className="space-y-2">
          <Meter label="Caldo" value={proposal.atmosphere.warmth} />
          <Meter label="Elegante" value={proposal.atmosphere.elegance} />
          <Meter label="Minimal" value={proposal.atmosphere.minimalism} />
          <Meter label="Accogliente" value={proposal.atmosphere.cozy} />
        </div>
      </div>

      {/* Illuminazione */}
      <div className="mb-4">
        <div className="eyebrow mb-2">
          Illuminazione
        </div>
        <p className="text-sm capitalize text-[var(--text)]">
          Luce {readableLighting(proposal.lighting.type)} · atmosfera {readableLighting(proposal.lighting.mood)}
          {proposal.lighting.naturalLightEmphasis && " · molta luce naturale"}
        </p>
      </div>

      {/* Decorativi */}
      {proposal.decorativeElements.length > 0 && (
        <div className="mb-4">
          <div className="eyebrow mb-2">
            Elementi decorativi
          </div>
          <div className="flex flex-wrap gap-2">
            {proposal.decorativeElements.map((el) => (
              <span
                key={el}
                className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
              >
                {el}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Narrative */}
      {proposal.narrative && (
        <div className="rounded-xl bg-[var(--accent-soft)] p-4">
          <p className="text-sm italic leading-6 text-[var(--accent-strong)]">{proposal.narrative}</p>
        </div>
      )}
    </section>
  );
}
