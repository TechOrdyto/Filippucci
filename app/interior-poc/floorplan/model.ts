// Modello semantico della casa: query e mutazioni immutabili

import type { Action, FloorPlan, FloorPlanObject, Room } from "./types";

export function getRoom(model: FloorPlan, roomId: string): Room | null {
  return model.rooms.find((r) => r.id === roomId) ?? null;
}

export function getObject(
  model: FloorPlan,
  objectId: string
): FloorPlanObject | null {
  return model.objects.find((o) => o.id === objectId) ?? null;
}

export function getObjectsInRoom(
  model: FloorPlan,
  roomId: string
): FloorPlanObject[] {
  return model.objects.filter((o) => o.roomId === roomId);
}

export function getRoomOfObject(
  model: FloorPlan,
  objectId: string
): Room | null {
  const obj = getObject(model, objectId);
  if (!obj) return null;
  return getRoom(model, obj.roomId);
}

export function addAction(
  model: FloorPlan,
  objectId: string,
  action: Action
): FloorPlan {
  return {
    ...model,
    objects: model.objects.map((o) =>
      o.id === objectId ? { ...o, actions: [...o.actions, action] } : o
    ),
  };
}

export function removeAction(
  model: FloorPlan,
  objectId: string,
  actionId: string
): FloorPlan {
  return {
    ...model,
    objects: model.objects.map((o) =>
      o.id === objectId
        ? { ...o, actions: o.actions.filter((a) => a.id !== actionId) }
        : o
    ),
  };
}