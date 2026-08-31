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
                  stroke="#374151"
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
                      stroke="#1d4ed8"
                      strokeWidth={1}
                    />
                    {/* Battente porta (arco di apertura) */}
                    {opening.type === "door" && (
                      <path
                        d={`M ${cx - w / 2} ${cy} A ${w} ${w} 0 0 1 ${cx + w / 2} ${cy}`}
                        fill="none"
                        stroke="#d97706"
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
                fill={ROOM_COLORS[room.id] ?? "#f5f5f4"}
                stroke="#374151"
                strokeWidth={2}
              />
            ) : (
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
            )}
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