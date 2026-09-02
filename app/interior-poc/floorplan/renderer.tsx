"use client";

import { useEffect, useRef } from "react";
import type { FloorPlanGeometry } from "./source";
import type { FloorPlan, Geometry, Selection, SelectionMode } from "./types";
import type { Viewport } from "./viewport";
import { zoomAt } from "./viewport";
import { geometryCenter, polygonCenter } from "./geometry";
import { hitTest } from "./selection";

interface FloorPlanRendererProps {
  geometry: FloorPlanGeometry;
  model: FloorPlan;
  selection: Selection | null;
  mode: SelectionMode;
  activeRoomId: string | null;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  onSelect: (s: Selection | null) => void;
  onDeselectRoom: () => void;
}

function renderGeometryShape(
  geometry: Geometry,
  style: { fill: string; stroke: string; strokeWidth: number; rx?: number }
) {
  switch (geometry.type) {
    case "rectangle":
      return (
        <rect
          x={geometry.x}
          y={geometry.y}
          width={geometry.width}
          height={geometry.height}
          rx={style.rx ?? 0}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
        />
      );
    case "polygon":
      return (
        <polygon
          points={geometry.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
        />
      );
    case "circle":
      return (
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.radius}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
        />
      );
    default:
      return null;
  }
}

/**
 * VectorLayer: disegna le linee vettoriali della sorgente CAD (DXF).
 * Il layer "walls" (muri/tratti principali) è più scuro e spesso,
 * il layer "details" (contorni/dettagli) più chiaro e sottile.
 * Questo è il layer fedele al DXF: è ciò che rende la pianta a video
 * identica al file sorgente.
 */
