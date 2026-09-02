import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/auth/roles";
import { findProductById } from "../../lib/catalog";
import floorplanModel from "../../data/floorplan-model-casa-enri.json";
import floorplanDxf from "../../data/floorplan-dxf-casa-enri.json";
import designerRules from "../../data/designer-rules.json";
import { planAreaToSquareMeters, planUnitsToMeters, roundMeters } from "../../floorplan/units";
import { pointInPolygon } from "../../floorplan/geometry";
import type { ObjectProductAssignment, Product } from "../../lib/types";
import {
  buildRenderScene,
  formatRenderScene,
  validateRenderScene,
} from "../../lib/rendering/scene";
import type { RenderSceneSpec } from "../../lib/rendering/scene";

const rules = designerRules as any;

// Contesto "appartamento" ricavato dal DXF (dimensioni) + modello (stanze).
// Il DXF è la sorgente unica della geometria; il modello fornisce i nomi.
const model = floorplanModel as any;
const dxf = floorplanDxf as any;

const floorplan = {
  id: model.id,
  name: model.name,
  dimensions: {
    width: roundMeters(planUnitsToMeters(dxf.width)),
    height: roundMeters(planUnitsToMeters(dxf.height)),
  },
  ceilingHeight: 2.7, // altezza soffitto non presente nel DXF (default 2.7m)
  rooms: model.rooms.map((room: any) => {
    const pts = room.geometry.points as [number, number][];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const openings = (dxf.openings ?? [])
      .filter((opening: any) => pointInPolygon(opening.position[0], opening.position[1], pts))
      .map((opening: any) => ({
        ...opening,
        position: [
          roundMeters(planUnitsToMeters(opening.position[0])),
          roundMeters(planUnitsToMeters(opening.position[1])),
        ],
        width: roundMeters(planUnitsToMeters(opening.width)),
      }));
    return {
      id: room.id,
      name: room.name,
      area: roundMeters(planAreaToSquareMeters(w * h)),
      polygon: pts.map(([x, y]) => [roundMeters(planUnitsToMeters(x)), roundMeters(planUnitsToMeters(y))]),
      openings,
    };
  }),
};

// Provider di generazione immagini:
// 1. Pollinations.ai (gratuito, senza API key) — preview
// 2. OpenAI gpt-image (se OPENAI_API_KEY configurata)
const hasOpenAI = !!process.env.OPENAI_API_KEY;

interface GenerateRequest {
  prompt: string;
  productIds: string[];
  explicitProductIds?: string[];
  floorplanId: string;
  roomId?: string | null;
  objectIds?: string[];
  objectAssignments?: ObjectProductAssignment[];
  finishes?: {
    walls?: string | null;
    floor?: string | null;
  } | null;
  camera?: {
    x: number;
    y: number;
    rotation: number;
    fov: number;
  } | null;
}

interface ResolvedObjectAssignment {
  objectId: string;
  object: any;
  product: any;
  room: any | null;
}

