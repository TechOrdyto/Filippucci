// Script per estrarre le POSIZIONI RELATIVE reali delle stanze dalla piantina
// Usa OpenAI vision per identificare dove sta ogni stanza nell'immagine
// Uso: node scripts/extract-room-positions.mjs <path-immagine>

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Uso: node scripts/extract-room-positions.mjs <path-immagine>");
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("❌ OPENAI_API_KEY non configurata");
  process.exit(1);
}

const imageBuffer = readFileSync(resolve(imagePath));
const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;

console.log(`📷 Immagine caricata: ${imagePath}`);

const systemPrompt = `Sei un architetto esperto. Analizza la piantina architettonica "Piano Rialzato".

Il tuo compito è identificare la POSIZIONE ESATTA di ogni stanza nell'immagine.

Le posizioni sono espresse in PERCENTUALE (0-100) rispetto all'immagine:
- x: distanza dal bordo sinistro in % della larghezza totale
- y: distanza dal bordo superiore in % dell'altezza totale
- width: larghezza in % della larghezza totale
- height: altezza in % dell'altezza totale

Le stanze note (con superfici):
- Bagno: 4.58 mq
- WC: 4.17 mq
- Cucina/Soggiorno: 47.09 mq (la più grande)
- Camera: 10.72 mq
- Anti/Ingresso piccolo: 2.08 mq
- Guardaroba: 4.19 mq
- Camera: 14.51 mq
- Ingresso: 8.36 mq
- Camera: 16.31 mq
- Balcone: 5.60 mq

REGOLE:
1. Osserva ATTENTAMENTE l'immagine e identifica dove sta OGNI stanza
2. Le posizioni devono rispecchiare ESATTAMENTE la disposizione nel disegno
3. Le stanze NON devono sovrapporsi
4. La somma delle larghezze su ogni riga ≈ 100%
5. La somma delle altezze su ogni colonna ≈ 100%
6. Nord è in alto, Sud in basso, Ovest a sinistra, Est a destra

Rispondi SOLO con JSON:
{
  "rooms": [
    { "name": "Bagno", "area": 4.58, "x": 0, "y": 0, "width": 24, "height": 9 },
    ...
  ]
}`;

console.log("🤖 Invio a gpt-4o-mini (visione)...");

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  }),
});

if (!res.ok) {
  const data = await res.json().catch(() => null);
  console.error("❌ Errore API:", data?.error?.message ?? res.status);
  process.exit(1);
}

const data = await res.json();
const content = data.choices?.[0]?.message?.content ?? "";
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("❌ Nessun JSON:", content.slice(0, 1000));
  process.exit(1);
}

const result = JSON.parse(jsonMatch[0]);
console.log("📄 Posizioni relative estratte:");
for (const room of result.rooms ?? []) {
  console.log(
    `   - ${room.name}: x=${room.x}% y=${room.y}% w=${room.width}% h=${room.height}%`
  );
}

// Converti in metri (15.10 × 15.10)
const W = 15.1;
const H = 15.1;
const floorplan = {
  id: "piano-rialzato",
  name: "Piano Rialzato",
  unit: "m",
  dimensions: { width: W, height: H },
  ceilingHeight: 2.75,
  rooms: (result.rooms ?? []).map((room, i) => ({
    id: slugify(room.name) + "-" + (i + 1),
    name: room.name,
    area: room.area ?? Math.round(((room.width / 100) * W) * ((room.height / 100) * H) * 100) / 100,
    bounds: {
      x: Math.round(((room.x ?? 0) / 100) * W * 100) / 100,
      y: Math.round(((room.y ?? 0) / 100) * H * 100) / 100,
      width: Math.round(((room.width ?? 0) / 100) * W * 100) / 100,
      height: Math.round(((room.height ?? 0) / 100) * H * 100) / 100,
    },
    openings: [],
  })),
};

// Salva
writeFileSync(resolve("app/interior-poc/data/floorplan.json"), JSON.stringify(floorplan, null, 2));
console.log(`\n✅ floorplan.json aggiornato con ${floorplan.rooms.length} stanze`);
console.log("   (le aperture verranno aggiunte dopo)");

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}