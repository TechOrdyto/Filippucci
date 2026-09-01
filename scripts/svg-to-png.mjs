#!/usr/bin/env node
/**
 * Converte l'anteprima SVG della piantina in PNG usando sharp.
 * Output: /tmp/floorplan-preview.png
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const SVG_PATH = "/tmp/floorplan-preview.svg";
const PNG_PATH = "/tmp/floorplan-preview.png";

const svg = readFileSync(SVG_PATH);
await sharp(svg, { density: 150 })
  .png()
  .toFile(PNG_PATH);
console.log(`✅ PNG: ${PNG_PATH}`);