export async function POST(request: Request) {
  try {
    // Guard: autenticazione + ruolo
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    if (!canAccess(session.user.role, "generate")) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    const body: GenerateRequest = await request.json();

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "Prompt mancante" }, { status: 400 });
    }

    // 1. Trova la stanza selezionata: tutte le associazioni vengono poi
    // filtrate su questo ambiente, così un render non porta dentro mobili di
    // altre stanze della planimetria.
    const selectedRoom = body.roomId
      ? floorplan.rooms.find((r: any) => r.id === body.roomId)
      : null;
    const selectedModelRoom = body.roomId
      ? model.rooms.find((room: any) => room.id === body.roomId)
      : null;
    const sceneOpenings = selectedModelRoom
      ? (dxf.openings ?? [])
          .filter((opening: any) =>
            pointInPolygon(
              opening.position[0],
              opening.position[1],
              selectedModelRoom.geometry.points
            )
          )
          .map((opening: any) => ({
            id: opening.id,
            type: opening.type,
            position: { x: opening.position[0], y: opening.position[1] },
            width: opening.width,
            height: opening.height,
            wall: opening.wall,
            exposure: opening.exposure,
          }))
      : [];

    // 2. Risolvi le associazioni tra ancore CAD generiche e prodotti catalogo.
    // Il CAD non deve riconoscere "divano" o "tavolo": l'associazione esplicita
    // fatta dal tecnico è la fonte autorevole per il render.
    const allObjectAssignments = (body.objectAssignments ?? [])
      .map((assignment): ResolvedObjectAssignment | null => {
        const object = model.objects.find((candidate: any) => candidate.id === assignment.objectId);
        const product = findProductById(assignment.productId);
        if (!object || !product) return null;
        return {
          objectId: assignment.objectId,
          object,
          product,
          room: floorplan.rooms.find((room: any) => room.id === object.roomId) ?? null,
        };
      })
      .filter((assignment): assignment is ResolvedObjectAssignment => assignment !== null);
    const objectAssignments = allObjectAssignments.filter(
      (assignment) => !selectedRoom || assignment.room?.id === selectedRoom.id
    );

    // I prodotti associati agli oggetti entrano nello stesso vincolo catalogo
    // dei prodotti aggiunti tramite @, senza duplicare gli ID.
    const explicitProductIds = body.explicitProductIds ?? body.productIds ?? [];
    const productIds = Array.from(
      new Set([
        ...explicitProductIds,
        ...objectAssignments.map((assignment) => assignment.product.id),
      ])
    );
    const products = productIds
      .map((id) => findProductById(id))
      .filter(Boolean);

    // 2a. Gli elementi inclusi nel render devono appartenere all'ambiente
    // selezionato; le associazioni di altre stanze restano salvate nel client.
    const selectedObjectIds = Array.from(
      new Set([
        ...(body.objectIds ?? []),
        ...objectAssignments.map((assignment) => assignment.objectId),
      ])
    ).filter((id) => {
      const object = model.objects.find((candidate: any) => candidate.id === id);
      return Boolean(object && (!selectedRoom || object.roomId === selectedRoom.id));
    });
    const selectedObjects = selectedObjectIds
      .map((id) => model.objects.find((object: any) => object.id === id))
      .filter(Boolean);

    // 1b. Pulisci il prompt: rimuovi le mention @ (es. "@Augusto di fianco")
    // Il modello NON deve disegnare il testo "@Augusto"
    const cleanUserPrompt = cleanPrompt(body.prompt, products as any[]);

    const scene = buildRenderScene({
      model,
      roomId: selectedRoom?.id ?? null,
      camera: body.camera
        ? {
            ...body.camera,
            roomId: selectedRoom?.id ?? body.roomId ?? "",
          }
        : null,
      assignments: objectAssignments.map((assignment) => ({
        objectId: assignment.objectId,
        productId: assignment.product.id,
      })),
      products: products as Product[],
      prompt: cleanUserPrompt,
      finishes: body.finishes,
      openings: sceneOpenings,
    });
    const sceneValidation = validateRenderScene(scene);
    if (sceneValidation.errors.length > 0) {
      return NextResponse.json(
        {
          error: sceneValidation.errors.join(" "),
          warnings: sceneValidation.warnings,
        },
        { status: 400 }
      );
    }

    // 2. Costruisci il prompt vincolato (per il log e il riferimento)
    const generationPrompt = buildGenerationPrompt({
      prompt: cleanUserPrompt,
      products: products as any[],
      floorplan,
      rules,
      selectedRoom: selectedRoom ?? null,
      selectedObjects,
      objectAssignments,
      camera: body.camera ?? null,
      scene,
    });

    // Prompt compatto per il provider: contiene comunque stanza e camera,
    // così la visuale scelta nella piantina non resta solo un'indicazione UI.
    const providerPrompt = buildProviderImagePrompt({
      prompt: cleanUserPrompt,
      products: products as any[],
      selectedRoom: selectedRoom ?? null,
      selectedObjects,
      objectAssignments,
      camera: body.camera ?? null,
      scene,
    });

    // 3. Genera l'immagine
    // Usa OpenAI gpt-image-2 (se configurato) o Pollinations (gratuito)
    let imageUrl: string;
    let provider: string;

    try {
      if (hasOpenAI) {
        // Con la scena come riferimento usiamo il modello di editing.
        imageUrl = await generateImageWithDalle(
          providerPrompt,
          products as any[],
          objectAssignments,
          scene
        );
        provider = process.env.OPENAI_IMAGE_MODEL_REF ?? "gpt-image-1";
      } else {
        // Pollinations: usa il prompt UTENTE semplice (non il prompt vincolato completo)
        // Il modello gratuito non gestisce prompt lunghi e complessi
        // Restituisce l'URL direttamente — il browser carica in background
        imageUrl = buildPollinationsUrl(providerPrompt, products as any[]);
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

    const generationWarnings = [...sceneValidation.warnings];
    if (provider === "pollinations") {
      generationWarnings.push(
        "Anteprima senza chiave API: il provider non riceve le foto catalogo né la mappa di scena come immagini di riferimento. Per la demo fedele attiva OPENAI_API_KEY."
      );
    }
    if (provider === "placeholder") {
      generationWarnings.push(
        "È stata mostrata un'anteprima locale di riserva: la generazione immagini non è andata a buon fine."
      );
    }

    return NextResponse.json({
      imageUrl,
      provider,
      prompt: generationPrompt,
      scene,
      warnings: generationWarnings,
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
  selectedObjects,
  objectAssignments,
  camera,
  scene,
}: {
  prompt: string;
  products: any[];
  floorplan: any;
  rules: any;
  selectedRoom: any | null;
  selectedObjects: any[];
  objectAssignments: ResolvedObjectAssignment[];
  camera: { x: number; y: number; rotation: number; fov: number } | null;
  scene: ReturnType<typeof buildRenderScene>;
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

    const roomOpenings = (selectedRoom.openings ?? [])
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
- Position: x=${roundMeters(planUnitsToMeters(camera.x))}m, y=${roundMeters(planUnitsToMeters(camera.y))}m (inside the room)
- Looking direction: ${direction} (${camera.rotation}°)
- Field of view: ${camera.fov}°
- The camera is INSIDE the room, at eye level (~1.5m from floor)

CRITICAL: The image MUST be rendered from THIS camera position, looking in THIS direction. The composition must reflect this point of view.`);
  }

  if (selectedObjects.length > 0) {
    sections.push(`SELECTED EXISTING ELEMENTS FROM THE FLOORPLAN:
${selectedObjects
  .map((object: any) => {
    const geometry = object.geometry;
    const description =
      geometry?.type === "rectangle"
        ? `rectangle at (${roundMeters(planUnitsToMeters(geometry.x))}m, ${roundMeters(
            planUnitsToMeters(geometry.y)
          )}m), ${roundMeters(planUnitsToMeters(geometry.width))}m wide × ${roundMeters(
            planUnitsToMeters(geometry.height)
          )}m deep`
        : geometry?.type ?? "geometry from floorplan";
    return `- ${object.name} (${object.type}), ${description}`;
  })
  .join("\n")}
Preserve these existing elements when they fall within the selected camera view.`);
  }

  if (objectAssignments.length > 0) {
    sections.push(`EXPLICIT CATALOG ASSOCIATIONS (AUTHORITATIVE):
${objectAssignments
  .map((assignment) => {
    const roomName = assignment.room?.name ?? "stanza non identificata";
    return `- Floorplan element ${assignment.object.name} [${assignment.object.id}] in ${roomName} → use exactly [${assignment.product.id}] ${assignment.product.name} by ${assignment.product.designer}`;
  })
  .join("\n")}
These associations are explicit placement instructions. Replace the generic CAD anchor with the assigned catalog product at the same position and preserve its scale, orientation and spatial relationship to the room.`);
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

  sections.push(formatRenderScene(scene));

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

function buildProviderImagePrompt({
  prompt,
  products,
  selectedRoom,
  selectedObjects,
  objectAssignments,
  camera,
  scene,
}: {
  prompt: string;
  products: any[];
  selectedRoom: any | null;
  selectedObjects: any[];
  objectAssignments: ResolvedObjectAssignment[];
  camera: { x: number; y: number; rotation: number; fov: number } | null;
  scene: ReturnType<typeof buildRenderScene>;
}): string {
  const parts: string[] = [prompt.trim()];

  if (selectedRoom) {
    parts.push(
      `Render only the room ${selectedRoom.name}; preserve its proportions and architectural openings. ` +
        `Room shape coordinates in meters: ${selectedRoom.polygon
          ?.map(([x, y]: [number, number]) => `(${x},${y})`)
          .join(" ") ?? "not available"}.`
    );
  }

  if (camera) {
    const dirs = [
      "north",
      "north-east",
      "east",
      "south-east",
      "south",
      "south-west",
      "west",
      "north-west",
    ];
    const direction = dirs[Math.round(camera.rotation / 45) % dirs.length];
    parts.push(
      `Use an interior camera positioned at ${roundMeters(planUnitsToMeters(camera.x))}m, ${roundMeters(
        planUnitsToMeters(camera.y)
      )}m in the floorplan, looking ${direction}; field of view ${camera.fov} degrees. ` +
        "Keep the composition consistent with this exact viewpoint."
    );
  }

  if (selectedObjects.length > 0) {
    parts.push(
      `Preserve the selected existing floorplan elements in the scene: ${selectedObjects
        .map((object) => object.name)
        .join(", ")}.`
    );
  }

  if (objectAssignments.length > 0) {
    parts.push(
      `Use these exact catalog assignments at the corresponding floorplan anchors: ${objectAssignments
        .map(
          (assignment) =>
            `${assignment.object.name} in ${assignment.room?.name ?? "the selected room"} → ${assignment.product.name}`
        )
        .join(", ")}. Keep each product in the anchor's original position and orientation.`
    );
  }

  if (products.length > 0) {
    parts.push(
      `Include these exact furniture pieces: ${products
        .map((product) => `${product.name} (${product.descriptionForAI?.slice(0, 140) ?? ""})`)
        .join(", ")}.`
    );
  }

  parts.push(formatRenderScene(scene));

  parts.push(
    "Photorealistic interior render, professional architectural photography, natural daylight, realistic materials, accurate room proportions."
  );

  return parts.filter(Boolean).join(". ");
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
  products: any[],
  objectAssignments: ResolvedObjectAssignment[],
  scene: RenderSceneSpec
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata");
  }

  // Modello configurabile: default gpt-image-1-mini (economico)
  // Se ci sono immagini prodotto, usa gpt-image-1 (supporta editing)
  const hasProductImages = products.some((p) => p.images?.[0]);
  const model = hasProductImages || scene.room
    ? process.env.OPENAI_IMAGE_MODEL_REF ?? "gpt-image-1"
    : process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1-mini";

  // Carica le immagini dei prodotti come riferimento
  const productImages = await loadProductImages(products);

  // Prompt RIGIDO: i prodotti devono essere riprodotti ESATTAMENTE
  // come nelle foto di riferimento allegate. Nessuna sostituzione.
  const parts: string[] = [];

  // 1. Richiesta utente
  parts.push(userPrompt.trim());

  // 2. Vincoli sui prodotti (riferimento numerato alle foto allegate)
  if (products.length > 0) {
    const constraints = products
      .map((p, i) => {
        const dims = p.dimensions
          ? `${p.dimensions.width}cm W × ${p.dimensions.depth}cm D × ${p.dimensions.height}cm H`
          : "";
        return `- Product ${i + 1}: ${p.name} by ${p.designer} (${dims}). Reference photo: image ${i + 1}.`;
      })
      .join("\n");

    parts.push(
      `MANDATORY FURNITURE — reproduce EXACTLY as in the reference photos:\n${constraints}\n` +
        `STRICT RULES:\n` +
        `- Each product MUST be identical to its reference photo: same design, silhouette, proportions, colors, materials, legs, upholstery.\n` +
        `- DO NOT substitute, replace, redesign, or invent similar furniture.\n` +
        `- DO NOT change colors, materials, or proportions.\n` +
        `- DO NOT add furniture that is not listed above.\n` +
        `- If a product appears in the scene, it MUST be the exact product from the photo.`
    );
  }

  // 3. Stile fotorealistico
  parts.push(
    "The first reference image is an authoritative top-down scene map with the selected room, openings, camera point, viewing direction and catalog anchors. Convert that map into the requested interior perspective; never output a floorplan or a diagram."
  );

  parts.push(
    "photorealistic interior render, professional architectural photography, natural daylight, high quality, realistic materials"
  );

  const imagePrompt = parts.join(". ");

  // La mappa di scena rende visibile al modello la relazione spaziale che il
  // solo testo (coordinate e angoli) non riesce a rispettare con precisione.
  const referenceImages: { buffer: Buffer; mime: string; name: string }[] = [];
  try {
    referenceImages.push(await buildSceneReferenceImage(scene));
  } catch (err) {
    console.warn("⚠️ Riferimento planimetrico non disponibile:", err);
  }

  // Carica le immagini dei prodotti come riferimento
  referenceImages.push(...(await loadProductImages(products, objectAssignments)));

  // La mappa e le foto catalogo entrano nello stesso set di riferimenti.
  if (referenceImages.length > 0) {
    return await editImageWithReferences(apiKey, model, imagePrompt, referenceImages);
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
async function loadProductImages(
  products: any[],
  objectAssignments: ResolvedObjectAssignment[] = []
): Promise<
  { buffer: Buffer; mime: string; name: string }[]
> {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const images: { buffer: Buffer; mime: string; name: string }[] = [];
  for (const product of products) {
    // Carica SOLO la PRIMA immagine del prodotto (la più rappresentativa).
    // Le immagini extra (scene, viste multiple, altri modelli) confondono
    // il modello e lo portano a sostituire il prodotto con uno simile.
    const imagePaths = product.images ?? [];
    if (imagePaths.length === 0) continue;

    const imagePath = imagePaths[0];
    // Il path è relativo a /public (es. /products/sofas/augusto.png)
    const filePath = join(process.cwd(), "public", imagePath.replace(/^\//, ""));
    try {
      const buffer = readFileSync(filePath);
      const mime = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
      const anchorIds = objectAssignments
        .filter((assignment) => assignment.product.id === product.id)
        .map((assignment) => assignment.objectId);
      const referenceName = anchorIds.length > 0
        ? `${anchorIds.join("-")}-${product.id}.png`
        : `${product.id}.png`;
      images.push({
        buffer,
        mime,
        name: referenceName,
      });
      console.log(`📷 Immagine prodotto caricata: ${product.name}`);
    } catch (err) {
      console.warn(`⚠️ Immagine non trovata per ${product.name}: ${filePath}`);
    }
  }
  return images;
}

/**
 * Crea una piccola mappa PNG della scena da usare come riferimento visivo.
 * Non è il render finale: serve a trasferire al modello la geometria della
 * stanza e la posizione esatta della camera/degli ancoraggi CAD.
 */
async function buildSceneReferenceImage(
  scene: RenderSceneSpec
): Promise<{ buffer: Buffer; mime: string; name: string }> {
  if (!scene.room || !scene.camera) {
    throw new Error("Scena incompleta: impossibile creare la mappa di riferimento");
  }

  const { default: sharp } = await import("sharp");
  const width = 1400;
  const height = 1000;
  const padding = 110;
  const bounds = scene.room.bounds;
  const scale = Math.min(
    (width - padding * 2) / Math.max(bounds.width, 1),
    (height - padding * 2) / Math.max(bounds.height, 1)
  );
  const mapPoint = (x: number, y: number) => ({
    x: padding + (x - bounds.x) * scale,
    y: padding + (y - bounds.y) * scale,
  });
  const roomPoints = scene.room.polygon.map(([x, y]) => mapPoint(x, y));
  const roomPolygon = roomPoints
    .map((point) => String(point.x) + "," + String(point.y))
    .join(" ");
  const cameraPoint = mapPoint(scene.camera.x, scene.camera.y);
  const direction = ((scene.camera.rotation - 90) * Math.PI) / 180;
  const directionLength = Math.max(bounds.width, bounds.height) * scale * 0.48;
  const cameraTarget = {
    x: cameraPoint.x + Math.cos(direction) * directionLength,
    y: cameraPoint.y + Math.sin(direction) * directionLength,
  };
  const fov = (scene.camera.fov * Math.PI) / 180;
  const leftDirection = direction - fov / 2;
  const rightDirection = direction + fov / 2;
  const coneLeft = {
    x: cameraPoint.x + Math.cos(leftDirection) * directionLength,
    y: cameraPoint.y + Math.sin(leftDirection) * directionLength,
  };
  const coneRight = {
    x: cameraPoint.x + Math.cos(rightDirection) * directionLength,
    y: cameraPoint.y + Math.sin(rightDirection) * directionLength,
  };

  const openings = scene.room.openings
    .map((opening) => {
      const center = mapPoint(opening.position.x, opening.position.y);
      const halfWidth = (opening.width * scale) / 2;
      const horizontal = opening.wall === "north" || opening.wall === "south";
      const start = horizontal
        ? { x: center.x - halfWidth, y: center.y }
        : { x: center.x, y: center.y - halfWidth };
      const end = horizontal
        ? { x: center.x + halfWidth, y: center.y }
        : { x: center.x, y: center.y + halfWidth };
      const color = opening.type === "window" ? "#60a5fa" : "#f59e0b";
      return (
        "<line x1=\"" +
        start.x +
        "\" y1=\"" +
        start.y +
        "\" x2=\"" +
        end.x +
        "\" y2=\"" +
        end.y +
        "\" stroke=\"" +
        color +
        "\" stroke-width=\"12\" stroke-linecap=\"round\"/>" +
        "<text x=\"" +
        (center.x + 10) +
        "\" y=\"" +
        (center.y - 12) +
        "\" class=\"opening-label\">" +
        escapeXml(opening.type) +
        "</text>"
      );
    })
    .join("");

  const anchors = scene.objects
    .filter((object) => object.roomId === scene.room?.id)
    .map((object) => {
      const point = mapPoint(object.anchorCenter.x, object.anchorCenter.y);
      return (
        "<circle cx=\"" +
        point.x +
        "\" cy=\"" +
        point.y +
        "\" r=\"12\" fill=\"#c8ff00\" stroke=\"#10181d\" stroke-width=\"4\"/>" +
        "<text x=\"" +
        (point.x + 18) +
        "\" y=\"" +
        (point.y + 5) +
        "\" class=\"anchor-label\">" +
        escapeXml(object.productName) +
        "</text>"
      );
    })
    .join("");

  const svg = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" +
      width +
      "\" height=\"" +
      height +
      "\" viewBox=\"0 0 \"" +
      width +
      " " +
      height +
      "\">",
    "<style>.title { font: 700 30px sans-serif; fill: #f8fafc; }.meta { font: 500 18px sans-serif; fill: #cbd5e1; }.opening-label, .anchor-label { font: 600 16px sans-serif; fill: #f8fafc; }</style>",
    "<rect width=\"" + width + "\" height=\"" + height + "\" fill=\"#111a20\"/>",
    "<text x=\"" +
      padding +
      "\" y=\"54\" class=\"title\">SCENA DI RIFERIMENTO · " +
      escapeXml(scene.room.name) +
      "</text>",
    "<text x=\"" +
      padding +
      "\" y=\"84\" class=\"meta\">Top-down map · camera " +
      Math.round(scene.camera.rotation) +
      "° · FOV " +
      Math.round(scene.camera.fov) +
      "° · green = catalog anchor</text>",
    "<polygon points=\"" +
      roomPolygon +
      "\" fill=\"#edf2f7\" stroke=\"#334155\" stroke-width=\"8\" stroke-linejoin=\"round\"/>",
    openings,
    "<path d=\"M " +
      cameraPoint.x +
      " " +
      cameraPoint.y +
      " L " +
      coneLeft.x +
      " " +
      coneLeft.y +
      " L " +
      coneRight.x +
      " " +
      coneRight.y +
      " Z\" fill=\"#c8ff00\" fill-opacity=\"0.22\" stroke=\"#c8ff00\" stroke-width=\"3\"/>",
    "<line x1=\"" +
      cameraPoint.x +
      "\" y1=\"" +
      cameraPoint.y +
      "\" x2=\"" +
      cameraTarget.x +
      "\" y2=\"" +
      cameraTarget.y +
      "\" stroke=\"#c8ff00\" stroke-width=\"8\" stroke-linecap=\"round\"/>",
    "<circle cx=\"" +
      cameraPoint.x +
      "\" cy=\"" +
      cameraPoint.y +
      "\" r=\"16\" fill=\"#c8ff00\" stroke=\"#10181d\" stroke-width=\"5\"/>",
    anchors,
    "<text x=\"" +
      padding +
      "\" y=\"" +
      (height - 48) +
      "\" class=\"meta\">The room boundary, openings, camera cone and anchor positions are authoritative. Generate a perspective interior render from this scene.</text>",
    "</svg>",
  ].join("");

  return {
    buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
    mime: "image/png",
    name: "floorplan-scene-reference.png",
  };
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
