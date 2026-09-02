#!/usr/bin/env node
/**
 * Genera un'anteprima SVG della piantina DXF per visualizzare la geometria.
 * Output: /tmp/floorplan-preview.svg
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = JSON.parse(
  readFileSync(resolve("app/interior-poc/data/floorplan-dxf.json"), "utf8")
);

const { width, height, lines } = DATA;
const PAD = 20;

// Colori per layer
const COLORS = {
  walls: "#1f2937",
  details: "#9ca3af",
};

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}" width="${width + PAD * 2}" height="${height + PAD * 2}">`
);
parts.push(`<rect x="${-PAD}" y="${-PAD}" width="${width + PAD * 2}" height="${height + PAD * 2}" fill="#fafaf9"/>`);

for (const line of lines) {
  const color = COLORS[line.layer] ?? "#6b7280";
  const sw = line.layer === "walls" ? 1.2 : 0.4;
  parts.push(
    `<line x1="${line.start[0]}" y1="${line.start[1]}" x2="${line.end[0]}" y2="${line.end[1]}" stroke="${color}" stroke-width="${sw}"/>`
  );
}

parts.push(`</svg>`);
writeFileSync("/tmp/floorplan-preview.svg", parts.join("\n"));
console.log(`✅ Anteprima: /tmp/floorplan-preview.svg (${width}×${height})`);