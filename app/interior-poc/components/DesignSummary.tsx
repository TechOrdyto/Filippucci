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
    <div className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-3">
        {product.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-12 w-12 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-sm">
            {product.category === "Sofas" ? "🛋️" : product.category === "Tables" ? "🪑" : "📦"}
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-gray-900">{product.name}</div>
          <div className="text-xs text-gray-500">
            {product.dimensions.width}×{product.dimensions.depth}×{product.dimensions.height} cm ·{" "}
            {product.designer}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            label === "Scelto da te"
              ? "bg-blue-100 text-blue-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {label}
        </span>
        {removable && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
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
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value}/10</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

export default function DesignSummary({ proposal, onRemoveSuggested }: DesignSummaryProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">💡 Proposta di Design</h3>

      {/* Prodotti */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
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
              label="Suggerito da AI"
              removable
              onRemove={() => onRemoveSuggested?.(p.id)}
            />
          ))}
          {proposal.explicitProducts.length === 0 && proposal.suggestedProducts.length === 0 && (
            <p className="text-sm text-gray-400">Nessun prodotto selezionato</p>
          )}
        </div>
      </div>

      {/* Stile */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          Stile
        </div>
        <p className="text-sm capitalize text-gray-900">{proposal.style}</p>
      </div>

      {/* Atmosfera */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
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
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          Illuminazione
        </div>
        <p className="text-sm capitalize text-gray-900">
          {proposal.lighting.type} · {proposal.lighting.mood}
          {proposal.lighting.naturalLightEmphasis && " · luce naturale enfatizzata"}
        </p>
      </div>

      {/* Decorativi */}
      {proposal.decorativeElements.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Elementi decorativi
          </div>
          <div className="flex flex-wrap gap-2">
            {proposal.decorativeElements.map((el) => (
              <span
                key={el}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                {el}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Narrative */}
      {proposal.narrative && (
        <div className="rounded-md bg-blue-50 p-3">
          <p className="text-sm italic text-blue-900">{proposal.narrative}</p>
        </div>
      )}
    </div>
  );
}