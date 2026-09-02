"use client";

import { useState } from "react";
import type { Action, FloorPlan, Selection } from "./types";
import { addAction, removeAction } from "./model";
import floorPlanModelData from "../data/floorplan-model-casa-enri.json";

/**
 * Normalizza il modello JSON: i punti dei poligoni arrivano come number[][]
 * dal JSON, ma il tipo richiede tuple [number, number][].
 */
function normalizeModel(raw: any): FloorPlan {
  return {
    ...raw,
    rooms: (raw.rooms ?? []).map((room: any) => ({
      ...room,
      geometry: {
        ...room.geometry,
        points: (room.geometry?.points ?? []).map((p: number[]) => [p[0], p[1]] as [number, number]),
      },
    })),
  };
}

export function useFloorPlan() {
  const [model, setModel] = useState<FloorPlan>(
    () => normalizeModel(floorPlanModelData)
  );
  const [selection, setSelection] = useState<Selection | null>(null);

  const selectRoom = (roomId: string) => {
    setSelection({ type: "room", id: roomId });
  };
  const selectObject = (objectId: string) => {
    setSelection({ type: "object", id: objectId });
  };
  const clearSelection = () => {
    setSelection(null);
  };

  const handleAddAction = (objectId: string, type: string, name: string) => {
    const action: Action = { id: crypto.randomUUID(), type, name };
    setModel((m) => addAction(m, objectId, action));
  };

  const handleRemoveAction = (objectId: string, actionId: string) => {
    setModel((m) => removeAction(m, objectId, actionId));
  };

  /** Rinomina una stanza (l'utente può dare nomi significativi) */
  const renameRoom = (roomId: string, name: string) => {
    setModel((m) => ({
      ...m,
      rooms: m.rooms.map((r) => (r.id === roomId ? { ...r, name } : r)),
    }));
  };

  return {
    model,
    selection,
    selectRoom,
    selectObject,
    clearSelection,
    handleAddAction,
    handleRemoveAction,
    renameRoom,
  };
}
