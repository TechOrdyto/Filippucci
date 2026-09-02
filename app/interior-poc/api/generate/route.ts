import { NextResponse } from "next/server";
import { findProductById } from "../../lib/catalog";
import floorplanModel from "../../data/floorplan-model.json";
import floorplanDxf from "../../data/floorplan-dxf.json";
import designerRules from "../../data/designer-rules.json";

const rules = designerRules as any;

// Contesto "appartamento" ricavato dal DXF (dimensioni) + modello (stanze).
// Il DXF è la sorgente unica della geometria; il modello fornisce i nomi.
const model = floorplanModel as any;
const dxf = floorplanDxf as any;

const floorplan = {
  id: model.id,
  name: model.name,
  dimensions: { width: dxf.width, height: dxf.height },
  ceilingHeight: 2.7, // altezza soffitto non presente nel DXF (default 2.7m)
  rooms: model.rooms.map((room: any) => {
    const pts = room.geometry.points as [number, number][];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return {
      id: room.id,
      name: room.name,
      area: Math.round(w * h * 100) / 100,
    };
  }),
};

// Provider di generazione immagini:
// 1. Pollinations.ai (gratuito, senza API key) — default
// 2. OpenAI DALL-E 3 (se OPENAI_API_KEY configurata)
const hasOpenAI = !!process.env.OPENAI_API_KEY;

interface GenerateRequest {
  prompt: string;
  productIds: string[];
  floorplanId: string;
  roomId?: string | null;
  camera?: {
    x: number;
    y: number;
    rotation: number;
    fov: number;
  } | null;
}

