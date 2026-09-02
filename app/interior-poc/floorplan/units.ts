// Conversioni semantiche per il sistema di coordinate della piantina.
//
// La sorgente DXF resta volutamente invariata: il suo import usa le unità
// "piano" prodotte dallo script import-dxf (1 unità piano = 1 cm). Queste
// funzioni servono solo quando dobbiamo parlare con la camera o con il
// generatore in metri.

/** Quante unità della piantina corrispondono a un metro. */
export const PLAN_UNITS_PER_METER = 100;

export function planUnitsToMeters(value: number): number {
  return value / PLAN_UNITS_PER_METER;
}

export function planAreaToSquareMeters(value: number): number {
  return value / (PLAN_UNITS_PER_METER * PLAN_UNITS_PER_METER);
}

export function roundMeters(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
