"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { catalog, parseMentions } from "../lib/catalog";
import type { Product, ProductMention } from "../lib/types";

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange?: (mentions: ProductMention[]) => void;
  placeholder?: string;
}

export default function MentionInput({
  value,
  onChange,
  onMentionsChange,
  placeholder = "Scrivi le indicazioni per il progetto... per aggiungere un prodotto, usa @",
}: MentionInputProps) {
  const categoryLabels: Record<string, string> = {
    Sofas: "Divani",
    Tables: "Tavoli",
    Chairs: "Sedie",
    "Living Systems": "Sistemi giorno",
  };
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set()
  );
  // Indice del suggerimento selezionato (per navigazione tastiera)
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Posizione del cursore nel textarea (aggiornata a ogni input)
  const cursorPositionRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { suggestions, groupedSuggestions } = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filteredProducts = catalog.filter((product) =>
      product.name.toLowerCase().includes(normalizedQuery)
    );
    const groups = new Map<string, Product[]>();

    for (const product of filteredProducts) {
      const productsInCategory = groups.get(product.category) ?? [];
      productsInCategory.push(product);
      groups.set(product.category, productsInCategory);
    }

    return {
      suggestions: filteredProducts,
      groupedSuggestions: Array.from(groups, ([category, products]) => ({
        category,
        products,
      })),
    };
  }, [query]);

  useEffect(() => {
    if (!query.trim()) return;
    setOpenCategories(new Set(groupedSuggestions.map((group) => group.category)));
  }, [groupedSuggestions, query]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursor = e.target.selectionStart ?? 0;
    onChange(newValue);
    cursorPositionRef.current = newCursor;

    // Detect @ mention in progress
    const textBeforeCursor = newValue.slice(0, newCursor);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1 && atIndex >= 0) {
      const mentionText = textBeforeCursor.slice(atIndex + 1);
      // Only show suggestions if no space after @ (unless multi-word product)
      if (mentionText.length >= 0) {
        setQuery(mentionText);
        setIsOpen(true);
        setSelectedIndex(0);
      }
    } else {
      setIsOpen(false);
    }

    // Update mentions
    if (onMentionsChange) {
      onMentionsChange(parseMentions(newValue));
    }
  };

  const handleSelect = (product: Product) => {
    // Usa la posizione del cursore salvata nel ref (non lo stato selectedIndex)
    const cursorPos = cursorPositionRef.current;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = value.slice(cursorPos);

    // Replace the partial mention with the full product name
    const newValue =
      textBeforeCursor.slice(0, atIndex) + `@${product.name}` + " " + textAfterCursor;

    onChange(newValue);
    setIsOpen(false);
    setQuery("");

    if (onMentionsChange) {
      onMentionsChange(parseMentions(newValue));
    }

    // Focus back on textarea
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const pos = atIndex + product.name.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      cursorPositionRef.current = pos;
    });
  };

  const toggleCategory = (category: string) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelect(suggestions[selectedIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="relative">
      <label htmlFor="design-brief" className="sr-only">
        Descrizione della stanza
      </label>
      <textarea
        id="design-brief"
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        aria-label="Descrizione della stanza"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        className="field-shell min-h-32 w-full resize-y rounded-xl px-4 py-4 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--text-soft)] focus:outline-none"
      />

      {isOpen && (
        <div className="panel absolute left-0 top-0 z-30 mt-2 w-full overflow-hidden rounded-xl lg:left-[calc(100%+0.75rem)] lg:mt-0 lg:w-80" role="dialog" aria-label="Scegli un prodotto">
          <div className="border-b border-[var(--border)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Aggiungi un prodotto</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Cerca nella collezione per nome.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs text-[var(--text-soft)] hover:text-[var(--text)]"
                aria-label="Chiudi elenco prodotti"
              >
                Chiudi
              </button>
            </div>
            <label className="field-shell flex items-center gap-2 rounded-lg px-3 py-2">
              <span aria-hidden="true" className="text-sm text-[var(--accent)]">⌕</span>
              <span className="sr-only">Cerca prodotto per nome</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Cerca per nome..."
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
              />
            </label>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {groupedSuggestions.map(({ category, products }) => (
              <section key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={openCategories.has(category)}
                  aria-controls={`products-${category.toLowerCase().replaceAll(" ", "-")}`}
                  className="sticky top-0 z-[1] flex w-full items-center justify-between border-b border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)] hover:bg-[var(--surface-strong)]"
                >
                  <span>{categoryLabels[category] ?? category}</span>
                  <span className="flex items-center gap-2 text-[var(--text-soft)]">
                    {products.length}
                    <span aria-hidden="true" className={`transition-transform ${openCategories.has(category) ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </span>
                </button>
                {openCategories.has(category) && (
                  <ul id={`products-${category.toLowerCase().replaceAll(" ", "-")}`}>
                    {products.map((product) => {
                    const productIndex = suggestions.findIndex((item) => item.id === product.id);
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(product)}
                          onMouseEnter={() => setSelectedIndex(productIndex)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-[var(--surface-muted)] ${
                            productIndex === selectedIndex ? "bg-[var(--surface-muted)]" : ""
                          }`}
                        >
                          {product.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                              {product.category.slice(0, 3)}
                            </span>
                          )}
                          <span className="flex-1">
                            <span className="block font-semibold text-[var(--text)]">{product.name}</span>
                            <span className="block text-xs text-[var(--text-muted)]">
                              {categoryLabels[product.category] ?? product.category} · {product.designer}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
          {suggestions.length === 0 && (
            <p className="px-4 py-5 text-center text-xs text-[var(--text-muted)]">
              Nessun prodotto trovato con questo nome.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
