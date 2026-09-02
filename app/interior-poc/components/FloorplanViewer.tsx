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
  isCameraConfirmed: boolean;
  isCameraMode: boolean;
  catalog: Product[];
  objectAssignments: Record<string, string>;
  objectAssignmentTargetId: string | null;
  isObjectAssignmentOpen: boolean;
  onSelect: (selection: Selection | null) => void;
  onAssignObjectProduct: (objectId: string, productId: string) => void;
  onRemoveObjectProduct: (objectId: string) => void;
  onCloseObjectAssignment: () => void;
  onSelectViewpoint: (viewpoint: Viewpoint) => void;
  onRotateCamera: (delta: number) => void;
  onToggleCamera: () => void;
  onConfirmCamera: () => void;
}

export default function FloorPlanViewer({
  geometry,
  model,
  selection,
  focusRoomId,
  camera,
  viewpoints,
  selectedViewpointId,
  isCameraConfirmed,
  isCameraMode,
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
  onToggleCamera,
  onConfirmCamera,
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

  // ESC esce dalla modalità camera oppure rimuove la selezione dell’elemento.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isCameraMode) {
        onToggleCamera();
      } else {
        onSelect(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCameraMode, onSelect, onToggleCamera]);

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
  const selectedObject =
    selection?.type === "object"
      ? model.objects.find((object) => object.id === selection.id)
      : null;
  const selectedObjectProduct = selectedObject
    ? findProductById(objectAssignments[selectedObject.id])
    : null;
  const assignmentCount = Object.keys(objectAssignments).length;
  const objectAssignmentLabels = Object.fromEntries(
    Object.entries(objectAssignments).flatMap(([objectId, productId]) => {
      const product = findProductById(productId);
      return product ? [[objectId, product.name]] : [];
    })
  );
  const focusedRoomAssignmentCount = focusedRoom
    ? model.objects.filter(
        (object) => object.roomId === focusedRoom.id && Boolean(objectAssignments[object.id])
      ).length
    : assignmentCount;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text)]">{model.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {isCameraMode
              ? isCameraConfirmed
                ? "Visuale confermata"
                : "Modalità camera · conferma la visuale"
              : focusedRoom
                ? `Ambiente attivo: ${focusedRoom.name}`
                : "Seleziona un ambiente o un elemento"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleCamera}
            disabled={!focusedRoom}
            aria-pressed={isCameraMode}
            title={focusedRoom ? undefined : "Seleziona prima un ambiente"}
            className={`mr-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              !focusedRoom
                ? "cursor-not-allowed border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)]"
                : isCameraMode
                  ? "ghost-action"
                  : "primary-action"
            }`}
          >
            {isCameraMode ? "← Torna agli arredi" : "Imposta visuale"}
          </button>
          <button
            type="button"
            onClick={zoomIn}
            title="Aumenta ingrandimento"
            aria-label="Aumenta zoom"
            className="ghost-action rounded-md px-2 py-1 text-sm"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={zoomOut}
            title="Riduci ingrandimento"
            aria-label="Riduci zoom"
            className="ghost-action rounded-md px-2 py-1 text-sm"
          >
            －
          </button>
          <button
            type="button"
            onClick={fit}
            title="Adatta alla piantina"
            aria-label="Adatta la piantina"
            className="ghost-action rounded-md px-2 py-1 text-sm"
          >
            ⤢
          </button>
          <span className="ml-1 w-12 text-right text-xs text-[var(--text-soft)]">
            {Math.round(viewport.scale * 100)}%
          </span>
        </div>
      </div>

      {!isCameraMode && (selectedObject || assignmentCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
              Elemento selezionato
            </p>
            {selectedObject ? (
              <>
                <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text)]">
                  {selectedObject.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {selectedObjectProduct
                    ? `Associato a ${selectedObjectProduct.name}`
                    : "Nessun articolo associato · seleziona dal catalogo"}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-xs font-semibold text-[var(--text)]">
                {focusedRoom ? `Articoli in ${focusedRoom.name}` : "Articoli associati"}
              </p>
            )}
          </div>
          <span className="soft-badge shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold">
            {focusedRoomAssignmentCount} {focusedRoomAssignmentCount === 1 ? "elemento associato" : "elementi associati"}
          </span>
        </div>
      )}

      {!isCameraMode && (
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
      )}

      <div ref={containerRef} className="relative min-h-0 min-w-0 overflow-hidden rounded-md bg-[var(--surface-strong)]">
        <FloorPlanRenderer
          geometry={geometry}
          model={model}
          selection={selection}
          focusRoomId={focusRoomId}
          camera={isCameraMode ? camera : null}
          viewpoints={isCameraMode ? viewpoints : []}
          selectedViewpointId={selectedViewpointId}
          objectAssignmentLabels={objectAssignmentLabels}
          viewport={viewport}
          onViewportChange={setViewport}
          onSelect={isCameraMode ? () => undefined : onSelect}
          onSelectViewpoint={onSelectViewpoint}
          showObjects={!isCameraMode}
        />

        {!isCameraMode && isObjectAssignmentOpen && assignmentObject && (
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

      {isCameraMode && focusedRoom && camera ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">02 · Vista</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text)]">Imposta il punto di vista</p>
            </div>
            <span className="soft-badge rounded-full px-2.5 py-1 text-xs font-semibold">
              {focusedRoom.name}
            </span>
          </div>

          <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
            isCameraConfirmed
              ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--text)]"
              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]"
          }`}>
            <span>
              {isCameraConfirmed
                ? "✓ Punto di vista confermato: puoi tornare agli arredi o generare il render."
                : selectedViewpointId && selectedViewpointId === viewpoints[0]?.id
                  ? "Punto di vista consigliato selezionato: controllalo e confermalo."
                  : viewpoints.length > 0
                    ? "Punto di vista selezionato: controllalo e confermalo."
                    : "Punto di vista impostato: controllalo e confermalo."}
            </span>
            {!isCameraConfirmed && (
              <button
                type="button"
                onClick={onConfirmCamera}
                className="primary-action rounded-md px-3 py-1.5 text-[11px] font-bold"
              >
                Conferma visuale
              </button>
            )}
          </div>

          {viewpoints.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {viewpoints.map((viewpoint, index) => {
                const selected = selectedViewpointId === viewpoint.id;
                return (
                  <button
                    key={viewpoint.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectViewpoint(viewpoint)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                      <span className={selected ? "text-[var(--accent-strong)]" : "text-[var(--text-soft)]"}>
                        {viewpoint.kind === "recommended" ? "Consigliata" : `Visuale ${index + 1}`}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">
                        {index + 1}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-5">
                      {viewpoint.label.replace(" → centro", "").replace(" → interno", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Non ci sono visuali alternative: è impostata una posizione interna automatica. Controllala e confermala.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-xs text-[var(--text-muted)]">
              Direzione {Math.round(camera.rotation)}° · campo visivo {camera.fov}°
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onRotateCamera(-15)}
                className="ghost-action rounded-md px-2 py-1 text-xs font-semibold"
                aria-label="Ruota visuale a sinistra"
              >
                ↺ 15°
              </button>
              <button
                type="button"
                onClick={() => onRotateCamera(15)}
                className="ghost-action rounded-md px-2 py-1 text-xs font-semibold"
                aria-label="Ruota visuale a destra"
              >
                15° ↻
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {!focusedRoom
            ? "Seleziona un ambiente o un elemento per iniziare."
            : isCameraMode
              ? "Carico i punti di vista disponibili per questo ambiente."
              : "Quando hai finito di associare gli articoli, seleziona «Imposta visuale»."}
        </p>
      )}
    </div>
  );
}
