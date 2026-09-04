"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StudioHeader from "../interior-poc/components/StudioHeader";
import { catalogBrand, findProductById } from "../interior-poc/lib/catalog";
import {
  formatPrice,
  getPriceEntry,
  getPriceLabel,
  priceList,
} from "../interior-poc/lib/pricing";
import {
  clearProjectSession,
  readProjectSession,
  type ProjectSessionSnapshot,
} from "../interior-poc/lib/project-session";
import floorplanModelData from "../interior-poc/data/floorplan-model-casa-enri.json";

interface QuoteLine {
  productId: string;
  name: string;
  sku: string;
  image: string | null;
  quantity: number;
  rooms: string[];
  unitAmount: number | null;
  unitLabel: string;
  lineTotal: number | null;
}

const roomModel = floorplanModelData as {
  rooms: Array<{ id: string; name: string }>;
  objects: Array<{ id: string; roomId: string }>;
};

function getRoomName(roomId: string): string {
  return roomModel.rooms.find((room) => room.id === roomId)?.name ?? "Ambiente non nominato";
}

export default function ListiniPageClient() {
  const [session, setSession] = useState<ProjectSessionSnapshot | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSession(readProjectSession());
    setIsLoaded(true);
  }, []);

  const quoteLines = useMemo<QuoteLine[]>(() => {
    if (!session) return [];

    const grouped = new Map<string, QuoteLine>();
    for (const [objectId, productId] of Object.entries(session.objectAssignments)) {
      const product = findProductById(productId);
      if (!product) continue;

      const object = roomModel.objects.find((item) => item.id === objectId);
      const roomName = getRoomName(object?.roomId ?? "");
      const existing = grouped.get(product.id);
      const price = getPriceEntry(product.id);

      if (existing) {
        existing.quantity += 1;
        if (!existing.rooms.includes(roomName)) existing.rooms.push(roomName);
        existing.lineTotal =
          existing.unitAmount === null ? null : existing.unitAmount * existing.quantity;
      } else {
        grouped.set(product.id, {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          image: product.images?.[0] ?? null,
          quantity: 1,
          rooms: [roomName],
          unitAmount: price.amount,
          unitLabel: getPriceLabel(price),
          lineTotal: price.amount === null ? null : price.amount,
        });
      }
    }

    return [...grouped.values()];
  }, [session]);

  const pricedSubtotal = quoteLines.reduce(
    (total, line) => total + (line.lineTotal ?? 0),
    0
  );
  const hasPricedLines = quoteLines.some((line) => line.lineTotal !== null);
  const hasUnpricedLines = quoteLines.some((line) => line.lineTotal === null);
  const vat = pricedSubtotal * (priceList.vatRate / 100);
  const total = pricedSubtotal + vat;

  const handleClear = () => {
    if (!window.confirm("Vuoi svuotare il progetto demo e il relativo listino?")) return;
    clearProjectSession();
    setSession(null);
  };

  return (
    <main className="studio-shell min-h-screen">
      <StudioHeader active="listini" />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <section className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="eyebrow mb-3">Articoli selezionati</p>
            <h1 className="display-title text-4xl leading-[0.98] text-[var(--text)] sm:text-5xl">
              Riepilogo articoli e prezzi.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Qui trovi gli articoli associati nella piantina, con quantità, prezzi e totale del
              progetto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href="/interior-poc" className="ghost-action rounded-xl px-4 py-3 text-sm font-semibold">
              ← Torna alla demo
            </Link>
            {quoteLines.length > 0 && (
              <button
                type="button"
                onClick={() => window.print()}
                className="primary-action rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Stampa / PDF
              </button>
            )}
          </div>
        </section>

        {!isLoaded ? null : quoteLines.length === 0 ? (
          <section className="panel rounded-2xl p-8 text-center sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-muted)] text-2xl text-[var(--accent-strong)]">
              +
            </div>
            <p className="eyebrow mt-5 mb-2">Nessun articolo associato</p>
            <h2 className="display-title text-2xl text-[var(--text)]">Associa gli articoli dalla piantina.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--text-muted)]">
              Seleziona un ambiente nella demo e associa gli articoli agli elementi. Il listino
              verrà aggiornato qui.
            </p>
            <Link
              href="/interior-poc"
              className="primary-action mt-6 inline-flex rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Apri la piantina <span className="ml-2" aria-hidden="true">→</span>
            </Link>
          </section>
        ) : (
          <>
            <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="panel overflow-hidden rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
                  <div>
                    <p className="eyebrow mb-2">Articoli associati</p>
                    <h2 className="display-title text-2xl text-[var(--text)]">{catalogBrand}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {quoteLines.length} {quoteLines.length === 1 ? "articolo" : "articoli"} distinti · listino {priceList.version}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs font-semibold text-[var(--text-soft)] underline underline-offset-4 hover:text-[var(--text)] print:hidden"
                  >
                    Svuota progetto
                  </button>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-soft)]">
                        <th className="pb-3 pr-3">Articolo</th>
                        <th className="pb-3 pr-3">Ambiente</th>
                        <th className="pb-3 pr-3 text-center">Qtà</th>
                        <th className="pb-3 pr-3 text-right">Prezzo</th>
                        <th className="pb-3 text-right">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteLines.map((line) => (
                        <tr key={line.productId} className="border-b border-[var(--border)] align-top last:border-0">
                          <td className="py-4 pr-3">
                            <div className="flex items-center gap-3">
                              {line.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={line.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                              ) : (
                                <div className="h-12 w-12 rounded-lg bg-[var(--surface-muted)]" />
                              )}
                              <div>
                                <p className="text-sm font-semibold text-[var(--text)]">{line.name}</p>
                                <p className="mt-1 text-[11px] text-[var(--text-soft)]">{line.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 pr-3 text-xs leading-5 text-[var(--text-muted)]">{line.rooms.join(" · ")}</td>
                          <td className="py-4 pr-3 text-center text-sm font-semibold text-[var(--text)]">{line.quantity}</td>
                          <td className="py-4 pr-3 text-right text-xs text-[var(--text-muted)]">{line.unitLabel}</td>
                          <td className="py-4 text-right text-sm font-semibold text-[var(--text)]">
                            {line.lineTotal === null ? "Da definire" : formatPrice(line.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="panel h-fit rounded-2xl p-5 sm:p-6">
                <p className="eyebrow mb-2">Riepilogo economico</p>
                <h2 className="display-title text-2xl text-[var(--text)]">Totale progetto</h2>

                <dl className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4 text-[var(--text-muted)]">
                    <dt>Articoli valorizzati</dt>
                    <dd className="font-semibold text-[var(--text)]">
                      {hasPricedLines ? formatPrice(pricedSubtotal) : "Da definire"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[var(--text-muted)]">
                    <dt>IVA {priceList.vatRate}%</dt>
                    <dd className="font-semibold text-[var(--text)]">
                      {hasPricedLines ? formatPrice(vat) : "Da definire"}
                    </dd>
                  </div>
                  <div className="border-t border-[var(--border)] pt-4">
                    <div className="flex items-end justify-between gap-4">
                      <dt className="text-sm font-semibold text-[var(--text)]">Totale</dt>
                      <dd className="text-2xl font-semibold text-[var(--text)]">
                        {hasUnpricedLines ? "Da definire" : formatPrice(total)}
                      </dd>
                    </div>
                  </div>
                </dl>

                {hasUnpricedLines && (
                  <p className="mt-5 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-3 text-xs leading-5 text-[var(--text-muted)]">
                    Alcuni articoli non hanno ancora un prezzo nel listino locale. Il totale sarà
                    disponibile quando verrà collegato il listino ufficiale.
                  </p>
                )}

                <div className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--text-soft)]">
                  <p>Valuta: EUR · versione: {priceList.version}</p>
                  <p className="mt-1">Le quantità derivano dalle associazioni salvate nella piantina.</p>
                </div>
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
