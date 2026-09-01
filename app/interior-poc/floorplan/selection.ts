// Gestione centralizzata della selezione
// Selezione a DUE livelli (layer):
//   - modalità "room": il click considera SOLO le stanze
//   - modalità "object": il click considera SOLO gli elementi della stanza attiva
//
// L'hit-test delle stanze sceglie la stanza PIÙ PICCOLA che contiene il punto:
// questo risolve le sovrapposizioni dei bounding box di regioni a forma di L.

import type { FloorPlan, Selection, SelectionMode } from "./types";
import { pointInGeometry, pointInPolygon } from "./geometry";

function polygonArea(points: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(area / 2);
}

export function hitTest(
  model: FloorPlan,
  x: number,
  y: number,
  mode: SelectionMode,
  activeRoomId: string | null
): Selection | null {
  if (mode === "object") {
    // Fase 2 — Elementi: solo quelli della stanza attiva
    const objects = activeRoomId
      ? model.objects.filter((o) => o.roomId === activeRoomId)
      : [];
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (pointInGeometry(x, y, obj.geometry)) {
        return { type: "object", id: obj.id };
      }
    }

    // Click dentro la stanza attiva ma non su un elemento:
    // mantieni la stanza selezionata.
    if (activeRoomId) {
      const room = model.rooms.find((r) => r.id === activeRoomId);
      if (room && pointInPolygon(x, y, room.geometry.points)) {
        return { type: "room", id: room.id };
      }
    }

    // Click fuori dalla stanza attiva → deseleziona
    return null;
  }

  // Fase 1 — Stanze: scegli la PIÙ PICCOLA che contiene il punto
  let best: Selection | null = null;
  let bestArea = Infinity;
  for (const room of model.rooms) {
    if (pointInPolygon(x, y, room.geometry.points)) {
      const area = polygonArea(room.geometry.points);
      if (area < bestArea) {
        bestArea = area;
        best = { type: "room", id: room.id };
      }
    }
  }
  return best;
}