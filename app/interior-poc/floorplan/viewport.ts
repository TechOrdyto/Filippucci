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
 * Crea un viewport che adatta la pianta al contenitore.
 * La pianta (width×height) viene scalata per rientrare in containerW×containerH.
 */
export function fitViewport(
  planWidth: number,
  planHeight: number,
  containerW: number,
  containerH: number
): Viewport {
  const scale = Math.min(containerW / planWidth, containerH / planHeight);
  return {
    scale,
    offsetX: (containerW - planWidth * scale) / 2,
    offsetY: (containerH - planHeight * scale) / 2,
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