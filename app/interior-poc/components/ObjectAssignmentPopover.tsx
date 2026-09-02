"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorPlanObject } from "../floorplan/types";
import type { Product } from "../lib/types";

interface ObjectAssignmentPopoverProps {
  object: FloorPlanObject;
  roomName?: string;
  catalog: Product[];
  assignedProductId?: string;
  onAssign: (productId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

const categoryLabels: Record<string, string> = {
  Sofas: "Divani",
  Chairs: "Sedute",
  Tables: "Tavoli",
  "Living Systems": "Sistemi giorno",
  Carpets: "Tappeti",
};

export default function ObjectAssignmentPopover({
  object,
  roomName,
  catalog,
  assignedProductId,
  onAssign,
  onRemove,
  onClose,
}: ObjectAssignmentPopoverProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tutti");
  const [activeProductId, setActiveProductId] = useState<string | null>(
    assignedProductId ?? null
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      const previousElement = previousFocusRef.current;
      if (previousElement?.isConnected) {
        window.requestAnimationFrame(() => previousElement.focus());
      }
    };
  }, [object.id]);

  useEffect(() => {
    setActiveProductId(assignedProductId ?? null);
    setQuery("");
    setCategory("Tutti");
  }, [assignedProductId, object.id]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const categories = useMemo(
    () => ["Tutti", ...Array.from(new Set(catalog.map((product) => product.category)))],
    [catalog]
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalog.filter((product) => {
      const matchesCategory = category === "Tutti" || product.category === category;
      const searchableText = [
        product.name,
        product.collection,
        product.category,
        product.subcategory,
        product.designer,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [catalog, category, query]);

  const handleAssign = () => {
    if (!activeProductId) return;
    onAssign(activeProductId);
  };

  return (
    <div
      role="dialog"
      aria-labelledby={`assignment-dialog-title-${object.id}`}
      className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[min(21rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Associa un articolo</p>
            <h4
              id={`assignment-dialog-title-${object.id}`}
              className="mt-1 truncate text-sm font-semibold text-[var(--text)]"
            >
              {object.name}
            </h4>
            {roomName && <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{roomName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            aria-label="Chiudi associazione articolo"
          >
            ✕
          </button>
        </div>

        <label className="field-shell mt-3 flex items-center gap-2 rounded-lg px-3 py-2">
          <span aria-hidden="true" className="text-sm text-[var(--accent)]">⌕</span>
          <span className="sr-only">Cerca nel catalogo</span>
          <input
            type="search"
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca articolo o collezione"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
          />
        </label>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Filtra articoli">
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                category === value
                  ? "bg-[var(--accent-strong)] text-white"
                  : "ghost-action"
              }`}
            >
              {categoryLabels[value] ?? value}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredProducts.length > 0 ? (
          <div className="space-y-1">
            {filteredProducts.map((product) => {
              const selected = activeProductId === product.id;
              return (
                <button
                  key={product.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveProductId(product.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    selected
                      ? "border-[var(--accent-strong)] bg-[var(--accent-soft)]"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                      {product.category.slice(0, 3)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--text)]">
                      {product.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
                      {categoryLabels[product.category] ?? product.category} · {product.collection}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--text-soft)]">
                      {product.dimensions.width} × {product.dimensions.depth} × {product.dimensions.height} cm
                    </span>
                  </span>
                  {selected && (
                    <span className="shrink-0 text-sm font-bold text-[var(--accent-strong)]" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
            Nessun articolo corrisponde alla ricerca.
          </p>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={handleAssign}
          disabled={!activeProductId}
          className="primary-action flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {assignedProductId ? "Aggiorna articolo" : "Associa articolo"}
        </button>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] leading-4 text-[var(--text-soft)]">
            L’elemento resta generico: seleziona l’articolo catalogo da usare nel render.
          </p>
          {assignedProductId && (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 text-[10px] font-semibold text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
            >
              Rimuovi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
