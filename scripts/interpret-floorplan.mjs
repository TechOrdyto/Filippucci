// Script per interpretare la piantina dall'immagine usando la visione AI
// Approccio ibrido che PRESERVA la disposizione originale del disegno:
// 1. L'AI vision estrae le POSIZIONI RELATIVE (percentuali) delle stanze dall'immagine
// 2. Lo script converte le percentuali in metri reali usando le dimensioni totali
//    → la disposizione rispecchia il disegno originale, zero sovrapposizioni
// Uso: node scripts/interpret-floorplan.mjs <path-immagine> [output.json]

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const imagePath = process.argv[2];
const outputPath = process.argv[3] ?? "app/interior-poc/data/floorplan.json";

if (!imagePath) {
  console.error("Uso: node scripts/interpret-floorplan.mjs <path-immagine> [output.json]");
  process.exit(1);
}

// Leggi immagine e converti in base64
const imageBuffer = readFileSync(resolve(imagePath));
const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;

console.log(`📷 Immagine caricata: ${imagePath} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);

const systemPrompt = `Sei un architetto esperto. Analizza l'immagine della piantina architettonica "Piano Rialzato".
Il tuo compito è elencare le stanze con nome, superficie e POSIZIONE RELATIVA nell'immagine.

La posizione relativa è espressa in percentuale (0-100) rispetto all'immagine:
- x: distanza dal bordo sinistro in % della larghezza totale
- y: distanza dal bordo superiore in % dell'altezza totale
- width: larghezza in % della larghezza totale
- height: altezza in % dell'altezza totale

Rispondi con JSON:
{
  "rooms": [
    { "name": "Bagno", "area": 4.58, "x": 0, "y": 0, "width": 24, "height": 9 },
    { "name": "WC", "area": 4.17, "x": 24, "y": 0, "width": 17, "height": 11 }
  ]
}

REGOLE:
1. Elenca TUTTE le stanze visibili nella piantina (bagni, camere, cucina/soggiorno, ingressi, guardaroba, balconi, anti, wc, ecc.)
2. Leggi le superfici scritte (es. "mq. 47.09", "mq, 4,19")
3. Le posizioni relative DEVONO rispecchiare la disposizione reale nel disegno (dove sta ogni stanza nell'immagine)
4. Le stanze NON devono sovrapporsi: la somma delle larghezze su una riga ≈ 100%, la somma delle altezze su una colonna ≈ 100%
5. NON inventare stanze che non esistono
6. Rispondi SOLO con JSON valido, nessun altro testo`;
  "rooms": [
    { "name": "Bagno", "area": 4.58 },
    { "name": "WC", "area": 4.17 }
  ]
}

REGOLE:
1. Elenca TUTTE le stanze visibili nella piantina (bagni, camere, cucina/soggiorno, ingressi, guardaroba, balconi, anti, wc, ecc.)
2. Leggi le superfici scritte (es. "mq. 47.09", "mq, 4,19")
3. NON inventare stanze che non esistono
4. NON calcolare coordinate o bounds — solo nomi e aree
5. Rispondi SOLO con JSON valido, nessun altro testo`;

console.log("🤖 Invio a mimo-v2.5-free (visione)...");

const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer public",
  },
  body: JSON.stringify({
    model: "mimo-v2.5-free",
    temperature: 0.1,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl } },
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
console.log("📄 Risposta ricevuta, estrazione JSON...");

// Estrai JSON dalla risposta
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("❌ Nessun JSON nella risposta:");
  console.error(content.slice(0, 2000));
  process.exit(1);
}

const floorplan = JSON.parse(jsonMatch[0]);

// ─── POST-PROCESSING: conversione posizioni relative → metri reali ───
// Le percentuali estratte dall'AI vision vengono convertite in metri
// usando le dimensioni totali reali (15.10m × 15.10m)
// → la disposizione rispecchia il disegno originale
console.log("🔍 Conversione posizioni relative → metri...");

const warnings = buildGeometryFromRelativePositions(floorplan);

if (warnings.length > 0) {
  console.log("⚠️ Note:");
  for (const w of warnings) console.log(`   - ${w}`);
} else {
  console.log("✅ Geometria costruita senza sovrapposizioni");
}

// Salva il risultato
writeFileSync(resolve(outputPath), JSON.stringify(floorplan, null, 2));
console.log(`✅ Piantina salvata in ${outputPath}`);
console.log(`   Stanze: ${floorplan.rooms?.length ?? 0}`);
console.log(`   Dimensioni: ${floorplan.dimensions?.width}m × ${floorplan.dimensions?.height}m`);
console.log(`   Costo: ${data.cost ?? "0"}`);

// ─── Conversione posizioni relative → metri ──────────────────────

function buildGeometryFromRelativePositions(fp) {
  const warnings = [];
  const W = 15.1; // metri reali
  const H = 15.1;

  fp.id = "piano-rialzato";
  fp.name = "Piano Rialzato";
  fp.unit = "m";
  fp.dimensions = { width: W, height: H };
  fp.ceilingHeight = 2.75;

  const rooms = fp.rooms ?? [];
  if (rooms.length === 0) {
    warnings.push("Nessuna stanza estratta dall'AI");
    return warnings;
  }

  // Converti percentuali in metri
  const converted = rooms.map((room, i) => {
    const x = ((room.x ?? 0) / 100) * W;
    const y = ((room.y ?? 0) / 100) * H;
    const width = ((room.width ?? 0) / 100) * W;
    const height = ((room.height ?? 0) / 100) * H;

    return {
      id: slugify(room.name) + "-" + (i + 1),
      name: room.name,
      area: room.area ?? Math.round(width * height * 100) / 100,
      bounds: {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: Math.round(width * 100) / 100,
        height: Math.round(height * 100) / 100,
      },
      openings: [],
    };
  });

  // Verifica sovrapposizioni e correggi
  for (let i = 0; i < converted.length; i++) {
    for (let j = i + 1; j < converted.length; j++) {
      const a = converted[i].bounds;
      const b = converted[j].bounds;
      const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (ox > 0.05 && oy > 0.05) {
        warnings.push(
          `Sovrapposizione: "${converted[i].name}" e "${converted[j].name}" (${ox.toFixed(2)}×${oy.toFixed(2)}m)`
        );
        // Correggi: sposta la stanza j
        fixOverlap(converted[j], { x: ox, y: oy, width: ox, height: oy });
      }
    }
  }

  // Verifica confini
  for (const room of converted) {
    const b = room.bounds;
    if (b.x < 0 || b.y < 0 || b.x + b.width > W + 0.01 || b.y + b.height > H + 0.01) {
      warnings.push(`"${room.name}" fuori dai confini — corretto`);
      b.x = Math.max(0, Math.min(b.x, W - b.width));
      b.y = Math.max(0, Math.min(b.y, H - b.height));
    }
  }

  fp.rooms = converted;
  return warnings;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fixOverlap(room, overlap) {
  const b = room.bounds;
  const dx = overlap.width;
  const dy = overlap.height;

  if (dx <= dy) {
    // Sposta orizzontalmente
    if (b.x + b.width / 2 < overlap.x + overlap.width / 2) {
      b.x = overlap.x + overlap.width;
    } else {
      b.x = overlap.x - b.width;
    }
  } else {
    // Sposta verticalmente
    if (b.y + b.height / 2 < overlap.y + overlap.height / 2) {
      b.y = overlap.y + overlap.height;
    } else {
      b.y = overlap.y - b.height;
    }
  }
}