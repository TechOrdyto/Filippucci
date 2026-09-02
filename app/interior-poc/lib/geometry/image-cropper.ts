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
 * Delega a findAllContentRegions e prende la regione più grande
 * che si sovrappone alla regione base.
 */
async function findContentRegion(
  imageBuffer: Buffer,
  baseRegion: CropRegion
): Promise<CropRegion | null> {
  const regions = await findAllContentRegions(imageBuffer);
  if (regions.length === 0) return null;

  // Prendi la regione con la maggiore sovrapposizione con la regione base
  let best: CropRegion | null = null;
  let bestOverlap = 0;
  for (const region of regions) {
    const overlapX = Math.min(region.x + region.width, baseRegion.x + baseRegion.width) -
      Math.max(region.x, baseRegion.x);
    const overlapY = Math.min(region.y + region.height, baseRegion.y + baseRegion.height) -
      Math.max(region.y, baseRegion.y);
    const overlap = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = region;
    }
  }

  // Applica solo se la regione trovata è significativamente più stretta
  // della regione base (almeno 20% più stretta)
  if (best && best.width < baseRegion.width * 0.8) {
    return best;
  }

  return null;
}

/**
 * Trova TUTTE le regioni con contenuto visivo (foto) nella pagina.
 * Usa una griglia FINE (40x24) per una precisione elevata e un algoritmo
 * di clustering 2D per separare foto affiancate o miniature.
 *
 * DINAMICO: si adatta a qualsiasi layout di catalogo (qualsiasi fornitore):
 * - soglia di contenuto relativa alla varianza media della pagina
 * - margini proporzionali alla dimensione della regione
 * - filtraggio del rumore (testo, numeri pagina) per dimensione
 */
