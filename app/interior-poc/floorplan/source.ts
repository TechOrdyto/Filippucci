// Astrazione sorgente planimetria.
// La sorgente è SOLO il DXF: produce geometria vettoriale pura (dati),
// il modello semantico (stanze/oggetti) è separato in floorplan-model.json.

/** Linea vettoriale grezza (dal DXF) nel sistema di coordinate della pianta */
export interface VectorLine {
  id: string;
  layer: string; // "walls" | "details"
  start: [number, number];
  end: [number, number];
}

/**
 * Metadato opzionale per porte/finestre fornito da un import CAD più ricco.
 * L'attuale DXF-first continua a importare tutte le linee esattamente come
 * prima; quando il file contiene questi dati, la camera può usarli per
 * proporre punti di vista più utili.
 */
export interface FloorPlanOpeningHint {
  id: string;
  type: "door" | "window" | "french-door";
  position: [number, number];
  width: number;
  height?: number;
  wall: "north" | "south" | "east" | "west";
  exposure?: "north" | "south" | "east" | "west";
}

export interface FloorPlanGeometry {
  width: number;
  height: number;
  vectorLines: VectorLine[];
  openings?: FloorPlanOpeningHint[];
}

export interface FloorPlanSource {
  getGeometry(): FloorPlanGeometry;
}

interface DxfData {
  width: number;
  height: number;
  lines: Array<{
    layer: string;
    start: [number, number];
    end: [number, number];
  }>;
  openings?: FloorPlanOpeningHint[];
}

/**
 * CadFloorPlanSource: legge la geometria vettoriale dal DXF
 * (pre-parsato in floorplan-dxf.json) e la normalizza nel sistema
 * di coordinate della planimetria.
 *
 * Il DXF è la sorgente unica della pianta: le linee vengono disegnate
 * come layer visuale fedele, il modello semantico resta separato.
 */
export class CadFloorPlanSource implements FloorPlanSource {
  constructor(private readonly data: DxfData) {}

  getGeometry(): FloorPlanGeometry {
    return {
      width: this.data.width,
      height: this.data.height,
      vectorLines: this.data.lines.map((l, i) => ({
        id: `dxf-${i}`,
        layer: l.layer,
        start: l.start,
        end: l.end,
      })),
      openings: this.data.openings ?? [],
    };
  }
}
