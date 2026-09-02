// Gestione centralizzata della selezione.
//
// La piantina mantiene un unico gesto: un click può selezionare direttamente
// un elemento oppure, se il punto è libero, la stanza sottostante. Il focus
// della camera viene poi aggiornato dal livello React che conosce il contesto
// della sessione.

import type { FloorPlan, Selection } from "./types";
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
  y: number
): Selection | null {
  // Gli elementi sono tutti interattivi. In caso di sovrapposizione, l'ultimo
  // elemento del modello (quello disegnato sopra) riceve il click.
  for (let i = model.objects.length - 1; i >= 0; i--) {
    const obj = model.objects[i];
    if (pointInGeometry(x, y, obj.geometry)) {
      return { type: "object", id: obj.id };
    }
  }

  // Se non c'è un elemento sotto il puntatore, seleziona la stanza più
  // piccola che contiene il punto. Questo conserva il comportamento utile
  // per i poligoni che si sovrappongono.
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
