"use client";

import type { FloorPlan, Selection } from "../floorplan/types";

interface RoomsSidebarProps {
  model: FloorPlan;
  selection: Selection | null;
  onSelectRoom: (roomId: string) => void;
}

export default function RoomsSidebar({
  model,
  selection,
  onSelectRoom,
}: RoomsSidebarProps) {
  return (
    <aside className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Stanze
      </h3>
      <ul className="max-h-[420px] space-y-1 overflow-y-auto lg:max-h-none">
        {model.rooms.map((room) => {
          const selected =
            selection?.type === "room" && selection.id === room.id;
          return (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "bg-blue-600 font-medium text-white"
                    : "text-gray-700 hover:bg-blue-50"
                }`}
              >
                {room.name}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}