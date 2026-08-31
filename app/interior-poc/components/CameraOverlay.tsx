"use client";

import { useRef, useState } from "react";
import type { CameraPosition, Viewpoint } from "../lib/camera/types";
import { directionFromRotation } from "../lib/camera/geometry";

interface CameraOverlayProps {
  camera: CameraPosition;
  scale: number;
  onCameraChange: (camera: CameraPosition) => void;
  viewpoints?: Viewpoint[];
  onSelectViewpoint?: (vp: Viewpoint) => void;
}

export default function CameraOverlay({
  camera,
  scale,
  onCameraChange,
  viewpoints = [],
  onSelectViewpoint,
}: CameraOverlayProps) {
  const [dragging, setDragging] = useState<"camera" | "rotation" | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cx = camera.x * scale;
  const cy = camera.y * scale;
  const dir = directionFromRotation(camera.rotation);
  const handleLen = 40;
  const hx = cx + dir.x * handleLen;
  const hy = cy + dir.y * handleLen;

  // Cono visuale
  const fovRad = (camera.fov * Math.PI) / 180;
  const coneLen = 60;
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
    const viewBox = svgRef.current.viewBox.baseVal;
    const mx = (px / rect.width) * viewBox.width / scale;
    const my = (py / rect.height) * viewBox.height / scale;

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
      viewBox={`0 0 ${camera.x * scale * 2} ${camera.y * scale * 2}`}
      style={{ overflow: "visible" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Cono visuale */}
      <polygon
        points={`${cx},${cy} ${leftX},${leftY} ${rightX},${rightY}`}
        fill="rgba(59, 130, 246, 0.15)"
        stroke="rgba(59, 130, 246, 0.4)"
        strokeWidth={1}
      />

      {/* Linea direzione */}
      <line
        x1={cx}
        y1={cy}
        x2={hx}
        y2={hy}
        stroke="#2563eb"
        strokeWidth={2}
        className="pointer-events-auto cursor-grab"
        onPointerDown={(e) => handlePointerDown(e, "rotation")}
      />

      {/* Handle rotazione */}
      <circle
        cx={hx}
        cy={hy}
        r={6}
        fill="#2563eb"
        stroke="#fff"
        strokeWidth={2}
        className="pointer-events-auto cursor-grab"
        onPointerDown={(e) => handlePointerDown(e, "rotation")}
      />

      {/* Camera */}
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="#1d4ed8"
        stroke="#fff"
        strokeWidth={2}
        className="pointer-events-auto cursor-move"
        onPointerDown={(e) => handlePointerDown(e, "camera")}
      />

      {/* Viewpoint suggeriti */}
      {viewpoints.map((vp) => (
        <g
          key={vp.id}
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelectViewpoint?.(vp)}
        >
          <circle
            cx={vp.position.x * scale}
            cy={vp.position.y * scale}
            r={5}
            fill="rgba(16, 185, 129, 0.6)"
            stroke="#10b981"
            strokeWidth={1.5}
          />
          <title>{vp.label}</title>
        </g>
      ))}
    </svg>
  );
}