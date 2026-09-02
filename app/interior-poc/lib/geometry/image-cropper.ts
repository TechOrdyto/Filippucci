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
export async function findProductImageRegion(
  textBlocks: OcrTextBlock[],
  imageSize: { width: number; height: number },
  productName?: string,
  imageBuffer?: Buffer
): Promise<CropResult> {
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
  let region: CropRegion = {
    x: 5,
    y: Math.round((finalTop / height) * 100),
    width: 90,
    height: Math.round(((finalBottom - finalTop) / height) * 100),
  };

  // 5. Analisi del contenuto visivo: se l'immagine è disponibile,
  //    restringi la regione alla zona dove c'è effettivamente la foto.
  //    (Es. pagina con foto solo a destra: il fallback base prende tutto)
  if (imageBuffer) {
    const contentRegion = await findContentRegion(imageBuffer, region);
    if (contentRegion) {
      region = contentRegion;
    }
  }

  // Verifica: la regione deve essere almeno 30% dell'altezza
  const verified = region.height >= 30;

  return {
    region,
    verified,
    method: "deterministic",
  };
}

/**
 * Analizza la distribuzione del contenuto visivo dell'immagine
 * per restringere la regione alla zona dove c'è la foto.
 * Usa la varianza dei pixel: alta varianza = foto/dettagli,
 * bassa varianza = area chiara/uniforme (testo o sfondo).
 */
async function findContentRegion(
  imageBuffer: Buffer,
  baseRegion: CropRegion
): Promise<CropRegion | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(imageBuffer)
      .resize(100, 62) // griglia 100x62 per l'analisi
      .raw()
      .toBuffer({ resolveWithObject: true });

    const gridW = 100;
    const gridH = 62;

    // Calcola la varianza per ogni cella della griglia (10x6)
    const cellW = 10;
    const cellH = 10;
    const variance: number[][] = [];
    for (let row = 0; row < 6; row++) {
      variance[row] = [];
      for (let col = 0; col < 10; col++) {
        let sum = 0, sumSq = 0, count = 0;
        for (let y = row * cellH; y < (row + 1) * cellH; y++) {
          for (let x = col * cellW; x < (col + 1) * cellW; x++) {
            const idx = (y * gridW + x) * 3;
            const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            sum += lum;
            sumSq += lum * lum;
            count++;
          }
        }
        const mean = sum / count;
        variance[row][col] = sumSq / count - mean * mean;
      }
    }

    // Trova le colonne con contenuto (varianza alta)
    const colContent = Array(10).fill(0);
    for (let col = 0; col < 10; col++) {
      for (let row = 0; row < 6; row++) {
        if (variance[row][col] > 400) colContent[col]++;
      }
    }

    // Trova il range di colonne con contenuto significativo
    let firstContent = -1;
    let lastContent = -1;
    for (let col = 0; col < 10; col++) {
      if (colContent[col] >= 2) {
        if (firstContent === -1) firstContent = col;
        lastContent = col;
      }
    }

    // Se non c'è contenuto rilevante, mantieni la regione base
    if (firstContent === -1 || lastContent === -1) return null;

    // Converti in percentuali (con margine)
    const x = Math.max(0, (firstContent / 10) * 100 - 2);
    const right = Math.min(100, ((lastContent + 1) / 10) * 100 + 2);
    const width = right - x;

    // Applica solo se la regione trovata è significativamente più stretta
    // della regione base (almeno 20% più stretta)
    if (width < baseRegion.width * 0.8) {
      return {
        x: Math.round(x),
        y: baseRegion.y,
        width: Math.round(width),
        height: baseRegion.height,
      };
    }

    return null;
  } catch {
    return null;
  }
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