"use client";

import type { FloorplanData } from "../lib/types";

interface FloorplanViewerProps {
  floorplan: FloorplanData;
  scale?: number; // px per metro
}

const ROOM_COLORS: Record<string, string> = {
  "cucina-soggiorno": "#fef3c7",
  "camera-1": "#e0f2fe",
  "camera-2": "#dcfce7",
  "camera-3": "#fce7f3",
  bagno: "#e0e7ff",
  guardaroba: "#f3e8ff",
  ingresso: "#f5f5f4",
  balcone: "#d1fae5",
};

export default function FloorplanViewer({ floorplan, scale = 40 }: FloorplanViewerProps) {
  const { width, height } = floorplan.dimensions;
  const viewWidth = width * scale;
  const viewHeight = height * scale;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{floorplan.name}</h3>
        <span className="text-xs text-gray-500">
          {width}m × {height}m · soffitto {floorplan.ceilingHeight}m
        </span>
      </div>

      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full rounded-md"
        style={{ aspectRatio: `${width}/${height}` }}
      >
        {/* Sfondo */}
        <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="#fafaf9" />

        {/* Stanze */}
        {floorplan.rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.bounds.x * scale}
              y={room.bounds.y * scale}
              width={room.bounds.width * scale}
              height={room.bounds.height * scale}
              fill={ROOM_COLORS[room.id] ?? "#f5f5f4"}
              stroke="#374151"
              strokeWidth={2}
              rx={2}
            />
            <text
              x={(room.bounds.x + room.bounds.width / 2) * scale}
              y={(room.bounds.y + room.bounds.height / 2) * scale}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-700"
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
              className="fill-gray-500"
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
                    stroke="#1d4ed8"
                    strokeWidth={1.5}
                  />
                  {opening.type === "window" && (
                    <text
                      x={opening.position.x * scale}
                      y={opening.position.y * scale - 8}
                      textAnchor="middle"
                      fontSize={9}
                      className="fill-blue-700"
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
          className="fill-gray-500"
        >
          {width}m
        </text>
        <text
          x={viewWidth + 20}
          y={viewHeight / 2}
          textAnchor="middle"
          fontSize={11}
          className="fill-gray-500"
          transform={`rotate(90 ${viewWidth + 20} ${viewHeight / 2})`}
        >
          {height}m
        </text>
      </svg>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-400" /> Finestra
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Porta finestra
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Porta
        </span>
      </div>
    </div>
  );
}