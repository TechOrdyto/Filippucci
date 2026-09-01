// Azioni associate agli oggetti (CRUD, nessuna esecuzione reale in questa fase)

import type { Action } from "./types";

export const ACTION_TYPES: ReadonlyArray<{ type: string; name: string }> = [
  { type: "create-render", name: "Crea render" },
  { type: "view", name: "Visualizza" },
  { type: "automation", name: "Automazione" },
];

export function createAction(type: string, name: string): Action {
  return { id: crypto.randomUUID(), type, name };
}