export async function POST(request: Request) {
  try {
    const body: GenerateRequest = await request.json();

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "Prompt mancante" }, { status: 400 });
    }

    // 1. Risolvi i prodotti dal catalogo
    const products = body.productIds
      .map((id) => findProductById(id))
      .filter(Boolean);

    // 1a. Trova la stanza selezionata (se presente)
    const selectedRoom = body.roomId
      ? floorplan.rooms.find((r: any) => r.id === body.roomId)
      : null;

    // 1b. Pulisci il prompt: rimuovi le mention @ (es. "@Augusto di fianco")
    // Il modello NON deve disegnare il testo "@Augusto"
    const cleanUserPrompt = cleanPrompt(body.prompt, products as any[]);

    // 2. Costruisci il prompt vincolato (per il log e il riferimento)
    const generationPrompt = buildGenerationPrompt({
      prompt: cleanUserPrompt,
      products: products as any[],
      floorplan,
      rules,
      selectedRoom: selectedRoom ?? null,
      camera: body.camera ?? null,
    });

    // 3. Genera l'immagine
    // Usa OpenAI gpt-image-2 (se configurato) o Pollinations (gratuito)
    let imageUrl: string;
    let provider: string;

    try {
      if (hasOpenAI) {
        // gpt-image-1-mini (economico): usa un prompt OTTIMIZZATO
        // per evitare tempi di generazione eccessivi
        imageUrl = await generateImageWithDalle(cleanUserPrompt, products as any[]);
        provider = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1-mini";
      } else {
        // Pollinations: usa il prompt UTENTE semplice (non il prompt vincolato completo)
        // Il modello gratuito non gestisce prompt lunghi e complessi
        // Restituisce l'URL direttamente — il browser carica in background
        imageUrl = buildPollinationsUrl(cleanUserPrompt, products as any[]);
        provider = "pollinations";
      }
    } catch (err) {
      // Fallback: placeholder SVG se la generazione fallisce
      console.warn("Generazione immagine fallita, uso placeholder:", err);
      const placeholder = buildPlaceholderSvg({
        prompt: body.prompt,
        products: products as any[],
        floorplan,
      });
      imageUrl = `data:image/svg+xml;base64,${Buffer.from(placeholder).toString("base64")}`;
      provider = "placeholder";
    }

    return NextResponse.json({
      imageUrl,
      provider,
      prompt: generationPrompt,
    });
  } catch (err) {
    console.error("Generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}

function buildGenerationPrompt({
  prompt,
  products,
  floorplan,
  rules,
  selectedRoom,
  camera,
}: {
  prompt: string;
  products: any[];
  floorplan: any;
  rules: any;
  selectedRoom: any | null;
  camera: { x: number; y: number; rotation: number; fov: number } | null;
}): string {
  const sections: string[] = [];

  // Sezione 1: Appartamento (contesto generale)
  sections.push(`APARTMENT CONTEXT:
- Property: ${floorplan.name}
- Total dimensions: ${floorplan.dimensions.width}m × ${floorplan.dimensions.height}m
- Ceiling height: ${floorplan.ceilingHeight}m
- Total rooms: ${floorplan.rooms.length}
- Rooms: ${floorplan.rooms.map((r: any) => `${r.name} (${r.area}m²)`).join(", ")}`);

  // Sezione 1b: Stanza selezionata (geometria dettagliata)
  if (selectedRoom) {
    const polygon = selectedRoom.polygon
      ? selectedRoom.polygon.map(([x, y]: [number, number]) => `(${x}, ${y})`).join(" → ")
      : `rectangle ${selectedRoom.bounds.width}m × ${selectedRoom.bounds.height}m`;

    const roomOpenings = selectedRoom.openings
      .map(
        (o: any) =>
          `${o.type} ${o.width}m on ${o.wall} wall (${o.exposure} exposure)`
      )
      .join("; ");

    // Stanze confinanti (calcolo approssimativo per adiacenza)
    const adjacent = floorplan.rooms
      .filter((r: any) => r.id !== selectedRoom.id)
      .map((r: any) => r.name);

    sections.push(`SELECTED ROOM — THIS IS THE ROOM TO RENDER:
- Room: ${selectedRoom.name}
- Area: ${selectedRoom.area} m²
- Shape: ${polygon}
- Openings in this room: ${roomOpenings || "none"}
- Adjacent rooms: ${adjacent.slice(0, 5).join(", ")}

CRITICAL: The render MUST show ONLY this room (${selectedRoom.name}), viewed from the camera position described below. The room shape, proportions and openings MUST match the geometry above.`);
  }

  // Sezione 1c: Posizione camera
  if (camera) {
    const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
    const dirIdx = Math.round(camera.rotation / 45) % 8;
    const direction = dirs[dirIdx];

    sections.push(`CAMERA POSITION:
- Position: x=${camera.x}m, y=${camera.y}m (inside the room)
- Looking direction: ${direction} (${camera.rotation}°)
- Field of view: ${camera.fov}°
- The camera is INSIDE the room, at eye level (~1.5m from floor)

CRITICAL: The image MUST be rendered from THIS camera position, looking in THIS direction. The composition must reflect this point of view.`);
  }

  // Sezione 2: Prodotti vincolanti
  if (products.length > 0) {
    sections.push(`MANDATORY FURNITURE (DO NOT MODIFY, DO NOT SUBSTITUTE):
${products
  .map(
    (p) => `- [${p.id}] ${p.name} by ${p.designer}
  Dimensions: ${p.dimensions.width}cm W × ${p.dimensions.depth}cm D × ${p.dimensions.height}cm H
  Materials: ${p.materials.join(", ")}
  Finishes: ${p.finishes.join(", ")}
  Description: ${p.descriptionForAI}`
  )
  .join("\n")}

CRITICAL: These products MUST appear exactly as described. Do not invent similar furniture. Do not change colors or materials.`);

    sections.push(`CRITICAL CONSTRAINT: The furniture listed above is from the Molteni&C catalog and MUST be rendered faithfully. Do NOT substitute with generic or similar furniture. Do NOT invent furniture not listed.`);
  }

  // Sezione 3: Regole designer
  sections.push(`DESIGNER RULES:
- Style: ${rules.style.primary} (avoid: ${rules.style.avoid.join(", ")})
- Preferred materials: ${rules.materials.preferred.join(", ")}
- Avoid materials: ${rules.materials.avoid.join(", ")}
- Color palette: ${rules.colorPalette.preferred.join(", ")}
- Accents allowed: ${rules.colorPalette.accentAllowed.join(", ")}
- Atmosphere: ${rules.atmosphere.brightness}, ${rules.atmosphere.warmth}, ${rules.atmosphere.formality}
- ${rules.aiInstructions}`);

  // Sezione 4: Prompt utente
  sections.push(`USER REQUEST:
${prompt}`);

  // Sezione 5: Vincoli di rendering
  sections.push(`RENDERING CONSTRAINTS:
- Photorealistic interior photography
- Natural daylight from windows
- Maintain accurate 1:1 scale proportions
- Architecturally plausible space
- Professional interior photography composition
- DO NOT add non-existent architectural elements
- DO NOT invent furniture not listed above
- DO NOT change product colors or materials
- No cartoon, deformed, or plastic-looking furniture`);

  return sections.join("\n\n");
}

/**
 * Costruisce l'URL Pollinations per la generazione dell'immagine
 * Usa il prompt UTENTE semplice (non il prompt vincolato completo)
 * perché il modello gratuito non gestisce prompt lunghi e complessi
 * Il browser carica l'immagine in background (Pollinations genera in ~2-40s)
 */
function buildPollinationsUrl(userPrompt: string, products: any[]): string {
  // Prompt ottimizzato per interni fotorealistici
  // Struttura: [richiesta utente] + [prodotti] + [stile fotorealistico]
  const parts: string[] = [];

  // 1. Richiesta utente (semplice, in italiano)
  parts.push(userPrompt.trim());

  // 2. Prodotti del catalogo (se presenti)
  if (products.length > 0) {
    const productDesc = products
      .map((p) => `${p.name} (${p.descriptionForAI?.slice(0, 120) ?? ""})`)
      .join(", ");
    parts.push(`Include these exact furniture pieces: ${productDesc}`);
  }

  // 3. Stile fotorealistico (parole chiave essenziali)
  parts.push(
    "photorealistic interior render, professional architectural photography, natural daylight, high quality, realistic materials, wide angle view of the room"
  );

  const imagePrompt = parts.join(". ");

  const seed = Math.floor(Math.random() * 100000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    imagePrompt
  )}?width=1536&height=1024&nologo=true&seed=${seed}&model=flux`;
}

/**
 * Genera un'immagine con OpenAI (gpt-image-1-mini, economico)
 * Modello configurabile via OPENAI_IMAGE_MODEL in .env.local
 * Passa le immagini reali dei prodotti come riferimento
 * usando l'endpoint edits (multipart) per garantire la fedeltà al catalogo
 */
async function generateImageWithDalle(
  userPrompt: string,
  products: any[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata");
  }

  // Modello configurabile: default gpt-image-1-mini (economico)
  // Se ci sono immagini prodotto, usa gpt-image-1 (supporta editing)
  const hasProductImages = products.some((p) => p.images?.[0]);
  const model = hasProductImages
    ? process.env.OPENAI_IMAGE_MODEL_REF ?? "gpt-image-1"
    : process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1-mini";

  // Prompt ottimizzato: richiesta utente + prodotti + stile fotorealistico
  const parts: string[] = [userPrompt.trim()];

  if (products.length > 0) {
    const productDesc = products
      .map((p) => `${p.name} (${p.descriptionForAI?.slice(0, 100) ?? ""})`)
      .join(", ");
    parts.push(
      `Include these EXACT furniture pieces from the reference images: ${productDesc}. Reproduce them faithfully with the same design, colors and materials.`
    );
  }

  parts.push(
    "photorealistic interior render, professional architectural photography, natural daylight, high quality, realistic materials"
  );

  const imagePrompt = parts.join(". ");

  // Carica le immagini dei prodotti come riferimento
  const productImages = await loadProductImages(products);

  // Se ci sono immagini prodotto, usa l'endpoint edits (multipart)
  if (productImages.length > 0) {
    return await editImageWithReferences(apiKey, model, imagePrompt, productImages);
  }

  // Altrimenti usa l'endpoint generations (JSON)
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: imagePrompt,
      n: 1,
      size: "1536x1024",
      quality: "medium",
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? "Errore API OpenAI");
  }

  const data = await res.json();
  // gpt-image restituisce b64_json (non URL)
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }
  return data.data?.[0]?.url ?? "";
}

/**
 * Usa l'endpoint edits con le immagini dei prodotti come riferimento
 */
async function editImageWithReferences(
  apiKey: string,
  model: string,
  prompt: string,
  productImages: { buffer: Buffer; mime: string; name: string }[]
): Promise<string> {
  // Costruisci il multipart form data
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", "1536x1024");
  form.append("quality", "medium");

  // Aggiungi le immagini dei prodotti come riferimento
  for (const img of productImages) {
    // Buffer → Uint8Array per compatibilità Blob
    const uint8 = new Uint8Array(img.buffer);
    form.append(
      "image[]",
      new Blob([uint8], { type: img.mime }),
      img.name
    );
  }

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? "Errore API OpenAI edits");
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }
  return data.data?.[0]?.url ?? "";
}

/**
 * Carica le immagini dei prodotti dal filesystem
 * per passarli come riferimento a gpt-image
 */
async function loadProductImages(products: any[]): Promise<
  { buffer: Buffer; mime: string; name: string }[]
> {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const images: { buffer: Buffer; mime: string; name: string }[] = [];
  for (const product of products) {
    const imagePath = product.images?.[0];
    if (!imagePath) continue;

    // Il path è relativo a /public (es. /products/sofas/augusto.png)
    const filePath = join(process.cwd(), "public", imagePath.replace(/^\//, ""));
    try {
      const buffer = readFileSync(filePath);
      const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
      images.push({
        buffer,
        mime,
        name: `${product.id}.png`,
      });
      console.log(`📷 Immagine prodotto caricata: ${product.name}`);
    } catch (err) {
      console.warn(`⚠️ Immagine non trovata per ${product.name}: ${filePath}`);
    }
  }
  return images;
}

/**
 * Pulisce il prompt rimuovendo COMPLETAMENTE le mention @ e il testo attaccato
 * Es: "Aggiungi @Augusto di fianco alla finestra" → "Aggiungi di fianco alla finestra"
 * Il modello NON deve vedere né "@Augusto" né "Augusto" nel testo —
 * capisce cosa aggiungere SOLO dalla foto di riferimento
 */
function cleanPrompt(rawPrompt: string, products: any[]): string {
  let cleaned = rawPrompt;

  // Per ogni prodotto, rimuovi "@NomeProdotto" (la @ e il nome attaccato)
  for (const product of products) {
    const mentionRegex = new RegExp(`@${escapeRegex(product.name)}`, "gi");
    cleaned = cleaned.replace(mentionRegex, "");
  }

  // Rimuovi eventuali @ rimasti (mention non risolte) e il testo attaccato
  cleaned = cleaned.replace(/@\S+/g, "");

  // Pulisci spazi multipli e punteggiatura residua
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[,.;:]+\s*$/g, "")
    .trim();

  return cleaned;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Genera un placeholder SVG che rappresenta l'ambiente richiesto
 * Usato in modalità demo (senza API key)
 */
function buildPlaceholderSvg({
  prompt,
  products,
  floorplan,
}: {
  prompt: string;
  products: any[];
  floorplan: any;
}): string {
  const W = 1792;
  const H = 1024;

  // Colori base per l'ambiente
  const floorColor = "#c8a06a"; // legno rovere
  const wallColor = "#f5f5f0"; // bianco
  const windowColor = "#a8d8ea"; // cielo

  // Prodotti da mostrare
  const productNames = products.map((p) => p.name).join(", ") || "nessun prodotto selezionato";

  // Stanza principale
  const mainRoom = floorplan.rooms?.[0] ?? null;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${wallColor}"/>
      <stop offset="100%" stop-color="#e8e8e0"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${floorColor}"/>
      <stop offset="100%" stop-color="#a87f4a"/>
    </linearGradient>
    <pattern id="herringbone" width="80" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="80" height="40" fill="url(#floor)"/>
      <line x1="0" y1="0" x2="80" y2="40" stroke="#b08a55" stroke-width="1"/>
      <line x1="80" y1="0" x2="0" y2="40" stroke="#b08a55" stroke-width="1"/>
    </pattern>
  </defs>

  <!-- Parete -->
  <rect x="0" y="0" width="${W}" height="${H * 0.55}" fill="url(#wall)"/>

  <!-- Pavimento a spina di pesce -->
  <rect x="0" y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#herringbone)"/>

  <!-- Finestra -->
  <rect x="${W * 0.15}" y="${H * 0.15}" width="${W * 0.25}" height="${H * 0.3}" fill="${windowColor}" stroke="#ffffff" stroke-width="12"/>
  <line x1="${W * 0.15 + W * 0.125}" y1="${H * 0.15}" x2="${W * 0.15 + W * 0.125}" y2="${H * 0.45}" stroke="#ffffff" stroke-width="8"/>
  <line x1="${W * 0.15}" y1="${H * 0.3}" x2="${W * 0.4}" y2="${H * 0.3}" stroke="#ffffff" stroke-width="8"/>

  <!-- Seconda finestra -->
  <rect x="${W * 0.6}" y="${H * 0.15}" width="${W * 0.25}" height="${H * 0.3}" fill="${windowColor}" stroke="#ffffff" stroke-width="12"/>
  <line x1="${W * 0.6 + W * 0.125}" y1="${H * 0.15}" x2="${W * 0.6 + W * 0.125}" y2="${H * 0.45}" stroke="#ffffff" stroke-width="8"/>
  <line x1="${W * 0.6}" y1="${H * 0.3}" x2="${W * 0.85}" y2="${H * 0.3}" stroke="#ffffff" stroke-width="8"/>

  <!-- Divano (placeholder) -->
  <rect x="${W * 0.3}" y="${H * 0.5}" width="${W * 0.4}" height="${H * 0.15}" rx="20" fill="#8a8a8a"/>
  <rect x="${W * 0.3}" y="${H * 0.5}" width="${W * 0.4}" height="${H * 0.08}" rx="15" fill="#9a9a9a"/>
  <rect x="${W * 0.28}" y="${H * 0.58}" width="${W * 0.08}" height="${H * 0.12}" rx="10" fill="#7a7a7a"/>
  <rect x="${W * 0.64}" y="${H * 0.58}" width="${W * 0.08}" height="${H * 0.12}" rx="10" fill="#7a7a7a"/>

  <!-- Tavolino -->
  <rect x="${W * 0.42}" y="${H * 0.68}" width="${W * 0.16}" height="${H * 0.04}" rx="5" fill="#6b4f2a"/>
  <rect x="${W * 0.44}" y="${H * 0.72}" width="8" height="${H * 0.08}" fill="#6b4f2a"/>
  <rect x="${W * 0.54}" y="${H * 0.72}" width="8" height="${H * 0.08}" fill="#6b4f2a"/>

  <!-- Testo informativo -->
  <rect x="0" y="0" width="${W}" height="90" fill="rgba(0,0,0,0.7)"/>
  <text x="40" y="55" font-family="sans-serif" font-size="36" fill="#ffffff" font-weight="bold">Modalità Demo — Anteprima Ambiente</text>

  <text x="40" y="${H - 60}" font-family="sans-serif" font-size="28" fill="#333333">
    Prompt: ${escapeXml(prompt.slice(0, 120))}
  </text>
  <text x="40" y="${H - 20}" font-family="sans-serif" font-size="24" fill="#555555">
    Prodotti: ${escapeXml(productNames)} · Stanza: ${escapeXml(mainRoom?.name ?? "—")} (${mainRoom?.area ?? "—"} mq)
  </text>
</svg>`;

  return svg;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}