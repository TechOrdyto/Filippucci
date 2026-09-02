import priceListData from "../data/price-list.json";

export type PriceMode = "fixed" | "starting-from" | "on-request";

export interface PriceEntry {
  productId: string;
  amount: number | null;
  mode: PriceMode;
  currency: string;
  vatIncluded: boolean;
  note?: string;
}

export interface PriceList {
  id: string;
  name: string;
  brand: string;
  version: string;
  currency: string;
  vatRate: number;
  prices: PriceEntry[];
  notes?: string;
}

export const priceList = priceListData as PriceList;

export function getPriceEntry(productId: string): PriceEntry {
  return (
    priceList.prices.find((entry) => entry.productId === productId) ?? {
      productId,
      amount: null,
      mode: "on-request",
      currency: priceList.currency,
      vatIncluded: false,
    }
  );
}

export function formatPrice(amount: number | null, currency = priceList.currency): string {
  if (amount === null) return "Prezzo su richiesta";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getPriceLabel(entry: PriceEntry): string {
  if (entry.amount === null || entry.mode === "on-request") return "Prezzo su richiesta";
  const formatted = formatPrice(entry.amount, entry.currency);
  return entry.mode === "starting-from" ? `A partire da ${formatted}` : formatted;
}
