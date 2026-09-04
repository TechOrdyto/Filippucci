"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import StudioHeader from "../interior-poc/components/StudioHeader";
import { catalog, catalogBrand } from "../interior-poc/lib/catalog";
import { getPriceEntry, getPriceLabel } from "../interior-poc/lib/pricing";
import type { Product } from "../interior-poc/lib/types";

const categoryLabels: Record<string, string> = {
  Sofas: "Divani",
  Tables: "Tavoli",
  Chairs: "Sedute",
  "Living Systems": "Sistemi living",
  Carpets: "Tappeti",
};

function labelCategory(category: string): string {
  return categoryLabels[category] ?? category;
}

function formatDimensions(product: Product): string {
  const { width, depth, height } = product.dimensions;
  return `${width} × ${depth} × ${height} cm`;
}

export default function CatalogoPageClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tutti");
  const [brand, setBrand] = useState("Tutte");
  const [subcategory, setSubcategory] = useState("Tutte");
  const [designer, setDesigner] = useState("Tutti");

  const categories = useMemo(
    () => [...new Set(catalog.map((product) => product.category))].sort(),
    []
  );
  const subcategories = useMemo(
    () => [...new Set(catalog.map((product) => product.subcategory))].sort(),
    []
  );
  const designers = useMemo(
    () => [...new Set(catalog.map((product) => product.designer))].sort(),
    []
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          product.name,
          product.sku,
          product.collection,
          product.category,
          product.subcategory,
          product.designer,
          ...product.materials,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory = category === "Tutti" || product.category === category;
      const matchesBrand = brand === "Tutte" || brand === catalogBrand;
      const matchesSubcategory =
        subcategory === "Tutte" || product.subcategory === subcategory;
      const matchesDesigner = designer === "Tutti" || product.designer === designer;
      return matchesQuery && matchesCategory && matchesBrand && matchesSubcategory && matchesDesigner;
    });
  }, [brand, category, designer, query, subcategory]);

  const resetFilters = () => {
    setQuery("");
    setCategory("Tutti");
    setBrand("Tutte");
    setSubcategory("Tutte");
    setDesigner("Tutti");
  };

  return (
    <main className="studio-shell min-h-screen">
      <StudioHeader active="catalogo" />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <section className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="eyebrow mb-3">Catalogo generale</p>
            <h1 className="display-title text-4xl leading-[0.98] text-[var(--text)] sm:text-5xl">
              Catalogo articoli.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Cerca e filtra gli articoli per tipologia, marca, collezione o designer. Per
              associare un articolo alla scena, apri la demo e seleziona un elemento nella piantina.
            </p>
          </div>
          <Link
            href="/interior-poc"
            className="primary-action inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Apri la piantina <span className="ml-2" aria-hidden="true">→</span>
          </Link>
        </section>

        <section className="panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="field-shell flex min-h-11 w-full items-center gap-3 rounded-xl px-4 lg:max-w-md">
              <span aria-hidden="true" className="text-sm text-[var(--accent)]">⌕</span>
              <span className="sr-only">Cerca nel catalogo</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca prodotto, codice o collezione"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
              />
            </label>

            <div className="flex flex-1 flex-wrap gap-2" aria-label="Filtra il catalogo">
              <button
                type="button"
                onClick={() => setCategory("Tutti")}
                aria-pressed={category === "Tutti"}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                  category === "Tutti" ? "bg-[var(--accent-strong)] text-white" : "ghost-action"
                }`}
              >
                Tutti ({catalog.length})
              </button>
              {categories.map((item) => {
                const count = catalog.filter((product) => product.category === item).length;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                      category === item
                        ? "bg-[var(--accent-strong)] text-white"
                        : "ghost-action"
                    }`}
                  >
                    {labelCategory(item)} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">
                Marca
              </span>
              <div className="relative">
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  aria-label="Filtra per marca"
                  className="field-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm text-[var(--text)] outline-none"
                >
                  <option>Tutte</option>
                  <option>{catalogBrand}</option>
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 flex h-3 w-3 -translate-y-1/2 items-center justify-center text-[var(--text-muted)]"
                  aria-hidden="true"
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 12 8" fill="none">
                    <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">
                Sottocategoria
              </span>
              <div className="relative">
                <select
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                  aria-label="Filtra per sottocategoria"
                  className="field-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm text-[var(--text)] outline-none"
                >
                  <option>Tutte</option>
                  {subcategories.map((item) => <option key={item}>{item}</option>)}
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 flex h-3 w-3 -translate-y-1/2 items-center justify-center text-[var(--text-muted)]"
                  aria-hidden="true"
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 12 8" fill="none">
                    <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">
                Designer
              </span>
              <div className="relative">
                <select
                  value={designer}
                  onChange={(event) => setDesigner(event.target.value)}
                  aria-label="Filtra per designer"
                  className="field-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm text-[var(--text)] outline-none"
                >
                  <option>Tutti</option>
                  {designers.map((item) => <option key={item}>{item}</option>)}
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 flex h-3 w-3 -translate-y-1/2 items-center justify-center text-[var(--text-muted)]"
                  aria-hidden="true"
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 12 8" fill="none">
                    <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </label>
          </div>
        </section>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Articoli disponibili</p>
            <h2 className="display-title text-2xl text-[var(--text)]">
              {filteredProducts.length} di {catalog.length} prodotti
            </h2>
          </div>
          {(query || category !== "Tutti" || brand !== "Tutte" || subcategory !== "Tutte" || designer !== "Tutti") && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
            >
              Azzera filtri
            </button>
          )}
        </div>

        {filteredProducts.length > 0 ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <article key={product.id} className="catalog-card flex flex-col rounded-2xl p-3">
                <div className="flex gap-4">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={`Foto ${product.name}`}
                      className="h-28 w-28 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-strong)] text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                      {product.category.slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 py-1">
                    <p className="eyebrow truncate">{labelCategory(product.category)}</p>
                    <h3 className="mt-1 truncate text-lg font-semibold text-[var(--text)]">{product.name}</h3>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{catalogBrand} · {product.designer}</p>
                    <p className="mt-2 text-xs text-[var(--text-soft)]">Codice {product.sku}</p>
                  </div>
                </div>

                <p className="mt-4 min-h-10 text-sm leading-5 text-[var(--text-muted)]">
                  {product.description}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-muted)] p-3 text-xs">
                  <div>
                    <span className="block text-[var(--text-soft)]">Dimensioni</span>
                    <span className="mt-1 block font-semibold text-[var(--text)]">{formatDimensions(product)}</span>
                  </div>
                  <div>
                    <span className="block text-[var(--text-soft)]">Listino</span>
                    <span className="mt-1 block font-semibold text-[var(--text)]">{getPriceLabel(getPriceEntry(product.id))}</span>
                  </div>
                </div>

                <details className="mt-3 rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  <summary className="cursor-pointer font-semibold text-[var(--text)]">Materiali e finiture</summary>
                  <p className="mt-2 leading-5">{product.materials.join(" · ") || "Da definire"}</p>
                  {product.finishes.length > 0 && <p className="mt-1 leading-5">Finiture: {product.finishes.join(" · ")}</p>}
                </details>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                  <span className="text-[11px] text-[var(--text-soft)]">{product.collection}</span>
                  <Link
                    href="/interior-poc"
                    className="ghost-action rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    Vai alla demo
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-muted mt-5 rounded-2xl border border-dashed border-[var(--border-strong)] p-10 text-center">
            <p className="text-sm text-[var(--text-muted)]">Nessun prodotto corrisponde ai filtri scelti.</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
            >
              Azzera filtri
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
