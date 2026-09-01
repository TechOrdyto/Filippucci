"use client";

import { useEffect, useRef, useState } from "react";
import FloorPlanRenderer from "../floorplan/renderer";
import type { FloorPlanGeometry } from "../floorplan/source";
import type { FloorPlan, Selection, SelectionMode } from "../floorplan/types";
import {
  DEFAULT_VIEWPORT,
  fitViewport,
  zoomAt,
  type Viewport,
} from "../floorplan/viewport";

interface FloorPlanViewerProps {
  geometry: FloorPlanGeometry;
  model: FloorPlan;
  selection: Selection | null;
  mode: SelectionMode;
  activeRoomId: string | null;
  onSelect: (s: Selection | null) => void;
  onSwitchMode: (m: SelectionMode) => void;
  onDeselectRoom: () => void;
}

export default function FloorPlanViewer({
  geometry,
  model,
  selection,
  mode,
  activeRoomId,
  onSelect,
  onSwitchMode,
  onDeselectRoom,
}: FloorPlanViewerProps) {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fit-to-plan all'avvio: adatta la pianta al contenitore
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setViewport(fitViewport(geometry.width, geometry.height, rect.width, rect.height));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC per deselezionare
  // Nota: il deselect su click esterno è gestito in page.tsx sull'intera sezione
  // del modulo (viewer + sidebar + inspector), così i click nell'Inspector
  // non azzerano la selezione.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelect(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect]);

  const zoomIn = () => {
    setViewport((v) => {
      const cx = (geometry.width / 2 - v.offsetX) / v.scale;
      const cy = (geometry.height / 2 - v.offsetY) / v.scale;
      return zoomAt(v, 1.25, cx, cy);
    });
  };

  const zoomOut = () => {
    setViewport((v) => {
      const cx = (geometry.width / 2 - v.offsetX) / v.scale;
      const cy = (geometry.height / 2 - v.offsetY) / v.scale;
      return zoomAt(v, 1 / 1.25, cx, cy);
    });
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setViewport(fitViewport(geometry.width, geometry.height, rect.width, rect.height));
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">🏠 {model.name}</h3>
        <div className="flex items-center gap-1">
          {/* Toggle modalità di selezione (layer) */}
          <div className="mr-2 flex overflow-hidden rounded-md border border-gray-200">
            <button
              type="button"
              onClick={() => onSwitchMode("room")}
              className={`px-2 py-1 text-xs font-medium ${
                mode === "room"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              🏠 Stanze
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode("object")}
              disabled={!activeRoomId}
              className={`px-2 py-1 text-xs font-medium ${
                mode === "object"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              🛋️ Elementi
            </button>
          </div>
          <button
            type="button"
            onClick={zoomIn}
            title="Zoom in"
            className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={zoomOut}
            title="Zoom out"
            className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            －
          </button>
          <button
            type="button"
            onClick={fit}
            title="Fit to plan"
            className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            ⤢
          </button>
          <button
            type="button"
            onClick={fit}
            title="Reset"
            className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            ⟲
          </button>
          <span className="ml-1 w-12 text-right text-xs text-gray-500">
            {Math.round(viewport.scale * 100)}%
          </span>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1">
        <FloorPlanRenderer
          geometry={geometry}
          model={model}
          selection={selection}
          mode={mode}
          activeRoomId={activeRoomId}
          viewport={viewport}
          onViewportChange={setViewport}
          onSelect={onSelect}
          onDeselectRoom={onDeselectRoom}
        />
      </div>

      <p className="mt-2 text-xs text-gray-400">
        {mode === "room"
          ? "Clicca una stanza per selezionarla · poi passa a Elementi per i suoi oggetti · ESC per tornare alle stanze"
          : `Stanza attiva: ${model.rooms.find((r) => r.id === activeRoomId)?.name ?? "—"} · clicca un elemento per selezionarlo · ESC per tornare alle stanze`}
      </p>
    </div>
  );
}