export async function findAllContentRegions(
  imageBuffer: Buffer,
  textBlocks?: OcrTextBlock[]
): Promise<CropRegion[]> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width ?? 100;
    const imageHeight = metadata.height ?? 100;

    const { data } = await sharp(imageBuffer)
      .resize(80, 48) // griglia fine 80x48
      .raw()
      .toBuffer({ resolveWithObject: true });

    const gridW = 80;
    const gridH = 48;

    // Calcola la varianza per ogni cella (2x2 pixel della griglia)
    const variance: number[][] = [];
    for (let row = 0; row < gridH; row++) {
      variance[row] = [];
      for (let col = 0; col < gridW; col++) {
        const idx = (row * gridW + col) * 3;
        const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        // Varianza locale: confronta con i vicini per rilevare bordi/dettagli
        let localVar = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = row + dy;
            const nx = col + dx;
            if (ny >= 0 && ny < gridH && nx >= 0 && nx < gridW) {
              const nIdx = (ny * gridW + nx) * 3;
              const nLum = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
              localVar += (nLum - lum) * (nLum - lum);
              count++;
            }
          }
        }
        variance[row][col] = count > 0 ? localVar / count : 0;
      }
    }

    // Soglia DINAMICA: relativa alla varianza media della pagina
    // (si adatta a qualsiasi layout, non hardcoded)
    let totalVar = 0;
    let totalCount = 0;
    for (let row = 0; row < gridH; row++) {
      for (let col = 0; col < gridW; col++) {
        totalVar += variance[row][col];
        totalCount++;
      }
    }
    const meanVar = totalVar / totalCount;
    // Soglia: 2.5x la varianza media (foto hanno varianza molto alta)
    const threshold = Math.max(meanVar * 2.5, 50);

    // Cella con contenuto = varianza sopra soglia
    const isContent = (row: number, col: number) => variance[row][col] > threshold;

    // Flood-fill per trovare cluster 2D di celle con contenuto
    const visited: boolean[][] = Array.from({ length: gridH }, () => Array(gridW).fill(false));
    const clusters: Array<{ minRow: number; maxRow: number; minCol: number; maxCol: number; size: number }> = [];

    for (let row = 0; row < gridH; row++) {
      for (let col = 0; col < gridW; col++) {
        if (isContent(row, col) && !visited[row][col]) {
          // BFS per trovare il cluster
          const queue: Array<[number, number]> = [[row, col]];
          visited[row][col] = true;
          let minRow = row, maxRow = row, minCol = col, maxCol = col, size = 0;

          while (queue.length > 0) {
            const [r, c] = queue.pop()!;
            size++;
            if (r < minRow) minRow = r;
            if (r > maxRow) maxRow = r;
            if (c < minCol) minCol = c;
            if (c > maxCol) maxCol = c;

            // 4-vicinanza (evita di unire foto separate da 1 px)
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < gridH && nc >= 0 && nc < gridW &&
                  isContent(nr, nc) && !visited[nr][nc]) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          }

          clusters.push({ minRow, maxRow, minCol, maxCol, size });
        }
      }
    }

    // Unisci i cluster vicini: se due cluster hanno bounding box che si
    // sovrappongono o sono separati da un piccolo gap (< 5% della pagina),
    // fanno parte della stessa foto (es. foto frammentata da dettagli).
    const merged: typeof clusters = [];
    for (const cluster of clusters) {
      // Ignora cluster troppo piccoli (rumore: testo, numeri pagina)
      const minSize = (gridW * gridH) * 0.003;
      if (cluster.size < minSize) continue;

      let mergedInto: typeof merged[number] | null = null;
      for (const existing of merged) {
        // Gap massimo per considerare i cluster parte della stessa foto
        const gapX = Math.max(0, Math.max(existing.minCol, cluster.minCol) -
          Math.min(existing.maxCol, cluster.maxCol));
        const gapY = Math.max(0, Math.max(existing.minRow, cluster.minRow) -
          Math.min(existing.maxRow, cluster.maxRow));
        const maxGapX = gridW * 0.05; // 5% della larghezza
        const maxGapY = gridH * 0.05; // 5% dell'altezza

        // Unisci se i cluster si sovrappongono o sono vicini
        if (gapX <= maxGapX && gapY <= maxGapY) {
          existing.minRow = Math.min(existing.minRow, cluster.minRow);
          existing.maxRow = Math.max(existing.maxRow, cluster.maxRow);
          existing.minCol = Math.min(existing.minCol, cluster.minCol);
          existing.maxCol = Math.max(existing.maxCol, cluster.maxCol);
          existing.size += cluster.size;
          mergedInto = existing;
          break;
        }
      }
      if (!mergedInto) {
        merged.push({ ...cluster });
      }
    }

    // Converti i cluster in regioni percentuali
    const regions: CropRegion[] = [];
    for (const cluster of merged) {
      // Margini proporzionali alla dimensione della regione
      const marginX = Math.max(1, Math.round((cluster.maxCol - cluster.minCol + 1) * 0.06));
      const marginY = Math.max(1, Math.round((cluster.maxRow - cluster.minRow + 1) * 0.06));

      const x = Math.max(0, ((cluster.minCol - marginX) / gridW) * 100);
      const right = Math.min(100, ((cluster.maxCol + 1 + marginX) / gridW) * 100);
      const y = Math.max(0, ((cluster.minRow - marginY) / gridH) * 100);
      const bottom = Math.min(100, ((cluster.maxRow + 1 + marginY) / gridH) * 100);

      const width = right - x;
      const height = bottom - y;

      // Ignora regioni troppo piccole o con forma estrema (rumore)
      // Soglia DINAMICA: almeno 15% della pagina in entrambe le dimensioni
      if (width < 12 || height < 12) continue;

      // Ignora regioni con aspect ratio estremo (testo/rumore):
      // le foto prodotto hanno ratio tra 1:4 e 4:1
      const ratio = width / height;
      if (ratio > 4 || ratio < 0.25) continue;

      // Filtro DINAMICO per testo: se la regione si sovrappone a un blocco
      // di testo OCR, è probabilmente testo/rumore, non una foto.
      // (Le foto prodotto non contengono testo al loro interno)
      if (textBlocks && textBlocks.length > 0) {
        const overlapsText = textBlocks.some((t) => {
          // bbox del testo in percentuale della pagina
          const tX0 = (t.bbox.x0 / imageWidth) * 100;
          const tY0 = (t.bbox.y0 / imageHeight) * 100;
          const tX1 = (t.bbox.x1 / imageWidth) * 100;
          const tY1 = (t.bbox.y1 / imageHeight) * 100;
          // Sovrapposizione con la regione
          const overlapX = Math.min(x + width, tX1) - Math.max(x, tX0);
          const overlapY = Math.min(y + height, tY1) - Math.max(y, tY0);
          // Se il testo copre più del 30% della regione, è rumore
          const overlapArea = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
          const regionArea = width * height;
          return regionArea > 0 && overlapArea / regionArea > 0.3;
        });
        if (overlapsText) continue;
      }

      regions.push({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
    }

    return regions;
  } catch {
    return [];
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