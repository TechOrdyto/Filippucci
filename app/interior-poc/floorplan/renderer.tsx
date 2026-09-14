"use client";

import { useRef, useState } from "react";
import type { FloorPlanGeometry } from "./source";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import type { FloorPlan, Geometry, Selection } from "./types";
import type { Viewport } from "./viewport";
import { zoomAt } from "./viewport";
import { geometryBounds, polygonCenter } from "./geometry";
import { hitTest } from "./selection";

interface FloorPlanRendererProps {
  geometry: FloorPlanGeometry;
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  isCameraSet: boolean;
  showObjects: boolean;
  objectAssignmentLabels?: Record<string, string>;
  assignedObjectIds?: string[];
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  onSelect: (s: Selection | null) => void;
  onRemoveObjectProduct: (objectId: string) => void;
  onSelectViewpoint: (viewpoint: Viewpoint | null) => void;
  onRotateCamera: (delta: number) => void;
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
              fill="transparent"
              stroke="transparent"
              strokeWidth={0}
              strokeDasharray={undefined}
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
            {!isFocused && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isSelected || isFocused ? 40 : isHovered ? 34 : 28}
                fontWeight={isSelected || isFocused || isHovered ? 700 : 500}
                fill={isSelected || isFocused || isHovered ? "var(--accent-strong)" : "var(--text-muted)"}
                opacity={isSelected || isFocused || isHovered ? 1 : 0.72}
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
  assignedObjectIds,
  scale,
  onRemoveObjectProduct,
  onSelectObject,
}: {
  model: FloorPlan;
  selection: Selection | null;
  focusRoomId: string | null;
  hoveredObjectId: string | null;
  onHoverObject: (objectId: string | null) => void;
  objectAssignmentLabels?: Record<string, string>;
  assignedObjectIds?: string[];
  scale: number;
  onRemoveObjectProduct: (objectId: string) => void;
  onSelectObject: (objectId: string) => void;
}) {
  return (
    <g>
      {model.objects.map((obj) => {
        const assignmentLabel = objectAssignmentLabels?.[obj.id];
        const isAssigned = Boolean(assignmentLabel) || assignedObjectIds?.includes(obj.id) === true;
        const isInActiveRoom = Boolean(focusRoomId) && obj.roomId === focusRoomId;
        const isReferenceOnly = !isInActiveRoom && isAssigned;
        if (!isInActiveRoom && !isAssigned) return null;

        const selected = selection?.type === "object" && selection.id === obj.id;
        const hovered = hoveredObjectId === obj.id;
        const bounds = geometryBounds(obj.geometry);
        const isHighlighted = !isReferenceOnly && (selected || hovered);
        const showUnassignedObject = Boolean(focusRoomId) && isInActiveRoom;
        return (
          <g
            key={obj.id}
            opacity={
              isReferenceOnly
                ? 1
                : isHighlighted
                  ? 0.9
                  : isAssigned
                    ? 0.78
                    : showUnassignedObject
                      ? 0.32
                      : 0
            }
            pointerEvents={isReferenceOnly ? "none" : "all"}
            role="button"
            tabIndex={isReferenceOnly ? -1 : 0}
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
            {!isReferenceOnly &&
              renderGeometryShape(obj.geometry, {
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
            {isAssigned && (
              <AssignmentBadge
                bounds={bounds}
                label={assignmentLabel}
                showName={Boolean(assignmentLabel) && scale >= 0.8}
                showRemove={isInActiveRoom}
                onRemove={() => onRemoveObjectProduct(obj.id)}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function AssignmentBadge({
  bounds,
  label,
  showName,
  showRemove,
  onRemove,
}: {
  bounds: ReturnType<typeof geometryBounds>;
  label?: string;
  showName: boolean;
  showRemove: boolean;
  onRemove: () => void;
}) {
  const [isRemoveHovered, setIsRemoveHovered] = useState(false);
  const displayLabel = label
    ? label.length > 24
      ? `${label.slice(0, 23)}…`
      : label
    : null;
  const badgeHeight = 28;
  const contentWidth = showName && displayLabel ? Math.max(72, displayLabel.length * 6.2 + 34) : 28;
  const badgeWidth = contentWidth;
  const x = bounds.x;
  const y = bounds.y - badgeHeight - 8;

  return (
    <g
      transform={`translate(${x} ${y})`}
      pointerEvents={showRemove ? "all" : "none"}
      aria-hidden={showRemove ? undefined : true}
      filter="drop-shadow(0 2px 4px rgba(20, 35, 42, 0.2))"
    >
      <rect
        x={0}
        y={0}
        width={badgeWidth}
        height={badgeHeight}
        rx={7}
        fill="var(--success)"
        stroke="var(--success)"
        strokeWidth={1.5}
      />
      <circle
        cx={14}
        cy={14}
        r={9}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={1.5}
      />
      <text
        x={14}
        y={14.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={800}
        fill="var(--success)"
      >
        ✓
      </text>
      {showName && displayLabel && (
        <text
          x={29}
          y={14.5}
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={700}
          fill="#ffffff"
        >
          {displayLabel}
        </text>
      )}
      {showRemove && (
        <g
          role="button"
          tabIndex={0}
          aria-label={`Rimuovi associazione${label ? `: ${label}` : ""}`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerEnter={() => setIsRemoveHovered(true)}
          onPointerLeave={() => setIsRemoveHovered(false)}
          onFocus={() => setIsRemoveHovered(true)}
          onBlur={() => setIsRemoveHovered(false)}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="focus:outline-none"
          style={{ cursor: "pointer", outline: "none" }}
        >
          <rect
            x={contentWidth - 8}
            y={-8}
            width={16}
            height={16}
            fill="transparent"
          />
          <circle
            cx={contentWidth}
            cy={0}
            r={7}
            fill={isRemoveHovered ? "var(--success)" : "#ffffff"}
            stroke="var(--success)"
            strokeWidth={1.5}
            style={{
              filter: isRemoveHovered
                ? "drop-shadow(0 1px 2px rgba(20, 35, 42, 0.36))"
                : "drop-shadow(0 1px 1px rgba(20, 35, 42, 0.28))",
            }}
          />
          <text
            x={contentWidth}
            y={1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fontWeight={800}
            fill={isRemoveHovered ? "#ffffff" : "var(--success)"}
          >
            ×
          </text>
        </g>
      )}
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
  isCameraSet,
  showObjects,
  objectAssignmentLabels,
  assignedObjectIds,
  onRemoveObjectProduct,
  viewport,
  onViewportChange,
  onSelect,
  onSelectViewpoint,
  onRotateCamera,
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
    if (isFloorplanOverlayTarget(e.target)) return;

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
          includeObjects: showObjects && Boolean(focusRoomId),
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

        {/* Gli arredi diventano interattivi solo dopo la selezione di una stanza. */}
        {showObjects && (
          <ObjectLayer
            model={model}
            selection={selection}
            focusRoomId={focusRoomId}
            hoveredObjectId={hoveredObjectId}
            onHoverObject={setHoveredObjectId}
            objectAssignmentLabels={objectAssignmentLabels}
            assignedObjectIds={assignedObjectIds}
            scale={viewport.scale}
            onRemoveObjectProduct={onRemoveObjectProduct}
            onSelectObject={(objectId) => onSelect({ type: "object", id: objectId })}
          />
        )}

        <CameraLayer
          model={model}
          focusRoomId={focusRoomId}
          camera={camera}
          viewpoints={viewpoints}
          selectedViewpointId={selectedViewpointId}
          isCameraSet={isCameraSet}
          onSelectViewpoint={onSelectViewpoint}
          onRotateCamera={onRotateCamera}
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
  isCameraSet,
  onSelectViewpoint,
  onRotateCamera,
}: {
  model: FloorPlan;
  focusRoomId: string | null;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  isCameraSet: boolean;
  onSelectViewpoint: (viewpoint: Viewpoint | null) => void;
  onRotateCamera: (delta: number) => void;
}) {
  if (!camera || !focusRoomId) return null;

  const room = model.rooms.find((candidate) => candidate.id === focusRoomId);
  if (!room) return null;

  const roomBounds = geometryBounds(room.geometry);
  const coneLength = Math.min(130, Math.max(60, Math.min(roomBounds.width, roomBounds.height) * 0.32));
  const direction = ((camera.rotation - 90) * Math.PI) / 180;
  const halfFov = (camera.fov * Math.PI) / 360;
  const left = pointAtAngle(camera.x, camera.y, direction - halfFov, coneLength);
  const right = pointAtAngle(camera.x, camera.y, direction + halfFov, coneLength);
  const rotateControlDistance = coneLength * 0.72;
  const rotateLeft = pointAtAngle(camera.x, camera.y, direction - halfFov, rotateControlDistance);
  const rotateRight = pointAtAngle(camera.x, camera.y, direction + halfFov, rotateControlDistance);
  const activeViewpoint = selectedViewpointId
    ? viewpoints.find((viewpoint) => viewpoint.id === selectedViewpointId) ?? null
    : null;
  const isAtOriginalCameraPosition = Boolean(
    activeViewpoint && sameCameraRotation(camera.rotation, activeViewpoint.rotation)
  );
  const cameraActionLabel = isAtOriginalCameraPosition
    ? "Deseleziona visuale"
    : "Ripristina angolazione originale";

  return (
    <g>
      {viewpoints.map((viewpoint, index) => {
        const selected = selectedViewpointId === viewpoint.id;
        const isAtOriginalPosition = selected && sameCameraRotation(camera.rotation, viewpoint.rotation);
        return (
          <g
            key={viewpoint.id}
            data-floorplan-overlay="true"
            role="button"
            aria-label={`${selected ? "Deseleziona" : "Seleziona"} ${viewpoint.label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelectViewpoint(selected && isAtOriginalPosition ? null : viewpoint);
            }}
            tabIndex={0}
            aria-pressed={selected}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onSelectViewpoint(selected && isAtOriginalPosition ? null : viewpoint);
            }}
            className="focus:outline-none"
            style={{ cursor: "pointer", outline: "none" }}
          >
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

      {isCameraSet && (
        <>
          <path
            d={`M ${camera.x} ${camera.y} L ${left.x} ${left.y} A ${coneLength} ${coneLength} 0 0 1 ${right.x} ${right.y} Z`}
            fill="var(--camera-fill)"
            fillOpacity="1"
            stroke="var(--accent)"
            strokeWidth="2"
            pointerEvents="none"
          />
          <CameraRotateControl
            x={rotateLeft.x}
            y={rotateLeft.y}
            direction="left"
            onRotate={() => onRotateCamera(-15)}
          />
          <CameraRotateControl
            x={rotateRight.x}
            y={rotateRight.y}
            direction="right"
            onRotate={() => onRotateCamera(15)}
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
          {activeViewpoint && (
            <g
              data-floorplan-overlay="true"
              role="button"
              tabIndex={0}
              aria-label={cameraActionLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelectViewpoint(isAtOriginalCameraPosition ? null : activeViewpoint);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onSelectViewpoint(isAtOriginalCameraPosition ? null : activeViewpoint);
              }}
              className="focus:outline-none"
              style={{ cursor: "pointer", outline: "none" }}
            >
              <circle
                cx={camera.x}
                cy={camera.y}
                r={28}
                fill="transparent"
                pointerEvents="all"
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
            </g>
          )}
        </>
      )}
    </g>
  );
}

function CameraRotateControl({
  x,
  y,
  direction,
  onRotate,
}: {
  x: number;
  y: number;
  direction: "left" | "right";
  onRotate: () => void;
}) {
  const label = direction === "left" ? "sinistra" : "destra";
  return (
    <g
      data-floorplan-overlay="true"
      data-floorplan-camera-control="true"
      role="button"
      tabIndex={0}
      aria-label={`Ruota visuale a ${label} di 15 gradi`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onRotate();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onRotate();
      }}
      className="focus:outline-none"
      style={{ cursor: "pointer", outline: "none" }}
    >
      <circle
        cx={x}
        cy={y}
        r={15}
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth={2}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={18}
        fontWeight={500}
        fill="var(--text)"
        pointerEvents="none"
      >
        {direction === "left" ? "↺" : "↻"}
      </text>
    </g>
  );
}

function isFloorplanOverlayTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-floorplan-overlay]"));
}

function pointAtAngle(x: number, y: number, angle: number, distance: number) {
  return {
    x: x + Math.cos(angle) * distance,
    y: y + Math.sin(angle) * distance,
  };
}

function sameCameraRotation(first: number, second: number) {
  const difference = Math.abs((((first - second) % 360) + 540) % 360 - 180);
  return difference < 0.5;
}
