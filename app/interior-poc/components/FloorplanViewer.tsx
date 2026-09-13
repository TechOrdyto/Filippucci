"use client";

import { useEffect, useRef, useState } from "react";
import FloorPlanRenderer from "../floorplan/renderer";
import ObjectAssignmentPopover from "./ObjectAssignmentPopover";
import type { FloorPlanGeometry } from "../floorplan/source";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import type { FloorPlan, Selection } from "../floorplan/types";
import type { Product } from "../lib/types";
import { findProductById } from "../lib/catalog";
import { DEFAULT_VIEWPORT, fitViewport, zoomAt, type Viewport } from "../floorplan/viewport";

interface FloorPlanViewerProps {
  geometry: FloorPlanGeometry;
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  isCameraSet: boolean;
  catalog: Product[];
  objectAssignments: Record<string, string>;
  objectAssignmentTargetId: string | null;
  isObjectAssignmentOpen: boolean;
  onSelect: (selection: Selection | null) => void;
  onAssignObjectProduct: (objectId: string, productId: string) => void;
  onRemoveObjectProduct: (objectId: string) => void;
  onCloseObjectAssignment: () => void;
  onSelectViewpoint: (viewpoint: Viewpoint | null) => void;
  onRotateCamera: (delta: number) => void;
}

export default function FloorPlanViewer({
  geometry,
  model,
  selection,
  focusRoomId,
  camera,
  viewpoints,
  selectedViewpointId,
  isCameraSet,
  catalog,
  objectAssignments,
  objectAssignmentTargetId,
  isObjectAssignmentOpen,
  onSelect,
  onAssignObjectProduct,
  onRemoveObjectProduct,
  onCloseObjectAssignment,
  onSelectViewpoint,
  onRotateCamera,
}: FloorPlanViewerProps) {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fit-to-plan all'avvio: la geometria CAD non viene modificata, cambia
  // solo il viewport con cui la mostriamo nel contenitore disponibile.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setViewport(fitViewport(geometry.width, geometry.height, rect.width, rect.height));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un click fuori dall'area della mappa annulla la selezione corrente e
  // nasconde il contesto interattivo della stanza.
  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || containerRef.current?.contains(target)) return;
      if (!selection && !isObjectAssignmentOpen) return;
      onSelect(null);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [isObjectAssignmentOpen, onSelect, selection]);

  // ESC rimuove la selezione senza perdere il contesto della visuale.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onSelect(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect]);

  const zoomIn = () => {
    setViewport((value) => {
      const cx = (geometry.width / 2 - value.offsetX) / value.scale;
      const cy = (geometry.height / 2 - value.offsetY) / value.scale;
      return zoomAt(value, 1.25, cx, cy);
    });
  };

  const zoomOut = () => {
    setViewport((value) => {
      const cx = (geometry.width / 2 - value.offsetX) / value.scale;
      const cy = (geometry.height / 2 - value.offsetY) / value.scale;
      return zoomAt(value, 1 / 1.25, cx, cy);
    });
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setViewport(fitViewport(geometry.width, geometry.height, rect.width, rect.height));
  };

  const focusedRoom = focusRoomId
    ? model.rooms.find((room) => room.id === focusRoomId)
    : null;
  const assignmentObject = objectAssignmentTargetId
    ? model.objects.find((object) => object.id === objectAssignmentTargetId)
    : null;
  const assignmentRoom = assignmentObject
    ? model.rooms.find((room) => room.id === assignmentObject.roomId)
    : null;
  const objectAssignmentLabels = Object.fromEntries(
    Object.entries(objectAssignments).flatMap(([objectId, productId]) => {
      const product = findProductById(productId);
      return product ? [[objectId, product.name]] : [];
    })
  );

  const handlePlanSelection = (nextSelection: Selection | null) => {
    onSelect(nextSelection);
  };

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text)]">{model.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {focusedRoom
              ? isCameraSet
                ? `Visuale impostata · ${focusedRoom.name}. Clicca un arredo per associarlo.`
                : `Scegli un punto di vista di ${focusedRoom.name} o clicca un arredo.`
              : "Seleziona una stanza per visualizzare arredi e punti di vista."}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
        <span className="font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">Legenda</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--accent)] bg-[var(--selection-fill)]" aria-hidden="true" />
          Passaggio mouse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--accent-strong)] bg-[var(--accent-soft)]" aria-hidden="true" />
          Selezionato
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-3 w-3 items-center justify-center rounded-full border border-[var(--success)] bg-[var(--success-soft)] text-[8px] font-bold text-[var(--success)]" aria-hidden="true">✓</span>
          Associato
        </span>
      </div>

      <div ref={containerRef} className="relative min-h-0 min-w-0 overflow-hidden rounded-md bg-[var(--surface-strong)]">
        <FloorPlanRenderer
          geometry={geometry}
          model={model}
          selection={selection}
          focusRoomId={focusRoomId}
          camera={camera}
          selectedViewpointId={selectedViewpointId}
          objectAssignmentLabels={objectAssignmentLabels}
          assignedObjectIds={Object.keys(objectAssignments)}
          viewport={viewport}
          onViewportChange={setViewport}
          onSelect={handlePlanSelection}
          onSelectViewpoint={onSelectViewpoint}
          onRotateCamera={onRotateCamera}
          showObjects={Boolean(focusedRoom) || Object.keys(objectAssignments).length > 0}
          isCameraSet={isCameraSet}
          viewpoints={focusedRoom ? viewpoints : []}
        />
        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1">
          <span
            className="pointer-events-none rounded-md border border-[#25333a] bg-white px-2 py-1 text-[10px] font-semibold text-[#25333a] shadow-[0_2px_8px_rgba(37,51,58,0.18)]"
            aria-label={`Zoom ${Math.round(viewport.scale * 100)} percent`}
          >
            {Math.round(viewport.scale * 100)}%
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomIn}
              title="Aumenta ingrandimento"
              aria-label="Aumenta zoom"
              className="rounded-md border border-[#25333a] bg-white px-2 py-1 text-sm text-[#25333a] shadow-[0_2px_8px_rgba(37,51,58,0.14)] transition-colors hover:bg-[#f3f5f6]"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={zoomOut}
              title="Riduci ingrandimento"
              aria-label="Riduci zoom"
              className="rounded-md border border-[#25333a] bg-white px-2 py-1 text-sm text-[#25333a] shadow-[0_2px_8px_rgba(37,51,58,0.14)] transition-colors hover:bg-[#f3f5f6]"
            >
              －
            </button>
            <button
              type="button"
              onClick={fit}
              title="Adatta alla piantina"
              aria-label="Adatta la piantina"
              className="rounded-md border border-[#25333a] bg-white px-2 py-1 text-sm text-[#25333a] shadow-[0_2px_8px_rgba(37,51,58,0.14)] transition-colors hover:bg-[#f3f5f6]"
            >
              ⤢
            </button>
          </div>
        </div>

        {isObjectAssignmentOpen && assignmentObject && (
          <ObjectAssignmentPopover
            object={assignmentObject}
            roomName={assignmentRoom?.name}
            catalog={catalog}
            assignedProductId={objectAssignments[assignmentObject.id]}
            onAssign={(productId) => onAssignObjectProduct(assignmentObject.id, productId)}
            onRemove={() => onRemoveObjectProduct(assignmentObject.id)}
            onClose={onCloseObjectAssignment}
          />
        )}
      </div>

    </div>
  );
}
