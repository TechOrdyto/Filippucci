"use client";

import { useRef, useState } from "react";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import { directionFromRotation } from "../lib/camera/geometry";

interface CameraOverlayProps {
  camera: CameraPosition;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  viewBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  onCameraChange: (camera: CameraPosition) => void;
  viewpoints?: Viewpoint[];
  onSelectViewpoint?: (vp: Viewpoint) => void;
}

export default function CameraOverlay({
  camera,
  scale,
  canvasWidth,
  canvasHeight,
  viewBox,
  onCameraChange,
  viewpoints = [],
  onSelectViewpoint,
}: CameraOverlayProps) {
  const [dragging, setDragging] = useState<"camera" | "rotation" | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayViewBox = viewBox ?? {
    x: 0,
    y: 0,
    width: canvasWidth * scale,
    height: canvasHeight * scale,
  };
  const zoomFactor = Math.max(1, (canvasWidth * scale) / overlayViewBox.width);
  const overlayScale = 1 / zoomFactor;

  const cx = camera.x * scale;
  const cy = camera.y * scale;
  const dir = directionFromRotation(camera.rotation);
  const handleLen = 40 * overlayScale;
  const hx = cx + dir.x * handleLen;
  const hy = cy + dir.y * handleLen;

  // Cono visuale
  const fovRad = (camera.fov * Math.PI) / 180;
  const coneLen = 60 * overlayScale;
  const baseAngle = ((camera.rotation - 90) * Math.PI) / 180;
  const leftAngle = baseAngle - fovRad / 2;
  const rightAngle = baseAngle + fovRad / 2;
  const leftX = cx + Math.cos(leftAngle) * coneLen;
  const leftY = cy + Math.sin(leftAngle) * coneLen;
  const rightX = cx + Math.cos(rightAngle) * coneLen;
  const rightY = cy + Math.sin(rightAngle) * coneLen;

  const handlePointerDown = (e: React.PointerEvent, type: "camera" | "rotation") => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Converti pixel → metri (usando viewBox)
    const currentViewBox = svgRef.current.viewBox.baseVal;
    const mx = (currentViewBox.x + (px / rect.width) * currentViewBox.width) / scale;
    const my = (currentViewBox.y + (py / rect.height) * currentViewBox.height) / scale;

    if (dragging === "camera") {
      onCameraChange({
        ...camera,
        x: Math.round(mx * 100) / 100,
        y: Math.round(my * 100) / 100,
      });
    } else if (dragging === "rotation") {
      const dx = mx - camera.x;
      const dy = my - camera.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const rotation = (angle + 90 + 360) % 360;
      onCameraChange({
        ...camera,
        rotation: Math.round(rotation),
      });
    }
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`${overlayViewBox.x} ${overlayViewBox.y} ${overlayViewBox.width} ${overlayViewBox.height}`}
      style={{ overflow: "visible" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Cono visuale */}
      <polygon
        points={`${cx},${cy} ${leftX},${leftY} ${rightX},${rightY}`}
        fill="var(--camera-fill)"
        stroke="var(--accent)"
        strokeWidth={overlayScale}
      />

      {/* Linea direzione */}
      <line
        x1={cx}
        y1={cy}
        x2={hx}
        y2={hy}
        stroke="var(--accent-strong)"
        strokeWidth={2 * overlayScale}
        className="pointer-events-auto cursor-grab"
        onPointerDown={(e) => handlePointerDown(e, "rotation")}
      />

      {/* Handle rotazione */}
      <circle
        cx={hx}
        cy={hy}
        r={6 * overlayScale}
        fill="var(--accent-strong)"
        stroke="#fff"
        strokeWidth={2 * overlayScale}
        className="pointer-events-auto cursor-grab"
        onPointerDown={(e) => handlePointerDown(e, "rotation")}
      />

      {/* Camera */}
      <circle
        cx={cx}
        cy={cy}
        r={8 * overlayScale}
        fill="var(--accent-strong)"
        stroke="#fff"
        strokeWidth={2 * overlayScale}
        className="pointer-events-auto cursor-move"
        onPointerDown={(e) => handlePointerDown(e, "camera")}
      />

      {/* Viewpoint suggeriti */}
      {viewpoints.map((vp, index) => (
        <g
          key={vp.id}
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelectViewpoint?.(vp)}
        >
          <circle
            cx={vp.position.x * scale}
            cy={vp.position.y * scale}
            r={5 * overlayScale}
            fill="var(--success)"
            stroke="var(--surface)"
            strokeWidth={1.5 * overlayScale}
          />
          <title>{`Visuale ${index + 1}`}</title>
        </g>
      ))}
    </svg>
  );
}
