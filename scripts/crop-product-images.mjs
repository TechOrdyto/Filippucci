// Script per ritagliare le immagini dei prodotti usando AI vision
// Identifica il bounding box del prodotto nell'immagine e ritaglia
// Uso: node scripts/crop-product-images.mjs [cartella-immagini]
// Esempio: node scripts/crop-product-images.mjs public/products/sofas

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";

// Carica le variabili d'ambiente da .env.local
try {
  const envContent = readFileSync(resolve(".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {
  // .env.local non trovato
}

const inputDir = process.argv[2] ?? "public/products/sofas";
const outputDir = join(inputDir, "cropped");

// Leggi tutte le immagini nella cartella
const files = readdirSync(resolve(inputDir)).filter((f) =>
  /\.(png|jpe?g|webp)$/i.test(f)
);

mkdirSync(resolve(outputDir), { recursive: true });

console.log(`📦 Trovate ${files.length} immagini in ${inputDir}`);
console.log("🤖 Invio a mimo-v2.5-free (visione) per identificare i prodotti...\n");

for (const file of files) {
  const filePath = join(resolve(inputDir), file);
  const imageBuffer = readFileSync(filePath);
  const mime = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;

  console.log(`🔍 Analisi: ${file}...`);

  try {
    const bbox = await findProductBoundingBox(imageDataUrl, file);
    if (!bbox) {
      console.log(`   ⚠️ Prodotto non identificato, salto`);
      continue;
    }

    // Ritaglia l'immagine
    const cropped = await cropImage(imageDataUrl, bbox);
    const outputPath = join(resolve(outputDir), file);
    writeFileSync(outputPath, cropped);
    console.log(`   ✅ Ritagliata: ${file} → ${bbox.x}%,${bbox.y}% ${bbox.width}%×${bbox.height}%`);
  } catch (err) {
    console.log(`   ❌ Errore: ${err.message}`);
  }
}

console.log(`\n✅ Immagini ritagliate in ${resolve(outputDir)}`);

// ─── Funzioni ─────────────────────────────────────────────────────

async function findProductBoundingBox(imageDataUrl, filename) {
  const systemPrompt = `Sei un esperto di cataloghi di arredamento.
Analizza l'immagine di una pagina di catalogo Molteni&C.
Identifica il bounding box del PRODOTTO (divano, poltrona, tavolo, ecc.) nell'immagine.
IGNORA completamente: testo, didascalie, scritte, loghi, margini, sfondi.

Rispondi SOLO con JSON:
{
  "x": percentuale dal bordo sinistro (0-100),
  "y": percentuale dal bordo superiore (0-100),
  "width": larghezza in percentuale (0-100),
  "height": altezza in percentuale (0-100)
}

Il bounding box deve contenere SOLO il prodotto, senza testo.
Se ci sono più prodotti, scegli il più grande/centrale.
Rispondi SOLO con JSON valido, nessun altro testo.`;

  // Usa OpenAI (gpt-4o-mini, economico) se configurato, altrimenti opencode zen
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = apiKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://opencode.ai/zen/v1/chat/completions";
  const authKey = apiKey ?? "public";
  const model = apiKey ? "gpt-4o-mini" : "mimo-v2.5-free";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: imageDataUrl } }],
        },
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

  const bbox = JSON.parse(jsonMatch[0]);
  // Valida i valori
  if (
    typeof bbox.x !== "number" ||
    typeof bbox.y !== "number" ||
    typeof bbox.width !== "number" ||
    typeof bbox.height !== "number"
  ) {
    return null;
  }
  return bbox;
}

async function cropImage(imageDataUrl, bbox) {
  // Usa sharp per ritagliare (installato con canvas)
  const sharp = (await import("sharp")).default;

  // Decodifica base64
  const base64 = imageDataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");

  // Ottieni dimensioni originali
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width;
  const height = metadata.height;

  // Calcola il ritaglio in pixel
  const left = Math.round((bbox.x / 100) * width);
  const top = Math.round((bbox.y / 100) * height);
  const cropWidth = Math.round((bbox.width / 100) * width);
  const cropHeight = Math.round((bbox.height / 100) * height);

  // Ritaglia con un piccolo margine
  const margin = Math.round(Math.min(width, height) * 0.02);
  const safeLeft = Math.max(0, left - margin);
  const safeTop = Math.max(0, top - margin);
  const safeWidth = Math.min(width - safeLeft, cropWidth + margin * 2);
  const safeHeight = Math.min(height - safeTop, cropHeight + margin * 2);

  const cropped = await sharp(buffer)
    .extract({
      left: safeLeft,
      top: safeTop,
      width: safeWidth,
      height: safeHeight,
    })
    .toBuffer();

  return cropped;
}