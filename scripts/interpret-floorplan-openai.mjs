// Script per rileggere la piantina con OpenAI vision e creare la mappa perfetta
// Uso: node scripts/interpret-floorplan-openai.mjs <path-immagine> [output.json]
// Esempio: node scripts/interpret-floorplan-openai.mjs ~/Desktop/piantina.png data/floorplan.json

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
} catch {
  // .env.local non trovato
}

const imagePath = process.argv[2];
const outputPath = process.argv[3] ?? "app/interior-poc/data/floorplan.json";

if (!imagePath) {
  console.error("Uso: node scripts/interpret-floorplan-openai.mjs <path-immagine> [output.json]");
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("❌ OPENAI_API_KEY non configurata in .env.local");
  process.exit(1);
}

// Leggi immagine e converti in base64
const imageBuffer = readFileSync(resolve(imagePath));
const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const imageDataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;

console.log(`📷 Immagine caricata: ${imagePath} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);

const systemPrompt = `Sei un architetto esperto. Analizza in DETTAGLIO l'immagine della piantina architettonica "Piano Rialzato".

Il tuo compito è estrarre la piantina COMPLETA e PERFETTA con TUTTE le dimensioni reali.

DIMENSIONI TOTALI NOTE: 15.10m × 15.10m, altezza soffitto 2.75m

MISURE REALI DALLA PIANTINA (leggi anche quelle scritte sull'immagine):
- Larghezze nord (da sinistra a destra): 3.62 + 2.61 + 1.65 + 7.22 = 15.10
- Altezze sud (da alto a basso): 4.38 + 4.82 + 4.80 + 1.10 = 15.10
- Stanze e superfici note:
  * Bagno: 4.58 mq (3.62 × 1.30) — angolo nord-ovest
  * WC: 4.17 mq (2.61 × 1.65) — nord, accanto al bagno
  * Anti/Ingresso piccolo: 2.08 mq (1.84 × 1.13) — sotto il WC
  * Camera: 10.72 mq (3.27 × 3.89) — sotto il bagno
  * Guardaroba: 4.19 mq (3.88 × 1.08) — sotto la camera 10.72
  * Cucina/Soggiorno: 47.09 mq (7.22 × 6.52) — zona est, grande
  * Camera: 14.51 mq (3.88 × 4.11) — sotto il guardaroba
  * Ingresso: 8.36 mq (3.45 × 4.24) — sotto l'anti
  * Camera: 16.31 mq (4.82 × 3.94) — sotto la cucina/soggiorno
  * Balcone: 5.60 mq (4.38 × 1.10) — angolo sud-ovest

REGOLE CRITICHE DI GEOMETRIA:
1. NESSUNA stanza può sovrapporsi a un'altra. Ogni punto (x,y) appartiene a UNA sola stanza.
2. Le stanze devono essere ADIACENTI (condividono muri), non sovrapposte.
3. La somma delle larghezze su ogni riga = 15.10m. La somma delle altezze su ogni colonna = 15.10m.
4. Layout reale (da nord a sud, da ovest a est):
   - Riga 1 (y 0-1.30): Bagno (x 0-3.62) | WC (x 3.62-6.23) | spazio (x 6.23-7.88) | Cucina/Soggiorno (x 7.88-15.10)
   - Riga 2 (y 1.30-5.19): Camera 10.72 (x 0-3.27) | Anti (x 3.27-5.11) | Cucina/Soggiorno (x 7.88-15.10)
   - Riga 3 (y 5.19-6.27): Guardaroba (x 0-3.88) | Cucina/Soggiorno (x 7.88-15.10)
   - Riga 4 (y 6.27-10.38): Camera 14.51 (x 0-3.88) | Ingresso (x 3.88-7.33) | Cucina/Soggiorno (x 7.88-15.10)
   - Riga 5 (y 10.38-14.32): Camera 16.31 (x 7.88-12.70) | spazio (x 12.70-15.10)
   - Riga 6 (y 14.32-15.10): Balcone (x 0-4.38) | spazio
5. Le aperture (finestre/porte) vanno sui muri esterni o tra stanze.
6. Esposizione: nord in alto, sud in basso, ovest a sinistra, est a destra.
7. Leggi TUTTE le misure scritte sulla piantina e usale per calcolare le coordinate esatte.

Rispondi SOLO con JSON valido con questa struttura:
{
  "id": "piano-rialzato",
  "name": "Piano Rialzato",
  "unit": "m",
  "dimensions": { "width": 15.1, "height": 15.1 },
  "ceilingHeight": 2.75,
  "rooms": [
    {
      "id": "slug-stanza",
      "name": "nome stanza",
      "area": mq,
      "bounds": { "x": 0, "y": 0, "width": metri, "height": metri },
      "openings": [
        {
          "id": "slug-apertura",
          "type": "window | french-door | door",
          "position": { "x": metri, "y": metri },
          "width": metri,
          "height": metri,
          "wall": "north | south | east | west",
          "exposure": "north | south | east | west"
        }
      ]
    }
  ]
}`;

console.log("🤖 Invio a gpt-4o-mini (visione dettagliata)...");

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 8192,
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
console.log("📄 Risposta ricevuta, estrazione JSON...");

// Estrai JSON dalla risposta
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("❌ Nessun JSON nella risposta:");
  console.error(content.slice(0, 2000));
  process.exit(1);
}

const floorplan = JSON.parse(jsonMatch[0]);

// ─── POST-PROCESSING: validazione e correzione ───
console.log("🔍 Validazione geometria...");

const warnings = validateAndFixFloorplan(floorplan);

if (warnings.length > 0) {
  console.log("⚠️ Correzioni applicate:");
  for (const w of warnings) console.log(`   - ${w}`);
} else {
  console.log("✅ Nessuna sovrapposizione rilevata");
}

// Salva il risultato
writeFileSync(resolve(outputPath), JSON.stringify(floorplan, null, 2));
console.log(`✅ Piantina salvata in ${outputPath}`);
console.log(`   Stanze: ${floorplan.rooms?.length ?? 0}`);
console.log(`   Dimensioni: ${floorplan.dimensions?.width}m × ${floorplan.dimensions?.height}m`);

// ─── Funzioni di validazione ─────────────────────────────────────

function validateAndFixFloorplan(fp) {
  const warnings = [];
  const rooms = fp.rooms ?? [];
  const W = fp.dimensions?.width ?? 15.1;
  const H = fp.dimensions?.height ?? 15.1;

  // 1. Verifica sovrapposizioni tra stanze
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i].bounds;
      const b = rooms[j].bounds;
      if (!a || !b) continue;

      const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (ox > 0.05 && oy > 0.05) {
        warnings.push(
          `Sovrapposizione: "${rooms[i].name}" e "${rooms[j].name}" (${ox.toFixed(2)}×${oy.toFixed(2)}m)`
        );
        // Correggi: sposta la stanza j
        fixOverlap(rooms[j], { x: ox, y: oy, width: ox, height: oy });
      }
    }
  }

  // 2. Verifica confini
  for (const room of rooms) {
    const b = room.bounds;
    if (!b) continue;
    if (b.x < 0 || b.y < 0 || b.x + b.width > W + 0.01 || b.y + b.height > H + 0.01) {
      warnings.push(`"${room.name}" fuori dai confini — corretto`);
      b.x = Math.max(0, Math.min(b.x, W - b.width));
      b.y = Math.max(0, Math.min(b.y, H - b.height));
    }
  }

  // 3. Verifica aree plausibili
  for (const room of rooms) {
    const b = room.bounds;
    if (!b) continue;
    const computedArea = b.width * b.height;
    if (room.area && Math.abs(computedArea - room.area) > room.area * 0.5) {
      warnings.push(
        `"${room.name}": area calcolata ${computedArea.toFixed(1)} mq vs dichiarata ${room.area} mq`
      );
    }
  }

  return warnings;
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