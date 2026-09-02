// Stato viewport (zoom/pan) nel sistema di coordinate della planimetria
// Un'unica trasformazione uniforme garantisce l'allineamento perfetto
// tra geometria originale, stanze, mobili e selezione.

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

/**
 * Riporta la pianta alla scala neutra.
 *
 * L'SVG usa già il proprio viewBox per adattare la geometria al contenitore:
 * applicare qui anche la scala CSS significherebbe scalare due volte la
 * piantina. I parametri restano nella firma per mantenere l'API del viewer
 * e per lasciare aperta un'evoluzione verso contenitori non proporzionali.
 */
export function fitViewport(
  _planWidth: number,
  _planHeight: number,
  _containerW: number,
  _containerH: number
): Viewport {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

export function zoomAt(
  v: Viewport,
  factor: number,
  centerX: number,
  centerY: number
): Viewport {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const f = newScale / v.scale;
  return {
    scale: newScale,
    offsetX: v.offsetX + centerX * v.scale * (1 - f),
    offsetY: v.offsetY + centerY * v.scale * (1 - f),
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy };
}
