"use client";

import { useState } from "react";
import type { FloorPlan, Selection } from "../floorplan/types";
import {
  getObject,
  getObjectsInRoom,
  getRoom,
  getRoomOfObject,
} from "../floorplan/model";
import { ACTION_TYPES } from "../floorplan/actions";

interface InspectorProps {
  model: FloorPlan;
  selection: Selection | null;
  onAddAction: (objectId: string, type: string, name: string) => void;
  onRemoveAction: (objectId: string, actionId: string) => void;
  onRenameRoom: (roomId: string, name: string) => void;
}

export default function Inspector({
  model,
  selection,
  onAddAction,
  onRemoveAction,
  onRenameRoom,
}: InspectorProps) {
  const [adding, setAdding] = useState(false);
  const [actionType, setActionType] = useState(ACTION_TYPES[0].type);
  const [actionName, setActionName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [roomName, setRoomName] = useState("");

  if (!selection) {
    return (
      <aside className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Inspector
        </h3>
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          Seleziona una stanza o un mobile per vedere i dettagli
        </div>
      </aside>
    );
  }

  if (selection.type === "room") {
    const room = getRoom(model, selection.id);
    if (!room) return null;
    const count = getObjectsInRoom(model, room.id).length;

    const handleRename = (e: React.FormEvent) => {
      e.preventDefault();
      const name = roomName.trim();
      if (!name) return;
      onRenameRoom(room.id, name);
      setRenaming(false);
      setRoomName("");
    };

    return (
      <aside className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Inspector
        </h3>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-lg font-semibold text-gray-900">{room.name}</h4>
          <button
            type="button"
            onClick={() => {
              setRenaming((v) => !v);
              setRoomName(room.name);
            }}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            ✏️ Rinomina
          </button>
        </div>

        {renaming && (
          <form onSubmit={handleRename} className="mt-3 flex gap-2">
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Nome stanza"
              autoFocus
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Salva
            </button>
          </form>
        )}

        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Tipo</dt>
            <dd className="font-medium text-gray-900">{room.type}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Numero oggetti</dt>
            <dd className="font-medium text-gray-900">{count}</dd>
          </div>
        </dl>
      </aside>
    );
  }

  const obj = getObject(model, selection.id);
  if (!obj) return null;
  const room = getRoomOfObject(model, obj.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fallbackName = ACTION_TYPES.find((t) => t.type === actionType)?.name;
    const name = actionName.trim() || fallbackName || "";
    if (!name) return;
    onAddAction(obj.id, actionType, name);
    setActionName("");
    setAdding(false);
  };

  return (
    <aside className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Inspector
      </h3>
      <h4 className="text-lg font-semibold text-gray-900">{obj.name}</h4>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Tipo</dt>
          <dd className="font-medium text-gray-900">{obj.type}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Stanza</dt>
          <dd className="font-medium text-gray-900">{room?.name ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Azioni
        </h5>
        {obj.actions.length === 0 ? (
          <p className="text-sm text-gray-400">Nessuna azione</p>
        ) : (
          <ul className="space-y-1">
            {obj.actions.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {a.name}
                  </div>
                  <div className="text-xs text-gray-500">{a.type}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAction(obj.id, a.id)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  aria-label={`Elimina ${a.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-2 rounded-md border border-gray-200 p-3"
          >
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              value={actionName}
              onChange={(e) => setActionName(e.target.value)}
              placeholder="Nome azione"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Aggiungi
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annulla
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 w-full rounded-md border border-dashed border-blue-300 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            + Aggiungi azione
          </button>
        )}
      </div>
    </aside>
  );
}