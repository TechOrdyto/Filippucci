// Risoluzione delle quote dimensionali
// Le quote mancanti vengono ottenute per sottrazione dai totali
// Es: totale nord 15.10 - (3.62 + 2.61 + 1.65) = 7.22

import type { Quote } from "../ingestion/types";

export interface QuoteSolverResult {
  quotes: Quote[];
  warnings: string[];
}

/**
 * Risolve le quote mancanti per sottrazione dai totali
 * @param rawQuotes Quote estratte dall'OCR (con valori)
 * @param totalWidth Larghezza totale (dalle frecce esterne)
 * @param totalHeight Altezza totale (dalle frecce esterne)
 */
export function solveQuotes(
  rawQuotes: Array<{ value: number; axis: "x" | "y"; position: number }>,
  totalWidth: number,
  totalHeight: number
): QuoteSolverResult {
  const warnings: string[] = [];
  const quotes: Quote[] = [];

  // Separa quote per asse
  const xQuotes = rawQuotes.filter((q) => q.axis === "x").sort((a, b) => a.position - b.position);
  const yQuotes = rawQuotes.filter((q) => q.axis === "y").sort((a, b) => a.position - b.position);

  // Risolvi quote X (larghezze)
  const solvedX = solveAxis(xQuotes, totalWidth, "x", warnings);
  // Risolvi quote Y (altezze)
  const solvedY = solveAxis(yQuotes, totalHeight, "y", warnings);

  quotes.push(...solvedX, ...solvedY);

  return { quotes, warnings };
}

function solveAxis(
  axisQuotes: Array<{ value: number; axis: "x" | "y"; position: number }>,
  total: number,
  axis: "x" | "y",
  warnings: string[]
): Quote[] {
  const result: Quote[] = [];
  const known = axisQuotes.filter((q) => q.value > 0);

  // Calcola la somma delle quote note
  const knownSum = known.reduce((s, q) => s + q.value, 0);

  // Se la somma delle note è < totale, c'è una quota mancante
  if (knownSum < total - 0.05) {
    const missing = Math.round((total - knownSum) * 100) / 100;
    warnings.push(
      `Quota mancante su asse ${axis.toUpperCase()}: ${missing}m (derivata per sottrazione: ${total} - ${knownSum.toFixed(2)})`
    );

    // Aggiungi la quota derivata alla fine
    result.push({
      value: missing,
      axis,
      start: knownSum,
      end: total,
      source: "derived",
    });
  }

  // Aggiungi le quote note con posizioni cumulative
  let cursor = 0;
  for (const q of known) {
    result.push({
      value: q.value,
      axis,
      start: cursor,
      end: cursor + q.value,
      source: "ocr",
    });
    cursor += q.value;
  }

  // Verifica coerenza
  const finalSum = result.reduce((s, q) => s + q.value, 0);
  if (Math.abs(finalSum - total) > 0.1) {
    warnings.push(
      `Incoerenza quote su asse ${axis.toUpperCase()}: somma ${finalSum.toFixed(2)} vs totale ${total}`
    );
  }

  return result;
}

/**
 * Verifica che le quote siano coerenti con le dimensioni totali
 */
export function validateQuotes(quotes: Quote[], totalWidth: number, totalHeight: number): string[] {
  const errors: string[] = [];

  const xSum = quotes.filter((q) => q.axis === "x").reduce((s, q) => s + q.value, 0);
  const ySum = quotes.filter((q) => q.axis === "y").reduce((s, q) => s + q.value, 0);

  if (Math.abs(xSum - totalWidth) > 0.1) {
    errors.push(`Somma quote X (${xSum.toFixed(2)}) ≠ larghezza totale (${totalWidth})`);
  }
  if (Math.abs(ySum - totalHeight) > 0.1) {
    errors.push(`Somma quote Y (${ySum.toFixed(2)}) ≠ altezza totale (${totalHeight})`);
  }

  return errors;
}