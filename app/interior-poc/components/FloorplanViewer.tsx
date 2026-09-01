"use client";

import { useRef, useState } from "react";
import type { FloorplanData } from "../lib/types";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import CameraOverlay from "./CameraOverlay";

function isPointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface FloorplanViewerProps {
  floorplan: FloorplanData;
  scale?: number; // px per metro
  camera?: CameraPosition | null;
  selectedRoomId?: string | null;
  viewpoints?: Viewpoint[];
  onRoomClick?: (roomId: string, x: number, y: number) => void;
  onCameraChange?: (camera: CameraPosition) => void;
  onSelectViewpoint?: (vp: Viewpoint) => void;
}

const ROOM_COLORS: Record<string, string> = {
  "cucina-soggiorno": "var(--room-living)",
  "camera-1": "var(--room-one)",
  "camera-2": "var(--room-two)",
  "camera-3": "var(--room-three)",
  bagno: "var(--room-bath)",
  guardaroba: "var(--room-wardrobe)",
  ingresso: "var(--room-entry)",
  balcone: "var(--room-balcony)",
};

const CAD_EXTENSIONS = [".dwg", ".dxf", ".dgn"];
const MAX_CAD_FILE_SIZE = 50 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

interface PlanViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function clampViewBox(viewBox: PlanViewBox, fullWidth: number, fullHeight: number): PlanViewBox {
  const width = Math.min(fullWidth, Math.max(fullWidth / MAX_ZOOM, viewBox.width));
  const height = Math.min(fullHeight, Math.max(fullHeight / MAX_ZOOM, viewBox.height));

  return {
    width,
    height,
    x: Math.min(Math.max(viewBox.x, 0), fullWidth - width),
    y: Math.min(Math.max(viewBox.y, 0), fullHeight - height),
  };
}

function zoomViewBox(
  current: PlanViewBox,
  nextZoom: number,
  anchor: Point,
  fullWidth: number,
  fullHeight: number
): PlanViewBox {
  const boundedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const nextWidth = fullWidth / boundedZoom;
  const nextHeight = fullHeight / boundedZoom;
  const widthRatio = nextWidth / current.width;
  const heightRatio = nextHeight / current.height;

  return clampViewBox(
    {
      x: anchor.x - (anchor.x - current.x) * widthRatio,
      y: anchor.y - (anchor.y - current.y) * heightRatio,
      width: nextWidth,
      height: nextHeight,
    },
    fullWidth,
    fullHeight
  );
}

