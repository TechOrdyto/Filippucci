#!/usr/bin/env node
/**
 * Importa il DXF vettoriale della piantina nel modulo planimetria.
 *
 * Il DXF (Illuminazione_test_vector.dxf) contiene migliaia di entità LINE
 * sui layer PDF_STROKES (muri/tratti principali) e PDF_FILLS_OUTLINE
 * (contorni di riempimenti/oggetti).
 *
 * Output:
 *  - app/interior-poc/data/floorplan-dxf.json  → geometria vettoriale grezza
 *    (linee scalate nel sistema di coordinate della planimetria)
 *
 * La geometria viene trattata come geometria: nessuna AI/OCR.
 * Le stanze semantiche restano definite manualmente in floorplan-model.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const DXF_PATH = resolve("document/dxf/Illuminazione_test_vector.dxf");
const OUT_PATH = resolve("app/interior-poc/data/floorplan-dxf.json");

// Fattore di scala: le unità CAD del DXF sono in decimi di unità piano.
// Bounding box del disegno ≈ 11838 × 13604 → piano ≈ 1184 × 1360.
const SCALE = 10;

// Nomi layer normalizzati: la sorgente è SOLO il DXF.
// I layer del CAD originale derivavano da una conversione PDF→DXF,
// qui vengono rinominati in termini puramente vettoriali.
const LAYER_MAP = {
  PDF_STROKES: "walls",
  PDF_FILLS_OUTLINE: "details",
};

function parseDxf(filePath) {
  const text = readFileSync(filePath, "utf8");
  const rawLines = text.split("\n");

  // Coppie [codice, valore]
  const pairs = [];
  for (let i = 0; i < rawLines.length; i += 2) {
    const code = rawLines[i]?.trim();
    const value = rawLines[i + 1]?.trim();
    if (code === undefined) break;
    pairs.push([code, value ?? ""]);
  }

  // Raccogli le entità (ognuna inizia con codice 0 + tipo)
  const entities = [];
  let cur = null;
  for (const [code, value] of pairs) {
    if (code === "0") {
      if (cur) entities.push(cur);
      cur = { type: value };
    } else if (cur) {
      cur[code] = value;
    }
  }
  if (cur) entities.push(cur);

  return entities;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function main() {
  console.log(`📄 Parsing DXF: ${DXF_PATH}`);
  const entities = parseDxf(DXF_PATH);
  console.log(`   Entità totali: ${entities.length}`);

  // Statistiche per tipo
  const byType = {};
  for (const e of entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  console.log("   Per tipo:", JSON.stringify(byType));

  // Statistiche per layer (solo entità geometriche)
  const byLayer = {};
  for (const e of entities) {
    if (["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "SPLINE", "ELLIPSE", "TEXT", "MTEXT", "INSERT", "HATCH"].includes(e.type)) {
      const layer = e["8"] ?? "?";
      byLayer[layer] = (byLayer[layer] ?? 0) + 1;
    }
  }
  console.log("   Per layer:", JSON.stringify(byLayer));

  // Estrai le linee
  const lines = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const e of entities) {
    if (e.type !== "LINE") continue;
    const layer = e["8"] ?? "?";
    const x1 = num(e["10"]), y1 = num(e["20"]);
    const x2 = num(e["11"]), y2 = num(e["21"]);
    // Salta linee degeneri (zero-length)
    if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) continue;

    const sx = x1 / SCALE, sy = y1 / SCALE;
    const ex = x2 / SCALE, ey = y2 / SCALE;

    minX = Math.min(minX, sx, ex);
    minY = Math.min(minY, sy, ey);
    maxX = Math.max(maxX, sx, ex);
    maxY = Math.max(maxY, sy, ey);

    lines.push({
      layer: LAYER_MAP[layer] ?? layer,
      start: [Math.round(sx * 100) / 100, Math.round(sy * 100) / 100],
      end: [Math.round(ex * 100) / 100, Math.round(ey * 100) / 100],
    });
  }

  console.log(`   Linee estratte: ${lines.length}`);
  console.log(`   Bounding box (scalato): x [${minX}, ${maxX}] y [${minY}, ${maxY}]`);

  const width = Math.round((maxX - minX) * 100) / 100;
  const height = Math.round((maxY - minY) * 100) / 100;
  console.log(`   Dimensioni piano: ${width} × ${height}`);

  const output = {
    id: "piano-rialzato-dxf",
    name: "Piano Rialzato (DXF)",
    unit: "piano",
    scale: SCALE,
    width,
    height,
    bounds: {
      minX: Math.round(minX * 100) / 100,
      minY: Math.round(minY * 100) / 100,
      maxX: Math.round(maxX * 100) / 100,
      maxY: Math.round(maxY * 100) / 100,
    },
    lines,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✅ Scritto: ${OUT_PATH} (${(output.lines.length * 0.09).toFixed(1)} KB)`);
}

main();