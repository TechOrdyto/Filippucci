// Step 6a: Persiste il floorplan validato
// Salva il floorplan in data/ingestion/floorplans/ e aggiorna il floorplan attivo

import type { SagaContext, FloorplanInterpretation } from "../types";
import { createStep } from "../saga";
import { saveFloorplan, deleteFile } from "../store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const persistFloorplanStep = createStep(
  "persist-floorplan",
  async (ctx: SagaContext) => {
    const interpretation = ctx.interpretation as FloorplanInterpretation;
    if (!interpretation) {
      throw new Error("Nessuna interpretazione floorplan disponibile");
    }

    // Costruisci il floorplan finale
    const floorplan = {
      id: "piano-rialzato",
      name: "Piano Rialzato",
      unit: "m",
      dimensions: interpretation.dimensions,
      ceilingHeight: interpretation.ceilingHeight,
      rooms: interpretation.rooms.map((room, i) => ({
        id: `room-${i + 1}`,
        name: room.name,
        area: room.area ?? Math.round(room.bounds.width * room.bounds.height * 100) / 100,
        bounds: room.bounds,
        openings: interpretation.openings.filter(
          (o) => o.position.x >= room.bounds.x && o.position.x <= room.bounds.x + room.bounds.width
        ),
      })),
    };

    // Salva nello store
    const storedPath = saveFloorplan(ctx.documentId, floorplan);

    // Aggiorna il floorplan attivo usato dall'app
    const activePath = resolve(process.cwd(), "app/interior-poc/data/floorplan.json");
    writeFileSync(activePath, JSON.stringify(floorplan, null, 2));

    return { storedPath, activePath };
  },
  async (ctx: SagaContext, result: { storedPath: string; activePath: string }) => {
    deleteFile(result.storedPath);
    // Nota: non rimuoviamo il floorplan attivo (potrebbe essere l'unico)
  },
  (ctx) => `${ctx.documentId}:persist-floorplan`
);