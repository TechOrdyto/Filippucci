// Script per ritagliare le foto DEVON dalle pagine del catalogo Dining
// Usa AI vision per identificare i bounding box dei prodotti (senza testo)
// Uso: node scripts/crop-devon.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// Carica le variabili d'ambiente da .env.local
try {
  const envContent = readFileSync(resolve(".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {}

const sharp = (await import("sharp")).default;

// Regioni grezze estratte dalle pagine (bbox verificati dall'ingestion)
const REGIONS = [
  { page: 1, bbox: { x: 50, y: 0, width: 50, height: 100 }, name: "devon-p1-right" },
  { page: 1, bbox: { x: 6, y: 75, width: 36, height: 19 }, name: "devon-p1-detail" },
  { page: 2, bbox: { x: 0, y: 10, width: 95, height: 90 }, name: "devon-p2-main" },
  { page: 3, bbox: { x: 0, y: 0, width: 50, height: 100 }, name: "devon-p3-left" },
  { page: 3, bbox: { x: 50, y: 10, width: 50, height: 73 }, name: "devon-p3-right" },
];

const rawDir = "public/products/devon/raw";
const outDir = "public/products/devon";
mkdirSync(resolve(outDir), { recursive: true });

const systemPrompt = `Sei un esperto di cataloghi di arredamento Molteni&C.
Analizza l'immagine di una pagina di catalogo.
Identifica il bounding box del PRODOTTO (sedia, poltrona, sgabello) nell'immagine.
IGNORA completamente: testo, didascalie, scritte, loghi, margini, sfondi, tabelle prezzi.
Se ci sono più prodotti, scegli il più grande e centrale.
Rispondi SOLO con JSON:
{"x": percentuale dal bordo sinistro (0-100), "y": percentuale dal bordo superiore (0-100), "width": larghezza in percentuale (0-100), "height": altezza in percentuale (0-100)}
Il bounding box deve contenere SOLO il prodotto, senza testo.
Rispondi SOLO con JSON valido, nessun altro testo.`;

async function findBbox(imageDataUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = apiKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://opencode.ai/zen/v1/chat/completions";
  const authKey = apiKey ?? "public";
  const model = apiKey ? "gpt-4o-mini" : "mimo-v2.5-free";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }] },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `API error ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

async function cropImage(imageDataUrl, bbox) {
  const base64 = imageDataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");
  const meta = await sharp(buffer).metadata();
  const width = meta.width;
  const height = meta.height;

  let left = Math.round((bbox.x / 100) * width);
  let top = Math.round((bbox.y / 100) * height);
  let w = Math.round((bbox.width / 100) * width);
  let h = Math.round((bbox.height / 100) * height);

  // Margine piccolo
  const margin = Math.round(Math.min(width, height) * 0.02);
  left = Math.max(0, left - margin);
  top = Math.max(0, top - margin);
  w = Math.min(width - left, w + margin * 2);
  h = Math.min(height - top, h + margin * 2);

  return await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer();
}

for (const region of REGIONS) {
  const src = `data/ingestion/normalized/catalog-ccd2f7b6c335a800-p${region.page}.png`;
  const rawPath = join(resolve(rawDir), `${region.name}.png`);
  const imageBuffer = readFileSync(rawPath);
  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  console.log(`🔍 Analisi ${region.name}...`);
  try {
    const bbox = await findBbox(imageDataUrl);
    if (!bbox) {
      console.log(`   ⚠️ Nessun prodotto identificato, uso il crop grezzo`);
      writeFileSync(join(resolve(outDir), `${region.name}.png`), imageBuffer);
      continue;
    }
    const cropped = await cropImage(imageDataUrl, bbox);
    writeFileSync(join(resolve(outDir), `${region.name}.png`), cropped);
    console.log(`   ✅ ${region.name} → ${bbox.x}%,${bbox.y}% ${bbox.width}%×${bbox.height}%`);
  } catch (err) {
    console.log(`   ❌ Errore: ${err.message}`);
  }
}

console.log(`\n✅ Devon crops in ${resolve(outDir)}`);