export default function FloorplanViewer({
  floorplan,
  scale = 40,
  camera = null,
  selectedRoomId = null,
  viewpoints = [],
  onRoomClick,
  onCameraChange,
  onSelectViewpoint,
}: FloorplanViewerProps) {
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [cadError, setCadError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const cadInputRef = useRef<HTMLInputElement>(null);
  const { width, height } = floorplan.dimensions;
  const viewWidth = width * scale;
  const viewHeight = height * scale;
  const initialViewBox: PlanViewBox = { x: 0, y: 0, width: viewWidth, height: viewHeight };
  const [viewBox, setViewBoxState] = useState<PlanViewBox>(initialViewBox);
  const viewBoxRef = useRef<PlanViewBox>(initialViewBox);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialViewBox: PlanViewBox;
    startedOnPlan: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    initialViewBox: PlanViewBox;
    anchor: Point;
  } | null>(null);
  const pointerPositionsRef = useRef(new Map<number, Point>());
  const didPanRef = useRef(false);

  const applyViewBox = (nextViewBox: PlanViewBox) => {
    const clamped = clampViewBox(nextViewBox, viewWidth, viewHeight);
    viewBoxRef.current = clamped;
    setViewBoxState(clamped);
  };

  const clientToPlanPoint = (clientX: number, clientY: number, currentViewBox = viewBoxRef.current) => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    return {
      x: currentViewBox.x + ((clientX - rect.left) / rect.width) * currentViewBox.width,
      y: currentViewBox.y + ((clientY - rect.top) / rect.height) * currentViewBox.height,
    };
  };

  const zoomTo = (nextZoom: number, anchor?: Point) => {
    const current = viewBoxRef.current;
    const targetAnchor = anchor ?? {
      x: current.x + current.width / 2,
      y: current.y + current.height / 2,
    };
    applyViewBox(zoomViewBox(current, nextZoom, targetAnchor, viewWidth, viewHeight));
  };

  const panBy = (horizontalRatio: number, verticalRatio: number) => {
    const current = viewBoxRef.current;
    applyViewBox({
      ...current,
      x: current.x + current.width * horizontalRatio,
      y: current.y + current.height * verticalRatio,
    });
  };

  const handleResetView = () => applyViewBox(initialViewBox);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const anchor = clientToPlanPoint(event.clientX, event.clientY);
    const currentZoom = viewWidth / viewBoxRef.current.width;
    const nextZoom = currentZoom + (event.deltaY < 0 ? 0.2 : -0.2);
    zoomTo(nextZoom, anchor ?? undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentZoom = viewWidth / viewBoxRef.current.width;
    const panStep = event.shiftKey ? 0.2 : 0.1;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(currentZoom + ZOOM_STEP);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomTo(currentZoom - ZOOM_STEP);
      return;
    }
    if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      handleResetView();
      return;
    }

    const movements: Record<string, [number, number]> = {
      ArrowLeft: [-panStep, 0],
      ArrowRight: [panStep, 0],
      ArrowUp: [0, -panStep],
      ArrowDown: [0, panStep],
    };
    const movement = movements[event.key];
    if (!movement) return;

    event.preventDefault();
    panBy(movement[0], movement[1]);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const startedOnPlan =
      event.target instanceof Node && svgRef.current?.contains(event.target) === true;
    if (startedOnPlan) setIsPanning(true);

    if (event.pointerType === "touch") {
      pointerPositionsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointerPositionsRef.current.size === 2) {
        const [first, second] = Array.from(pointerPositionsRef.current.values());
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        const anchor = clientToPlanPoint(center.x, center.y);
        if (anchor) {
          pinchRef.current = {
            distance: Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1),
            initialViewBox: viewBoxRef.current,
            anchor,
          };
          panRef.current = null;
          didPanRef.current = true;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (pinchRef.current) return;

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialViewBox: viewBoxRef.current,
      startedOnPlan,
    };
    didPanRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && pointerPositionsRef.current.has(event.pointerId)) {
      pointerPositionsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pinchRef.current && pointerPositionsRef.current.size >= 2) {
        const [first, second] = Array.from(pointerPositionsRef.current.values());
        const distance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
        const nextZoom = (viewWidth / pinchRef.current.initialViewBox.width) *
          (distance / pinchRef.current.distance);
        applyViewBox(
          zoomViewBox(
            pinchRef.current.initialViewBox,
            nextZoom,
            pinchRef.current.anchor,
            viewWidth,
            viewHeight
          )
        );
        event.preventDefault();
        return;
      }
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || pinchRef.current) return;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    if (Math.hypot(deltaX, deltaY) > 4) didPanRef.current = true;

    applyViewBox({
      ...pan.initialViewBox,
      x: pan.initialViewBox.x - (deltaX / rect.width) * pan.initialViewBox.width,
      y: pan.initialViewBox.y - (deltaY / rect.height) * pan.initialViewBox.height,
    });
    event.preventDefault();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const shouldSelectRoom =
      pan?.pointerId === event.pointerId &&
      pan.startedOnPlan &&
      !didPanRef.current &&
      !pinchRef.current;

    if (shouldSelectRoom) selectRoomAtClientPosition(event.clientX, event.clientY);

    if (event.pointerType === "touch") {
      pointerPositionsRef.current.delete(event.pointerId);
      if (pointerPositionsRef.current.size < 2) pinchRef.current = null;
    }

    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    didPanRef.current = false;
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerPositionsRef.current.delete(event.pointerId);
    pinchRef.current = null;
    panRef.current = null;
    didPanRef.current = true;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCadFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!CAD_EXTENSIONS.includes(extension)) {
      setCadFile(null);
      setCadError("Scegli un file DWG, DXF o DGN.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_CAD_FILE_SIZE) {
      setCadFile(null);
      setCadError("Il file supera il limite di 50 MB.");
      event.target.value = "";
      return;
    }

    setCadFile(file);
    setCadError(null);
  };

  const handleRemoveCadFile = () => {
    setCadFile(null);
    setCadError(null);
    if (cadInputRef.current) cadInputRef.current.value = "";
  };

  const zoomPercent = Math.round((viewWidth / viewBox.width) * 100);

  const selectRoomAtClientPosition = (clientX: number, clientY: number) => {
    if (!onRoomClick) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return;
    }
    const point = clientToPlanPoint(clientX, clientY);
    if (!point) return;
    const x = point.x / scale;
    const y = point.y / scale;

    // Trova la stanza che contiene il punto
    const room = floorplan.rooms.find((r) => {
      const polygon = r.polygon ?? [
        [r.bounds.x, r.bounds.y],
        [r.bounds.x + r.bounds.width, r.bounds.y],
        [r.bounds.x + r.bounds.width, r.bounds.y + r.bounds.height],
        [r.bounds.x, r.bounds.y + r.bounds.height],
      ];
      return isPointInPolygon(x, y, polygon);
    });

    if (room) onRoomClick(room.id, x, y);
  };

  return (
    <section className="panel rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">01 · Piantina</p>
          <h3 className="display-title text-2xl text-[var(--text)]">Scegli una stanza.</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Clicca sulla stanza che vuoi vedere nell’immagine.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <label className="ghost-action inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold">
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
            Importa planimetria CAD
            <input
              ref={cadInputRef}
              type="file"
              accept=".dwg,.dxf,.dgn"
              onChange={handleCadFileChange}
              className="sr-only"
              aria-label="Importa planimetria CAD"
            />
          </label>
        </div>
      </div>

      {(cadFile || cadError) && (
        <div
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${
            cadError
              ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
              : "border-[var(--border)] bg-[var(--surface-muted)]"
          }`}
          role={cadError ? "alert" : "status"}
        >
          <div className="min-w-0">
            <span className="block font-semibold text-[var(--text)]">
              {cadError ? "File non valido" : "Planimetria CAD selezionata"}
            </span>
            <span className="mt-0.5 block truncate text-[var(--text-muted)]">
              {cadError ?? `${cadFile?.name} · ${(cadFile!.size / (1024 * 1024)).toFixed(1)} MB`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemoveCadFile}
            className="shrink-0 rounded-full px-2 py-1 text-[var(--text-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
            aria-label="Rimuovi file CAD"
          >
            ✕
          </button>
        </div>
      )}

      <div
        className={`relative touch-none overscroll-contain overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2 ${isPanning ? "cursor-grabbing" : "cursor-default"}`}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="region"
        aria-label="Navigazione della planimetria"
        aria-describedby="floorplan-navigation-help"
        tabIndex={0}
      >
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          className={`relative z-0 w-full rounded-lg ${isPanning ? "cursor-grabbing" : "cursor-default"}`}
          style={{ aspectRatio: `${width}/${height}` }}
          role="img"
          aria-label="Piantina interattiva: scegli una stanza"
        >
        {/* Sfondo */}
        <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="var(--surface-muted)" />

        {/* Muri (formato FloorplanVLM) — con vere interruzioni per aperture */}
        {(floorplan.walls ?? []).map((wall) => {
          const x1 = wall.start[0] * scale;
          const y1 = wall.start[1] * scale;
          const x2 = wall.end[0] * scale;
          const y2 = wall.end[1] * scale;
          const thickness = (wall.thickness ?? 0.15) * scale;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          // Calcola i segmenti di muro tra le aperture
          const openings = (wall.openings ?? []).map((o) => ({
            center: o.center * scale,
            width: o.width * scale,
            type: o.type,
          }));

          // Segmenti di muro: [start, end] lungo il muro
          const segments: Array<[number, number]> = [];
          let cursor = 0;
          for (const opening of openings) {
            const start = opening.center - opening.width / 2;
            const end = opening.center + opening.width / 2;
            if (start > cursor) segments.push([cursor, start]);
            cursor = end;
          }
          if (cursor < len) segments.push([cursor, len]);

          return (
            <g key={wall.id}>
              {/* Segmenti di muro (interrotti dalle aperture) */}
              {segments.map(([s, e], i) => (
                <line
                  key={`${wall.id}-seg-${i}`}
                  x1={x1 + cos * s}
                  y1={y1 + sin * s}
                  x2={x1 + cos * e}
                  y2={y1 + sin * e}
                  stroke="var(--text-muted)"
                  strokeWidth={thickness}
                  strokeLinecap="round"
                />
              ))}
              {/* Aperture (vere interruzioni) */}
              {openings.map((opening, i) => {
                const cx = x1 + cos * opening.center;
                const cy = y1 + sin * opening.center;
                const w = opening.width;
                return (
                  <g key={`${wall.id}-opening-${i}`}>
                    {/* Soglia dell'apertura */}
                    <rect
                      x={cx - w / 2}
                      y={cy - thickness / 2 - 1}
                      width={w}
                      height={thickness + 2}
                      fill={opening.type === "window" ? "#93c5fd" : "#fbbf24"}
                      stroke="var(--accent)"
                      strokeWidth={1}
                    />
                    {/* Battente porta (arco di apertura) */}
                    {opening.type === "door" && (
                      <path
                        d={`M ${cx - w / 2} ${cy} A ${w} ${w} 0 0 1 ${cx + w / 2} ${cy}`}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1}
                        strokeDasharray="3,2"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Stanze */}
        {floorplan.rooms.map((room) => (
          <g key={room.id}>
            {/* Polygon se presente (forma irregolare), altrimenti rect */}
            {room.polygon ? (
              <polygon
                points={room.polygon
                  .map(([px, py]) => `${px * scale},${py * scale}`)
                  .join(" ")}
                fill={ROOM_COLORS[room.id] ?? "var(--surface-muted)"}
                stroke="var(--text-muted)"
                strokeWidth={2}
              />
            ) : (
              <rect
                x={room.bounds.x * scale}
                y={room.bounds.y * scale}
                width={room.bounds.width * scale}
                height={room.bounds.height * scale}
                fill={ROOM_COLORS[room.id] ?? "var(--surface-muted)"}
                stroke="var(--text-muted)"
                strokeWidth={2}
                rx={2}
              />
            )}
            <text
              x={(room.bounds.x + room.bounds.width / 2) * scale}
              y={(room.bounds.y + room.bounds.height / 2) * scale}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--text)]"
              fontSize={12}
              fontWeight={600}
            >
              {room.name}
            </text>
            <text
              x={(room.bounds.x + room.bounds.width / 2) * scale}
              y={(room.bounds.y + room.bounds.height / 2) * scale + 16}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--text-muted)]"
              fontSize={10}
            >
              {room.area} mq
            </text>

            {/* Aperture */}
            {room.openings.map((opening) => {
              const isVertical = opening.wall === "north" || opening.wall === "south";
              const w = isVertical ? opening.width * scale : 6;
              const h = isVertical ? 6 : opening.width * scale;
              const x = opening.position.x * scale - w / 2;
              const y = opening.position.y * scale - h / 2;

              return (
                <g key={opening.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={opening.type === "window" ? "#93c5fd" : "#fbbf24"}
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                  />
                  {opening.type === "window" && (
                    <text
                      x={opening.position.x * scale}
                      y={opening.position.y * scale - 8}
                      textAnchor="middle"
                      fontSize={9}
                      className="fill-[var(--accent-strong)]"
                    >
                      {opening.width}m
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}

                {/* Dimensioni totali */}
        <text
          x={viewWidth / 2}
          y={viewHeight + 20}
          textAnchor="middle"
          fontSize={11}
          className="fill-[var(--text-muted)]"
        >
          {width}m
        </text>
        <text
          x={viewWidth + 20}
          y={viewHeight / 2}
          textAnchor="middle"
          fontSize={11}
          className="fill-[var(--text-muted)]"
          transform={`rotate(90 ${viewWidth + 20} ${viewHeight / 2})`}
        >
          {height}m
        </text>

        {/* Evidenzia stanza selezionata */}
        {selectedRoomId &&
          floorplan.rooms
            .filter((r) => r.id === selectedRoomId)
            .map((room) => {
              const polygon = room.polygon ?? [
                [room.bounds.x, room.bounds.y],
                [room.bounds.x + room.bounds.width, room.bounds.y],
                [room.bounds.x + room.bounds.width, room.bounds.y + room.bounds.height],
                [room.bounds.x, room.bounds.y + room.bounds.height],
              ];
              return (
                <polygon
                  key={`selected-${room.id}`}
                  points={polygon.map(([px, py]) => `${px * scale},${py * scale}`).join(" ")}
                  fill="var(--selection-fill)"
                  stroke="var(--accent-strong)"
                  strokeWidth={3}
                  pointerEvents="none"
                />
              );
            })}

        </svg>

        {camera && onCameraChange && (
          <CameraOverlay
            camera={camera}
            scale={scale}
            canvasWidth={width}
            canvasHeight={height}
            onCameraChange={onCameraChange}
            viewpoints={viewpoints}
            onSelectViewpoint={onSelectViewpoint}
            viewBox={viewBox}
          />
        )}
      </div>

      <p
        id="floorplan-navigation-help"
        className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] leading-relaxed text-[var(--text-muted)]"
        aria-live="polite"
      >
        <span className="font-semibold text-[var(--text)]">Zoom {zoomPercent}%</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={handleResetView}
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          aria-label="Riallinea la planimetria"
          title="Ritorna alla vista originale"
        >
          Riallinea
        </button>
        <span aria-hidden="true">·</span>
        <span>Clicca o tocca una stanza per selezionarla</span>
        <span aria-hidden="true">·</span>
        <span>Tieni premuto e trascina per spostarti</span>
        <span aria-hidden="true">·</span>
        <span>Rotella o due dita per ingrandire</span>
      </p>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]" aria-label="Legenda planimetria">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" /> Finestra
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Porta finestra
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-400" /> Porta
          </span>
        </div>
        <span className="hidden rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] sm:block">
          {width}m × {height}m · soffitto {floorplan.ceilingHeight}m
        </span>
      </div>
    </section>
  );
}
