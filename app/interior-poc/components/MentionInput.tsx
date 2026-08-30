"use client";

import { useMemo, useRef, useState } from "react";
import { findProductsByQuery, parseMentions } from "../lib/catalog";
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
  placeholder = "Descrivi l'ambiente... usa @ per richiamare i prodotti del catalogo",
}: MentionInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Indice del suggerimento selezionato (per navigazione tastiera)
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Posizione del cursore nel textarea (aggiornata a ogni input)
  const cursorPositionRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => findProductsByQuery(query), [query]);

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
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-lg border border-gray-300 p-4 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Catalogo Molteni&C
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {suggestions.map((product, index) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(product)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-blue-50 ${
                    index === selectedIndex ? "bg-blue-50" : ""
                  }`}
                >
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-base">
                      {product.category === "Sofas" ? "🛋️" : product.category === "Tables" ? "🪑" : "📦"}
                    </span>
                  )}
                  <span className="flex-1">
                    <span className="block font-medium text-gray-900">{product.name}</span>
                    <span className="block text-xs text-gray-500">
                      {product.category} · {product.designer}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}