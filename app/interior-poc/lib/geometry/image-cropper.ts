// Ritaglio deterministico delle immagini prodotto dal catalogo
// Usa i bounding box del testo OCR per trovare la regione SENZA testo
// (dove sta l'immagine del prodotto)

import type { OcrTextBlock } from "../ingestion/types";

export interface CropRegion {
  x: number; // percentuale 0-100
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  region: CropRegion;
  verified: boolean;
  method: "deterministic" | "fallback";
}

/**
 * Trova la regione immagine (senza testo) in una pagina catalogo
 * @param textBlocks Blocchi testo OCR della pagina
 * @param imageSize Dimensioni immagine in pixel
 * @param productName Nome del prodotto (per vincolare la ricerca)
 */
export function findProductImageRegion(
  textBlocks: OcrTextBlock[],
  imageSize: { width: number; height: number },
  productName?: string
): CropResult {
  const { width, height } = imageSize;

  // 1. Trova il blocco del nome prodotto (testo più grande in alto)
  const nameBlock = findProductNameBlock(textBlocks, productName);

  // 2. Trova la didascalia (testo sotto l'immagine)
  const captionBlock = findCaptionBlock(textBlocks, nameBlock);

  // 3. La regione immagine è tra il nome e la didascalia
  const top = nameBlock ? nameBlock.bbox.y1 : height * 0.15;
  const bottom = captionBlock ? captionBlock.bbox.y0 : height * 0.85;

  // 4. Verifica che la regione non contenga testo (densità)
  const regionText = textBlocks.filter(
    (t) => t.bbox.y0 > top && t.bbox.y1 < bottom && t.bbox.x0 > width * 0.05 && t.bbox.x1 < width * 0.95
  );

  // Se c'è testo nella regione, restringi
  let finalTop = top;
  let finalBottom = bottom;
  if (regionText.length > 0) {
    // Prendi la zona più grande senza testo
    const gaps = findLargestTextGap(regionText, top, bottom);
    finalTop = gaps.top;
    finalBottom = gaps.bottom;
  }

  // Converti in percentuali
  const region: CropRegion = {
    x: 5,
    y: Math.round((finalTop / height) * 100),
    width: 90,
    height: Math.round(((finalBottom - finalTop) / height) * 100),
  };

  // Verifica: la regione deve essere almeno 30% dell'altezza
  const verified = region.height >= 30;

  return {
    region,
    verified,
    method: "deterministic",
  };
}

function findProductNameBlock(
  textBlocks: OcrTextBlock[],
  productName?: string
): OcrTextBlock | null {
  if (productName) {
    const match = textBlocks.find((t) =>
      t.text.toLowerCase().includes(productName.toLowerCase())
    );
    if (match) return match;
  }

  // Fallback: il blocco più grande nella parte alta (primo 40%)
  const upperBlocks = textBlocks.filter((t) => t.center.y < textBlocks[0]?.bbox.y1 + 100);
  if (upperBlocks.length === 0) return null;

  return upperBlocks.reduce((max, t) => (t.bbox.y1 - t.bbox.y0 > max.bbox.y1 - max.bbox.y0 ? t : max));
}

function findCaptionBlock(
  textBlocks: OcrTextBlock[],
  nameBlock: OcrTextBlock | null
): OcrTextBlock | null {
  const startY = nameBlock ? nameBlock.bbox.y1 : 0;
  const below = textBlocks.filter((t) => t.bbox.y0 > startY);

  if (below.length === 0) return null;

  // La didascalia è il primo blocco sotto l'immagine (dopo un gap)
  return below[0];
}

function findLargestTextGap(
  textBlocks: OcrTextBlock[],
  top: number,
  bottom: number
): { top: number; bottom: number } {
  const sorted = [...textBlocks].sort((a, b) => a.bbox.y0 - b.bbox.y0);

  let largestGap = 0;
  let gapTop = top;
  let gapBottom = bottom;

  let prev = top;
  for (const block of sorted) {
    const gap = block.bbox.y0 - prev;
    if (gap > largestGap) {
      largestGap = gap;
      gapTop = prev;
      gapBottom = block.bbox.y0;
    }
    prev = block.bbox.y1;
  }

  // Gap finale
  const finalGap = bottom - prev;
  if (finalGap > largestGap) {
    gapTop = prev;
    gapBottom = bottom;
  }

  return { top: gapTop, bottom: gapBottom };
}