function VectorLayer({ geometry }: { geometry: FloorPlanGeometry }) {
  const lines = geometry.vectorLines ?? [];
  if (lines.length === 0) return null;

  return (
    <g>
      {lines.map((line) => {
        const isWall = line.layer === "walls";
        return (
          <line
            key={line.id}
            x1={line.start[0]}
            y1={line.start[1]}
            x2={line.end[0]}
            y2={line.end[1]}
            stroke={isWall ? "#1f2937" : "#9ca3af"}
            strokeWidth={isWall ? 2 : 0.7}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

/**
 * RoomLayer: overlay semantico delle stanze.
 * Di default è TRASPARENTE (la pianta mostra solo il DXF).
 * - modalità room: evidenzia la stanza selezionata
 * - modalità object: evidenzia (leggermente) la stanza attiva + pulsante ✕
 */
function RoomLayer({
  model,
  selection,
  mode,
  activeRoomId,
  onDeselectRoom,
}: {
  model: FloorPlan;
  selection: Selection | null;
  mode: SelectionMode;
  activeRoomId: string | null;
  onDeselectRoom: () => void;
}) {
  return (
    <g>
      {model.rooms.map((room) => {
        const isSelected = selection?.type === "room" && selection.id === room.id;
        const isActive = mode === "object" && activeRoomId === room.id;
        if (!isSelected && !isActive) return null;
        const center = polygonCenter(room.geometry.points);
        const xs = room.geometry.points.map((p) => p[0]);
        const ys = room.geometry.points.map((p) => p[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return (
          <g key={room.id}>
            <polygon
              points={room.geometry.points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={isSelected ? "rgba(59, 130, 246, 0.22)" : "rgba(59, 130, 246, 0.08)"}
              stroke={isSelected ? "#2563eb" : "#60a5fa"}
              strokeWidth={isSelected ? 6 : 3}
              strokeDasharray={isSelected ? undefined : "8 4"}
            />
            <text
              x={center.x}
              y={center.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={40}
              fontWeight={700}
              fill={isSelected ? "#1d4ed8" : "#3b82f6"}
              pointerEvents="none"
            >
              {room.name}
            </text>

            {/* Pulsante ✕ per deselezionare la stanza (angolo alto-sinistra) */}
            {isActive && (
              <g
                transform={`translate(${minX + 24} ${minY + 24})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeselectRoom();
                }}
                style={{ cursor: "pointer" }}
              >
                <circle r={18} fill="#ef4444" stroke="#ffffff" strokeWidth={3} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={22}
                  fontWeight={700}
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  ✕
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function ObjectLayer({
  model,
  selection,
  mode,
  activeRoomId,
}: {
  model: FloorPlan;
  selection: Selection | null;
  mode: SelectionMode;
  activeRoomId: string | null;
}) {
  // In modalità object mostriamo SOLO gli oggetti della stanza attiva.
  // In modalità room gli oggetti sono nascosti (si selezionano le stanze).
  if (mode !== "object") return null;

  const objects = activeRoomId
    ? model.objects.filter((o) => o.roomId === activeRoomId)
    : [];

  return (
    <g>
      {objects.map((obj) => {
        const selected = selection?.type === "object" && selection.id === obj.id;
        const center = geometryCenter(obj.geometry);
        return (
          <g key={obj.id}>
            {renderGeometryShape(obj.geometry, {
              // Sempre visibile con fill leggero; evidenziato quando selezionato
              fill: selected ? "rgba(59, 130, 246, 0.45)" : "rgba(59, 130, 246, 0.10)",
              stroke: selected ? "#2563eb" : "#3b82f6",
              strokeWidth: selected ? 5 : 1.5,
              rx: 4,
            })}
            {selected && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={24}
                fontWeight={600}
                fill="#1d4ed8"
                pointerEvents="none"
              >
                {obj.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default function FloorPlanRenderer({
  geometry,
  model,
  selection,
  mode,
  activeRoomId,
  viewport,
  onViewportChange,
  onSelect,
  onDeselectRoom,
}: FloorPlanRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    planX: number;
    planY: number;
  } | null>(null);

  const toPlanCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // Zoom con rotella (listener nativo per preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const { x, y } = toPlanCoords(e.clientX, e.clientY);
      onViewportChange(zoomAt(viewportRef.current, factor, x, y));
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = toPlanCoords(e.clientX, e.clientY);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      moved: false,
      planX: x,
      planY: y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      const scale = viewportRef.current.scale;
      onViewportChange({
        ...viewportRef.current,
        offsetX: drag.offsetX + dx / scale,
        offsetY: drag.offsetY + dy / scale,
      });
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (!drag.moved) {
      // Se il click cade sul pulsante ✕ della stanza attiva → deseleziona
      if (mode === "object" && activeRoomId) {
        const room = model.rooms.find((r) => r.id === activeRoomId);
        if (room) {
          const xs = room.geometry.points.map((p) => p[0]);
          const ys = room.geometry.points.map((p) => p[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const cx = minX + 24;
          const cy = minY + 24;
          const dist = Math.hypot(drag.planX - cx, drag.planY - cy);
          if (dist <= 18) {
            onDeselectRoom();
            return;
          }
        }
      }
      onSelect(hitTest(model, drag.planX, drag.planY, mode, activeRoomId));
    }
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="w-full cursor-grab select-none rounded-md"
      style={{
        aspectRatio: `${geometry.width}/${geometry.height}`,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <g
        transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})`}
      >
        {/* Sfondo */}
        <rect
          x={0}
          y={0}
          width={geometry.width}
          height={geometry.height}
          fill="#ffffff"
        />

        {/* Stanze (overlay semantico) */}
        <RoomLayer
          model={model}
          selection={selection}
          mode={mode}
          activeRoomId={activeRoomId}
          onDeselectRoom={onDeselectRoom}
        />

        {/* Linee vettoriali DXF (sopra, così i muri sono sempre netti) */}
        <VectorLayer geometry={geometry} />

        {/* Oggetti / mobili (solo in modalità elementi) */}
        <ObjectLayer model={model} selection={selection} mode={mode} activeRoomId={activeRoomId} />
      </g>
    </svg>
  );
}
