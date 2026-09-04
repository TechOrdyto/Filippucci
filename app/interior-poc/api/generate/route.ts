import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccess } from "@/lib/auth/roles";
import { findProductById } from "../../lib/catalog";
import floorplanModel from "../../data/floorplan-model-casa-enri.json";
import floorplanDxf from "../../data/floorplan-dxf-casa-enri.json";
import designerRules from "../../data/designer-rules.json";
import { planAreaToSquareMeters, planUnitsToMeters, roundMeters } from "../../floorplan/units";
import { geometryCenter, pointInPolygon } from "../../floorplan/geometry";
import type { ObjectProductAssignment, Product } from "../../lib/types";
import {
  buildRenderScene,
  validateRenderScene,
} from "../../lib/rendering/scene";
import type { RenderSceneSpec } from "../../lib/rendering/scene";
import { buildCanonicalPrompt } from "../../lib/rendering/prompt-builder";

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
    doors?: string | null;
    windows?: string | null;
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
      (assignment) =>
        !selectedRoom ||
        (assignment.room?.id === selectedRoom.id &&
          isObjectCenterInsideRoom(assignment.object, selectedModelRoom))
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

    // 1b. Pulisci il prompt: rimuovi le mention @ (es. "@Augusto di fianco")
    // Il modello NON deve disegnare il testo "@Augusto"
    const cleanUserPrompt = cleanPrompt(body.prompt, products as any[]);

    // 1c. Estrai le linee walls del DXF che delimitano la stanza selezionata.
    // Il modello deve vedere DOVE sono i muri (e dove NON sono), così non
    // inventa muri fantasma dietro i mobili. Filtro per bbox estesa della
    // stanza: include il perimetro e le eventuali pareti interne/nicchie.
    const sceneWalls = selectedModelRoom
      ? extractRoomWalls(dxf, selectedModelRoom)
      : [];

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
      walls: sceneWalls,
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

    // 2. Costruisci il prompt canonico: UNICO testo effettivamente inviato
    // a OpenAI. Non esiste più un "prompt per il log" diverso dal provider:
    // `providerPrompt` È il testo inviato; `debugPrompt` è la versione estesa
    // diagnostica; `scene` è il contratto strutturato della scena.
    const canonical = buildCanonicalPrompt({
      scene,
      designerRules: rules,
      referenceImages: buildReferenceImageMapping(scene, products as any[], objectAssignments),
    });
    const providerPrompt = canonical.providerPrompt;
    const debugPrompt = canonical.debugPrompt;

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
          scene,
          request.url
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Generazione immagine fallita:", err);

      const userMessage = /credit|billing|quota|insufficient/i.test(errorMessage)
        ? "Generazione non disponibile: il progetto OpenAI non ha crediti disponibili."
        : "Generazione immagine non riuscita. Riprova tra poco.";

      return NextResponse.json(
        {
          error: userMessage,
          warnings: sceneValidation.warnings,
        },
        { status: 502 }
      );
    }

    const generationWarnings = [...sceneValidation.warnings];
    if (provider === "pollinations") {
      generationWarnings.push(
        "Anteprima senza chiave API: il provider non riceve le foto catalogo né la mappa di scena come immagini di riferimento. Per la demo fedele attiva OPENAI_API_KEY."
      );
    }
    return NextResponse.json({
      imageUrl,
      provider,
      prompt: providerPrompt,
      providerPrompt,
      debugPrompt,
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

/**
 * Costruisce la mappa delle immagini di riferimento per la sezione
 * REFERENCE IMAGE MAPPING del prompt canonico.
 * La mappa top-down di scena è sempre la prima immagine; le foto prodotto
 * seguono (deduplicate per prodotto, non per istanza).
 * I nomi file devono corrispondere ESATTAMENTE a quelli inviati al provider
 * (vedi loadProductImages: `<anchorIds>-<productId>.png` oppure `<productId>.png`).
 */
function buildReferenceImageMapping(
  scene: RenderSceneSpec,
  products: any[],
  objectAssignments: ResolvedObjectAssignment[] = []
): Array<{ name: string; label: string }> {
  const mapping: Array<{ name: string; label: string }> = [];

  if (scene.room && scene.camera) {
    mapping.push({
      name: "perspective-scene-reference.png",
      label: `authoritative perspective blockout of ${scene.room.name} (vanishing point, wall planes, floor depth, camera and furniture placement)`,
    });
    mapping.push({
      name: "floorplan-scene-reference.png",
      label: `authoritative top-down CAD scene map of ${scene.room.name} (room, openings, camera cone, furniture anchors)`,
    });
  }

  for (const product of products) {
    const instances = scene.furnitureInstances.filter(
      (instance) => instance.productId === product.id
    );
    const anchorIds = objectAssignments
      .filter((assignment) => assignment.product.id === product.id)
      .map((assignment) => assignment.objectId);
    const fileName =
      anchorIds.length > 0
        ? `${anchorIds.join("-")}-${product.id}.png`
        : `${product.id}.png`;
    const label = instances.length
      ? `${instances.length} instance${instances.length > 1 ? "s" : ""} of ${product.name} (${product.id})`
      : `${product.name} (${product.id})`;
    mapping.push({
      name: fileName,
      label,
    });
  }

  return mapping;
}

/**
 * Estrae le linee walls del DXF che delimitano la stanza selezionata.
 * Mantiene i segmenti sul perimetro reale e gli eventuali segmenti interni
 * completamente contenuti nella stanza, scartando i prolungamenti tecnici
 * delle pareti delle stanze adiacenti.
 * Le linee restano in unità piano (cm): la conversione in metri avviene in
 * buildRenderScene.
 */
function extractRoomWalls(dxf: any, room: any): Array<{ id: string; start: [number, number]; end: [number, number] }> {
  const pts = room.geometry.points as [number, number][];
  const perimeterTolerance = 16;

  return (dxf.lines ?? [])
    .filter((line: any) => line.layer === "walls")
    .filter((line: any) => {
      const [x1, y1] = line.start;
      const [x2, y2] = line.end;
      const midpoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      const nearPerimeter = pts.some(([startX, startY], index) => {
        const [endX, endY] = pts[(index + 1) % pts.length];
        return distancePointToSegment(
          midpoint.x,
          midpoint.y,
          startX,
          startY,
          endX,
          endY
        ) <= perimeterTolerance;
      });
      const endpointsInside =
        pointInPolygon(x1, y1, pts) && pointInPolygon(x2, y2, pts);
      return nearPerimeter || endpointsInside;
    })
    .map((line: any, index: number) => ({
      id: line.id ?? `wall-${index}`,
      start: line.start,
      end: line.end,
    }));
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);

  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)
  );
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isObjectCenterInsideRoom(object: any, room: any | null): boolean {
  if (!room) return true;

  const center = geometryCenter(object.geometry);
  return pointInPolygon(center.x, center.y, room.geometry.points);
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
  scene: RenderSceneSpec,
  requestUrl: string
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

  // La reference prospettica è la prima immagine perché l'endpoint edits tende
  // a preservare soprattutto la composizione della prima immagine allegata.
  // La mappa CAD resta subito dopo come vincolo geometrico autorevole.
  const referenceImages: { buffer: Buffer; mime: string; name: string }[] = [];
  try {
    referenceImages.push(await buildPerspectiveSceneReferenceImage(scene));
  } catch (err) {
    console.warn("⚠️ Riferimento prospettico non disponibile:", err);
  }
  try {
    referenceImages.push(await buildSceneReferenceImage(scene));
  } catch (err) {
    console.warn("⚠️ Riferimento planimetrico non disponibile:", err);
  }
  referenceImages.push(...(await loadProductImages(products, objectAssignments, requestUrl)));

  const referenceImageNumbers = new Map(
    referenceImages.map((image, index) => [image.name, index + 1])
  );

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
        const referenceImageNumber = referenceImageNumbers.get(
          getProductReferenceName(p, objectAssignments)
        );
        const referenceLabel = referenceImageNumber
          ? `Reference photo: image ${referenceImageNumber}.`
          : "Reference photo: not available.";
        return `- Product ${i + 1}: ${p.name} by ${p.designer} (${dims}). ${referenceLabel}`;
      })
      .join("\n");

    parts.push(
      `MANDATORY FURNITURE — reproduce EXACTLY as in the reference photos:\n${constraints}\n` +
        `STRICT RULES:\n` +
        `- Each product MUST be identical to its reference photo: same design, silhouette, proportions, colors, materials, legs, upholstery.\n` +
        `- DO NOT substitute, replace, redesign, or invent similar furniture.\n` +
        `- DO NOT change colors, materials, or proportions.\n` +
        `- USE ONLY THE LISTED PRODUCT from each reference photo: use its silhouette, materials and details; treat every pixel outside the product silhouette as irrelevant.\n` +
        `- NEVER reproduce, infer or borrow any other visible object or any product-photo background, floor, walls, lighting, framing, camera angle, composition or furniture placement.\n` +
        `- DO NOT add furniture that is not listed above.\n` +
        `- DO NOT horizontally mirror or flip the room, wall corner, openings or furniture placement.\n` +
        `- If a product appears in the scene, it MUST be the exact product from the photo.`
    );
  }

  // 3. Stile fotorealistico
  parts.push(
    referenceImages.some((image) => image.name === "perspective-scene-reference.png")
      ? "The first reference image is an authoritative perspective blockout. Preserve its vanishing point, wall planes, floor depth, camera-to-furniture distance and furniture placement while converting it into a photorealistic interior. The second reference image is the authoritative top-down CAD map for room shape, openings, camera point and anchor positions. Never output a floorplan, wireframe or diagram."
      : "The first reference image is an authoritative top-down CAD scene map with the selected room, openings, camera point, viewing direction and catalog anchors. Convert that map into the requested interior perspective; never output a floorplan or a diagram."
  );

  parts.push(
    "photorealistic interior render, professional architectural photography, natural daylight, high quality, realistic materials"
  );

  const imagePrompt = parts.join(". ");

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
  // input_fidelity=high forza il modello a rispettare fedelmente le immagini
  // di input (la mappa top-down di scena): geometria, posizione mobili,
  // angolatura e profondità devono combaciare con la piantina.
  form.append("input_fidelity", "high");

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
  objectAssignments: ResolvedObjectAssignment[] = [],
  requestUrl?: string
): Promise<
  { buffer: Buffer; mime: string; name: string }[]
