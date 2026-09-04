"use client";

import { useRef, useState } from "react";
import type { FloorPlanGeometry } from "./source";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import type { FloorPlan, Geometry, Selection } from "./types";
import type { Viewport } from "./viewport";
import { zoomAt } from "./viewport";
import { geometryBounds, geometryCenter, polygonCenter } from "./geometry";
import { hitTest } from "./selection";

interface FloorPlanRendererProps {
  geometry: FloorPlanGeometry;
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  showObjects: boolean;
  objectAssignmentLabels?: Record<string, string>;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  onSelect: (s: Selection | null) => void;
  onSelectViewpoint: (viewpoint: Viewpoint) => void;
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
    <g pointerEvents="none">
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
 * La stanza in focus viene evidenziata, mentre le altre restano leggibili:
 * il focus serve alla camera e non limita gli elementi cliccabili.
 */
function RoomLayer({
  model,
  selection,
  focusRoomId,
  hoveredRoomId,
  onHoverRoom,
  onSelectRoom,
}: {
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  hoveredRoomId: string | null;
  onHoverRoom: (roomId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
}) {
  return (
    <g>
      {model.rooms.map((room) => {
        const isSelected = selection?.type === "room" && selection.id === room.id;
        const isFocused = focusRoomId === room.id;
        const isHovered = hoveredRoomId === room.id;
        const center = polygonCenter(room.geometry.points);
        return (
          <g key={room.id}>
            <title>{`Seleziona ${room.name}`}</title>
            <polygon
              points={room.geometry.points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={
                isSelected
                  ? "transparent"
                : isHovered
                    ? "var(--selection-fill)"
                    : isFocused
                      ? "var(--camera-fill)"
                      : "transparent"
              }
              stroke={
                isSelected
                  ? "var(--accent-strong)"
                  : isHovered
                    ? "var(--accent)"
                    : isFocused
                      ? "var(--accent)"
                      : "transparent"
              }
              strokeWidth={isSelected ? 6 : isHovered ? 4 : isFocused ? 3 : 0}
              strokeDasharray={isSelected || isHovered ? undefined : isFocused ? "8 4" : undefined}
              pointerEvents="all"
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Ambiente selezionato" : "Seleziona ambiente"}: ${room.name}`}
              onPointerEnter={() => onHoverRoom(room.id)}
              onPointerLeave={() => onHoverRoom(null)}
              onFocus={() => onHoverRoom(room.id)}
              onBlur={() => onHoverRoom(null)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelectRoom(room.id);
              }}
            />
            {!isSelected && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isFocused ? 40 : isHovered ? 34 : 28}
                fontWeight={isFocused || isHovered ? 700 : 500}
                fill={isFocused || isHovered ? "var(--accent-strong)" : "var(--text-muted)"}
                opacity={isFocused || isHovered ? 1 : 0.72}
                pointerEvents="none"
              >
                {room.name}
              </text>
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
  focusRoomId,
  hoveredObjectId,
  onHoverObject,
  objectAssignmentLabels,
  onSelectObject,
}: {
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  hoveredObjectId: string | null;
  onHoverObject: (objectId: string | null) => void;
  objectAssignmentLabels?: Record<string, string>;
  onSelectObject: (objectId: string) => void;
}) {
  return (
    <g>
      {model.objects.map((obj) => {
        const selected = selection?.type === "object" && selection.id === obj.id;
        const hovered = hoveredObjectId === obj.id;
        const center = geometryCenter(obj.geometry);
        const isFocused = !focusRoomId || obj.roomId === focusRoomId;
        const showUnassignedObject = Boolean(focusRoomId && isFocused);
        const isHighlighted = selected || hovered;
        const assignmentLabel = objectAssignmentLabels?.[obj.id];
        const isAssigned = Boolean(assignmentLabel);
        return (
          <g
            key={obj.id}
            opacity={
              isHighlighted
                ? isFocused
                  ? 0.9
                  : 0.45
                : isAssigned
                  ? isFocused
                    ? 0.78
                    : 0.28
                  : showUnassignedObject
                    ? 0.32
                    : 0
            }
            pointerEvents="all"
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${selected ? "Elemento selezionato" : "Seleziona elemento"}: ${obj.name}${assignmentLabel ? `, associato a ${assignmentLabel}` : ""}`}
            onPointerEnter={() => onHoverObject(obj.id)}
            onPointerLeave={() => onHoverObject(null)}
            onFocus={() => onHoverObject(obj.id)}
            onBlur={() => onHoverObject(null)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelectObject(obj.id);
            }}
          >
            {isAssigned && <title>{`${obj.name} → ${assignmentLabel}`}</title>}
            {renderGeometryShape(obj.geometry, {
              // Gli overlay restano hit-testabili ma non sporcano la pianta:
              // diventano visibili solo al passaggio del mouse o dopo la selezione.
              fill: selected
                ? "var(--selection-fill)"
                : hovered
                  ? "var(--camera-fill)"
                  : isAssigned
                    ? "var(--success-fill)"
                    : "transparent",
              stroke: selected || hovered ? "var(--accent-strong)" : isAssigned ? "var(--success)" : "transparent",
              strokeWidth: selected ? 5 : isAssigned ? 2.5 : 1.5,
              rx: 4,
            })}
            {isAssigned && !isHighlighted && (
              <g pointerEvents="none">
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={14}
                  fill="var(--success-soft)"
                  stroke="var(--success)"
                  strokeWidth={2}
                />
                <text
                  x={center.x}
                  y={center.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={15}
                  fontWeight={800}
                  fill="var(--success)"
                >
                  ✓
                </text>
              </g>
            )}
            {isHighlighted && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={selected ? 24 : 20}
                fontWeight={600}
                fill="var(--accent-strong)"
                pointerEvents="none"
              >
                {obj.name}{assignmentLabel ? ` · ${assignmentLabel}` : ""}
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
  focusRoomId,
  camera,
  viewpoints,
  selectedViewpointId,
  showObjects,
  objectAssignmentLabels,
  viewport,
  onViewportChange,
  onSelect,
  onSelectViewpoint,
}: FloorPlanRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startSvgX: number;
    startSvgY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    planX: number;
    planY: number;
  } | null>(null);

  const toSvgCoords = (clientX: number, clientY: number) => {
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

  const toPlanCoords = (clientX: number, clientY: number) => {
    const point = toSvgCoords(clientX, clientY);
    const currentViewport = viewportRef.current;
    return {
      x: (point.x - currentViewport.offsetX) / currentViewport.scale,
      y: (point.y - currentViewport.offsetY) / currentViewport.scale,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svgPoint = toSvgCoords(e.clientX, e.clientY);
    const { x, y } = toPlanCoords(e.clientX, e.clientY);
    setIsPointerDown(true);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvgX: svgPoint.x,
      startSvgY: svgPoint.y,
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
    const svgPoint = toSvgCoords(e.clientX, e.clientY);
    const dx = svgPoint.x - drag.startSvgX;
    const dy = svgPoint.y - drag.startSvgY;
    if (
      Math.abs(e.clientX - drag.startClientX) > 4 ||
      Math.abs(e.clientY - drag.startClientY) > 4
    ) {
      drag.moved = true;
    }
    if (drag.moved) {
      onViewportChange({
        ...viewportRef.current,
        offsetX: drag.offsetX + dx,
        offsetY: drag.offsetY + dy,
      });
    }
  };

  const handlePointerUp = () => {
    setIsPointerDown(false);
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (!drag.moved) {
      onSelect(
        hitTest(model, drag.planX, drag.planY, {
          includeObjects: showObjects,
          focusRoomId,
        })
      );
    }
  };

  const handlePointerCancel = () => {
    setIsPointerDown(false);
    dragRef.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={`w-full select-none rounded-md ${
        isPointerDown ? "cursor-grabbing" : "cursor-default"
      }`}
      style={{
        aspectRatio: `${geometry.width}/${geometry.height}`,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={() => setIsPointerDown(false)}
      role="group"
      aria-label={`Planimetria interattiva: ${model.name}`}
    >
      <title>{`Planimetria interattiva: ${model.name}`}</title>
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
          focusRoomId={focusRoomId}
          hoveredRoomId={hoveredRoomId}
          onHoverRoom={setHoveredRoomId}
          onSelectRoom={(roomId) => onSelect({ type: "room", id: roomId })}
        />

        {/* Linee vettoriali DXF (sopra, così i muri sono sempre netti) */}
        <VectorLayer geometry={geometry} />

        {/* Tutti gli oggetti restano sempre disponibili per la selezione */}
        {showObjects && (
          <ObjectLayer
            model={model}
            selection={selection}
            focusRoomId={focusRoomId}
            hoveredObjectId={hoveredObjectId}
            onHoverObject={setHoveredObjectId}
            objectAssignmentLabels={objectAssignmentLabels}
            onSelectObject={(objectId) => onSelect({ type: "object", id: objectId })}
          />
        )}

        <CameraLayer
          model={model}
          focusRoomId={focusRoomId}
          camera={camera}
          viewpoints={viewpoints}
          selectedViewpointId={selectedViewpointId}
          onSelectViewpoint={onSelectViewpoint}
        />
      </g>
    </svg>
  );
}

function CameraLayer({
  model,
  focusRoomId,
  camera,
  viewpoints,
  selectedViewpointId,
  onSelectViewpoint,
}: {
  model: FloorPlan;
  focusRoomId: string | null;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  onSelectViewpoint: (viewpoint: Viewpoint) => void;
}) {
  if (!camera || !focusRoomId) return null;

  const room = model.rooms.find((candidate) => candidate.id === focusRoomId);
  if (!room) return null;

  const roomBounds = geometryBounds(room.geometry);
  const coneLength = Math.min(170, Math.max(70, Math.min(roomBounds.width, roomBounds.height) * 0.45));
  const direction = ((camera.rotation - 90) * Math.PI) / 180;
  const halfFov = (camera.fov * Math.PI) / 360;
  const left = pointAtAngle(camera.x, camera.y, direction - halfFov, coneLength);
  const right = pointAtAngle(camera.x, camera.y, direction + halfFov, coneLength);
  const center = polygonCenter(room.geometry.points);

  return (
    <g>
      {viewpoints.map((viewpoint, index) => {
        const selected = selectedViewpointId === viewpoint.id;
        return (
          <g
            key={viewpoint.id}
            role="button"
            aria-label={`Seleziona ${viewpoint.label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelectViewpoint(viewpoint);
            }}
            tabIndex={0}
            aria-pressed={selected}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onSelectViewpoint(viewpoint);
            }}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={viewpoint.position.x}
              y1={viewpoint.position.y}
              x2={center.x}
              y2={center.y}
              stroke="var(--accent-strong)"
              strokeWidth={selected ? 3 : 1.5}
              strokeDasharray="8 8"
              opacity={selected ? 0.9 : 0.45}
              pointerEvents="none"
            />
            <circle
              cx={viewpoint.position.x}
              cy={viewpoint.position.y}
              r={selected ? 16 : 12}
              fill={selected ? "var(--accent-strong)" : "var(--surface)"}
              stroke="var(--accent)"
              strokeWidth={selected ? 4 : 2}
            />
            <text
              x={viewpoint.position.x}
              y={viewpoint.position.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={selected ? 17 : 14}
              fontWeight={700}
              fill={selected ? "var(--surface)" : "var(--text)"}
              pointerEvents="none"
            >
              {index + 1}
            </text>
          </g>
        );
      })}

      <path
        d={`M ${camera.x} ${camera.y} L ${left.x} ${left.y} A ${coneLength} ${coneLength} 0 0 1 ${right.x} ${right.y} Z`}
        fill="var(--camera-fill)"
        fillOpacity="1"
        stroke="var(--accent)"
        strokeWidth="2"
        pointerEvents="none"
      />
      <line
        x1={camera.x}
        y1={camera.y}
        x2={camera.x + Math.cos(direction) * coneLength}
        y2={camera.y + Math.sin(direction) * coneLength}
        stroke="var(--accent-strong)"
        strokeWidth="4"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <circle
        cx={camera.x}
        cy={camera.y}
        r={20}
        fill="var(--accent-strong)"
        stroke="var(--surface)"
        strokeWidth="4"
        pointerEvents="none"
      />
      <path
        d={`M ${camera.x - 10} ${camera.y + 8} L ${camera.x} ${camera.y - 10} L ${camera.x + 10} ${camera.y + 8} Z`}
        fill="var(--surface)"
        pointerEvents="none"
      />
    </g>
  );
}

function pointAtAngle(x: number, y: number, angle: number, distance: number) {
  return {
    x: x + Math.cos(angle) * distance,
    y: y + Math.sin(angle) * distance,
  };
}