> {
  const { existsSync, readFileSync } = await import("node:fs");
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
    let buffer: Buffer;
    try {
      if (existsSync(filePath)) {
        buffer = readFileSync(filePath);
      } else if (requestUrl) {
        const response = await fetch(new URL(imagePath, requestUrl));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        buffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error("file non presente nel bundle");
      }
    } catch (err) {
      console.warn(`⚠️ Immagine non trovata per ${product.name}: ${imagePath}`, err);
      continue;
    }

    const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
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
  }
  return images;
}

function getProductReferenceName(
  product: any,
  objectAssignments: ResolvedObjectAssignment[]
): string {
  const anchorIds = objectAssignments
    .filter((assignment) => assignment.product.id === product.id)
    .map((assignment) => assignment.objectId);
  return anchorIds.length > 0
    ? `${anchorIds.join("-")}-${product.id}.png`
    : `${product.id}.png`;
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

  // Muri reali del DXF: il modello deve vedere DOVE sono i muri (e dove NON
  // sono), così non inventa muri fantasma dietro i mobili. Le linee sono già
  // in metri nel contratto di scena.
  const walls = (scene.room.walls ?? [])
    .map((wall) => {
      const start = mapPoint(wall.start[0], wall.start[1]);
      const end = mapPoint(wall.end[0], wall.end[1]);
      return (
        "<line x1=\"" +
        start.x +
        "\" y1=\"" +
        start.y +
        "\" x2=\"" +
        end.x +
        "\" y2=\"" +
        end.y +
        "\" stroke=\"#1e293b\" stroke-width=\"14\" stroke-linecap=\"round\"/>"
      );
    })
    .join("");

  // Mobili come INGOMBRI REALI (rettangoli con le dimensioni del catalogo,
  // orientati secondo l'ancora CAD). Il modello deve vedere DOVE e QUANTO è
  // grande ogni mobile nella stanza, non un semplice puntino.
  const anchors = scene.objects
    .filter((object) => object.roomId === scene.room?.id)
    .map((object) => {
      const center = mapPoint(object.anchorCenter.x, object.anchorCenter.y);
      const dims = object.productDimensions;
      const w = dims?.width ? (dims.width / 100) * scale : 40;
      const d = dims?.depth ? (dims.depth / 100) * scale : 30;
      const x = center.x - w / 2;
      const y = center.y - d / 2;
      return (
        "<rect x=\"" +
        x +
        "\" y=\"" +
        y +
        "\" width=\"" +
        w +
        "\" height=\"" +
        d +
        "\" rx=\"6\" fill=\"#c8ff00\" fill-opacity=\"0.55\" stroke=\"#10181d\" stroke-width=\"4\"/>" +
        "<text x=\"" +
        (center.x + 14) +
        "\" y=\"" +
        (center.y + 5) +
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
      "\" viewBox=\"0 0 " +
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
      scene.camera.rotation.toFixed(1) +
      "° · FOV " +
      Math.round(scene.camera.fov) +
      "° · dark lines = real walls · green rectangles = furniture footprints</text>",
    "<polygon points=\"" +
      roomPolygon +
      "\" fill=\"#edf2f7\" stroke=\"#334155\" stroke-width=\"8\" stroke-linejoin=\"round\"/>",
    walls,
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
 * Crea una costruzione prospettica semplificata della stanza.
 *
 * La mappa top-down è precisa per la posizione, ma un modello immagini può
 * leggerla come una planimetria e appiattire la profondità. Questa seconda
 * reference proietta sul piano immagine le pareti, il pavimento e gli
 * ingombri CAD dalla stessa camera del contratto di scena.
 */
async function buildPerspectiveSceneReferenceImage(
  scene: RenderSceneSpec
): Promise<{ buffer: Buffer; mime: string; name: string }> {
  if (!scene.room || !scene.camera) {
    throw new Error("Scena incompleta: impossibile creare il blockout prospettico");
  }

  const { default: sharp } = await import("sharp");
  const width = 1400;
  const height = 1000;
  const horizon = 340;
  const focalLength = width / (2 * Math.tan((scene.camera.fov * Math.PI) / 360));
  const cameraHeight = scene.camera.height;
  const rotation = (scene.camera.rotation * Math.PI) / 180;
  const forward = { x: Math.sin(rotation), y: -Math.cos(rotation) };
  const right = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const nearClip = 0.12;

  type PlanPoint = { x: number; y: number };
  type ProjectedPoint = { x: number; y: number; depth: number };

  const depthAt = (point: PlanPoint) =>
    (point.x - scene.camera!.x) * forward.x +
    (point.y - scene.camera!.y) * forward.y;

  const projectPoint = (point: PlanPoint, z = 0): ProjectedPoint | null => {
    const depth = depthAt(point);
    if (depth <= nearClip) return null;

    return {
      x: width / 2 + ((point.x - scene.camera!.x) * right.x + (point.y - scene.camera!.y) * right.y) * focalLength / depth,
      y: horizon + (cameraHeight - z) * focalLength / depth,
      depth,
    };
  };

  const projectSegment = (
    start: PlanPoint,
    end: PlanPoint,
    z = 0
  ): [ProjectedPoint, ProjectedPoint] | null => {
    const startDepth = depthAt(start);
    const endDepth = depthAt(end);
    if (startDepth <= nearClip && endDepth <= nearClip) return null;

    let visibleStart = start;
    let visibleEnd = end;
    if (startDepth <= nearClip) {
      const t = (nearClip - startDepth) / (endDepth - startDepth);
      visibleStart = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
    if (endDepth <= nearClip) {
      const t = (nearClip - startDepth) / (endDepth - startDepth);
      visibleEnd = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }

    const projectedStart = projectPoint(visibleStart, z);
    const projectedEnd = projectPoint(visibleEnd, z);
    return projectedStart && projectedEnd ? [projectedStart, projectedEnd] : null;
  };

  const pointString = (points: ProjectedPoint[]) =>
    points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lineString = (start: ProjectedPoint, end: ProjectedPoint, attributes: string) =>
    `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" ${attributes}/>`;

  const roomPlan = scene.room.polygon.map(([x, y]) => ({ x, y }));
  const roomFloor = roomPlan
    .map((point) => projectPoint(point))
    .filter((point): point is ProjectedPoint => point !== null);
  const floorPolygon = roomFloor.length >= 3
    ? `<polygon points="${pointString(roomFloor)}" fill="#c9c1b5" fill-opacity="0.92"/>`
    : `<polygon points="0,${horizon} ${width},${horizon} ${width},${height} 0,${height}" fill="#c9c1b5"/>`;

  const wallSurfaces = roomPlan
    .map((start, index) => {
      const end = roomPlan[(index + 1) % roomPlan.length];
      const bottom = projectSegment(start, end, 0);
      const top = projectSegment(start, end, scene.room!.ceilingHeight);
      if (!bottom || !top) return "";

      const points = [bottom[0], bottom[1], top[1], top[0]];
      const fill = index % 2 === 0 ? "#e4e8e5" : "#d4dcda";
      return `<polygon points="${pointString(points)}" fill="${fill}" fill-opacity="0.88" stroke="#263238" stroke-width="5" stroke-linejoin="round"/>`;
    })
    .join("");

  const wallLines = (scene.room.walls ?? [])
    .map((wall) => {
      const segment = projectSegment(
        { x: wall.start[0], y: wall.start[1] },
        { x: wall.end[0], y: wall.end[1] },
        0
      );
      return segment ? lineString(segment[0], segment[1], 'stroke="#172027" stroke-width="7"') : "";
    })
    .join("");

  const furniture = scene.objects
    .map((object) => {
      const dimensions = object.productDimensions;
      const halfWidth = Math.max((dimensions?.width ?? 50) / 100 / 2, 0.05);
      const halfDepth = Math.max((dimensions?.depth ?? 55) / 100 / 2, 0.05);
      const height = Math.min((dimensions?.height ?? 80) / 100, scene.room!.ceilingHeight * 0.92);
      const center = object.anchorCenter;
      const footprint: PlanPoint[] = [
        { x: center.x - halfWidth, y: center.y - halfDepth },
        { x: center.x + halfWidth, y: center.y - halfDepth },
        { x: center.x + halfWidth, y: center.y + halfDepth },
        { x: center.x - halfWidth, y: center.y + halfDepth },
      ];
      const floorPoints = footprint.map((point) => projectPoint(point));
      const topPoints = footprint.map((point) => projectPoint(point, height));
      if (
        floorPoints.some((point) => point === null) ||
        topPoints.some((point) => point === null)
      ) {
        return "";
      }

      const projectedFloor = floorPoints as ProjectedPoint[];
      const projectedTop = topPoints as ProjectedPoint[];
      const verticalEdges = projectedFloor
        .map((point, index) => lineString(point, projectedTop[index], 'stroke="#172027" stroke-width="4"'))
        .join("");
      return `${verticalEdges}<polygon points="${pointString(projectedFloor)}" fill="#a6b0ad" stroke="#172027" stroke-width="5" stroke-linejoin="round"/><polygon points="${pointString(projectedTop)}" fill="#c8ff00" fill-opacity="0.8" stroke="#172027" stroke-width="5" stroke-linejoin="round"/><text x="${projectedTop[0].x.toFixed(1)}" y="${Math.max(projectedTop[0].y - 14, 96).toFixed(1)}" class="anchor-label">${escapeXml(object.productName)} · exact CAD position</text>`;
    })
    .join("");

  const depthLines = [1, 2, 3, 4, 5]
    .map((distance) => {
      const left = projectPoint({
        x: scene.camera!.x + forward.x * distance - right.x * 4,
        y: scene.camera!.y + forward.y * distance - right.y * 4,
      });
      const rightPoint = projectPoint({
        x: scene.camera!.x + forward.x * distance + right.x * 4,
        y: scene.camera!.y + forward.y * distance + right.y * 4,
      });
      return left && rightPoint
        ? lineString(left, rightPoint, 'stroke="#8a8177" stroke-width="2" stroke-opacity="0.45"')
        : "";
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<style>.title { font: 700 30px sans-serif; fill: #f8fafc; }.meta { font: 500 18px sans-serif; fill: #cbd5e1; }.anchor-label { font: 700 17px sans-serif; fill: #172027; }</style>",
    `<rect width="${width}" height="${height}" fill="#172027"/>`,
    `<text x="70" y="52" class="title">PERSPECTIVE BLOCKOUT · ${escapeXml(scene.room.name)}</text>`,
    `<text x="70" y="82" class="meta">Exact camera ${scene.camera.rotation.toFixed(1)}° · FOV ${Math.round(scene.camera.fov)}° · screen-right plan vector (${right.x.toFixed(2)}, ${right.y.toFixed(2)}) · green volume = catalog anchor at measured depth</text>`,
    `<rect x="0" y="${horizon}" width="${width}" height="${height - horizon}" fill="#c9c1b5"/>`,
    floorPolygon,
    depthLines,
    wallSurfaces,
    wallLines,
    furniture,
    `<line x1="0" y1="${horizon}" x2="${width}" y2="${horizon}" stroke="#7b8a87" stroke-width="3" stroke-dasharray="12 10"/>`,
    `<text x="70" y="${horizon + 42}" class="meta">SCREEN LEFT</text>`,
    `<text x="${width - 220}" y="${horizon + 42}" class="meta">SCREEN RIGHT</text>`,
    `<text x="70" y="${height - 45}" class="meta">Convert this measured perspective construction into a photorealistic room. Preserve room depth, wall planes and the furniture distance from the camera.</text>`,
    "</svg>",
  ].join("");

  return {
    buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
    mime: "image/png",
    name: "perspective-scene-reference.png",
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
