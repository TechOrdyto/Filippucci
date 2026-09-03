// PROMPT CANONICO per la generazione render.
//
// Questo modulo è l'UNICA fonte del testo effettivamente inviato a OpenAI.
// Non esiste un "prompt per il log" diverso da quello del provider:
// `providerPrompt` È il testo inviato; `debugPrompt` è una versione estesa
// diagnostica (mai usata come input del provider).
//
// Il prompt è costruito SOLO dai campi del contratto di scena
// (RenderSceneSpec), che è una allowlist assoluta: il modello non deve
// interpretare liberamente la scena né completarla con elementi generici.

import type { RenderPromptResult, RenderSceneSpec, PromptSection } from "./types";

// Ordine fisso delle sezioni del prompt canonico.
export const PROMPT_SECTIONS = [
  "AUTHORITATIVE SCENE RULES",
  "ROOM",
  "CAMERA",
  "FURNITURE INSTANCE MANIFEST",
  "REFERENCE IMAGE MAPPING",
  "ROOM FINISHES",
  "DESIGNER RULES",
  "USER RENDER DIRECTION",
  "ABSOLUTE ALLOWLIST",
  "ABSOLUTE PROHIBITIONS",
  "OUTPUT INSTRUCTION",
] as const;

export type PromptSectionId = (typeof PROMPT_SECTIONS)[number];

export interface CanonicalPromptInput {
  scene: RenderSceneSpec;
  designerRules?: {
    style?: { primary?: string; secondary?: string[]; avoid?: string[] };
    colorPalette?: { preferred?: string[]; accentAllowed?: string[]; avoid?: string[] };
    materials?: { preferred?: string[]; avoid?: string[] };
    layoutPrinciples?: Record<string, unknown>;
    atmosphere?: { brightness?: string; warmth?: string; formality?: string };
    aiInstructions?: string;
  } | null;
  /** Mappa delle immagini di riferimento: nome file → descrizione (istanza/prodotto). */
  referenceImages?: Array<{ name: string; label: string }>;
}

/**
 * Costruisce il prompt canonico completo (provider + debug) dal contratto
 * di scena. Il testo del provider contiene TUTTE le sezioni nell'ordine
 * canonico; il debug aggiunge un'appendice diagnostica.
 */
export function buildCanonicalPrompt(input: CanonicalPromptInput): RenderPromptResult {
  const sections = buildPromptSections(input);
  const providerPrompt = sections.map((section) => section.body).filter(Boolean).join("\n\n");
  const debugPrompt = buildDebugPrompt(providerPrompt, input);

  return { providerPrompt, debugPrompt, scene: input.scene };
}

function buildPromptSections(input: CanonicalPromptInput): PromptSection[] {
  const { scene } = input;
  const sections: PromptSection[] = [];

  // 1. AUTHORITATIVE SCENE RULES
  sections.push({
    id: "AUTHORITATIVE SCENE RULES",
    title: "AUTHORITATIVE SCENE RULES",
    body: `AUTHORITATIVE SCENE RULES:
The scene below is built from three authoritative sources:
1. FLOORPLAN: room geometry, walls, openings, camera and furniture positions.
2. CATALOG: identity, design, materials, colors and physical dimensions of every furniture piece.
3. USER FIELDS: finishes and directions explicitly entered by the user.
The scene contract is an ABSOLUTE ALLOWLIST. Render ONLY what is described below. Do not interpret the scene freely and do not complete it with generic elements.`,
  });

  // 2. ROOM
  sections.push({
    id: "ROOM",
    title: "ROOM",
    body: buildRoomSection(scene),
  });

  // 3. CAMERA
  sections.push({
    id: "CAMERA",
    title: "CAMERA",
    body: buildCameraSection(scene),
  });

  // 4. FURNITURE INSTANCE MANIFEST
  sections.push({
    id: "FURNITURE INSTANCE MANIFEST",
    title: "FURNITURE INSTANCE MANIFEST",
    body: buildFurnitureManifestSection(scene),
  });

  // 5. REFERENCE IMAGE MAPPING
  sections.push({
    id: "REFERENCE IMAGE MAPPING",
    title: "REFERENCE IMAGE MAPPING",
    body: buildReferenceImageSection(input),
  });

  // 6. ROOM FINISHES
  sections.push({
    id: "ROOM FINISHES",
    title: "ROOM FINISHES",
    body: buildFinishesSection(scene),
  });

  // 7. DESIGNER RULES
  sections.push({
    id: "DESIGNER RULES",
    title: "DESIGNER RULES",
    body: buildDesignerRulesSection(input.designerRules),
  });

  // 8. USER RENDER DIRECTION
  sections.push({
    id: "USER RENDER DIRECTION",
    title: "USER RENDER DIRECTION",
    body: buildUserDirectionSection(scene),
  });

  // 9. ABSOLUTE ALLOWLIST
  sections.push({
    id: "ABSOLUTE ALLOWLIST",
    title: "ABSOLUTE ALLOWLIST",
    body: buildAllowlistSection(scene),
  });

  // 10. ABSOLUTE PROHIBITIONS
  sections.push({
    id: "ABSOLUTE PROHIBITIONS",
    title: "ABSOLUTE PROHIBITIONS",
    body: buildProhibitionsSection(scene),
  });

  // 11. OUTPUT INSTRUCTION
  sections.push({
    id: "OUTPUT INSTRUCTION",
    title: "OUTPUT INSTRUCTION",
    body: buildOutputInstructionSection(scene),
  });

  return sections;
}

function buildRoomSection(scene: RenderSceneSpec): string {
  const room = scene.room;
  if (!room) {
    return "ROOM:\nNo room selected. The render must not invent a room.";
  }

  const polygon = room.polygon
    .map(([x, y]) => `(${formatMeters(x)},${formatMeters(y)})`)
    .join(" → ");

  const doors = room.doors.length
    ? room.doors
        .map(
          (door) =>
            `- ${door.id}: ${formatMeters(door.width)}m wide × ${formatMeters(door.height ?? 2.1)}m high on ${door.wall} wall (${door.exposure ?? door.wall} exposure)`
        )
        .join("\n")
    : "- none";

  const windows = room.windows.length
    ? room.windows
        .map(
          (window) =>
            `- ${window.id}: ${formatMeters(window.width)}m wide × ${formatMeters(window.height ?? 1.2)}m high on ${window.wall} wall (${window.exposure ?? window.wall} exposure)`
        )
        .join("\n")
    : "- none";

  // Se non ci sono muri interni, dichiaralo esplicitamente: il modello non
  // deve inventare muri fantasma dietro i mobili.
  const wallsDescription =
    room.walls.length > 0
      ? `${room.walls.length} wall segments (see the top-down scene map for exact positions)`
      : "no internal walls — the room is a single open space delimited only by its perimeter";

  return `ROOM:
- Floorplan: ${scene.floorplanId}
- Room: ${room.name} [${room.id}]${room.type ? `, type: ${room.type}` : ""}
- Polygon (meters): ${polygon}
- Bounds: x=${formatMeters(room.bounds.x)}m, y=${formatMeters(room.bounds.y)}m, ${formatMeters(room.bounds.width)}m × ${formatMeters(room.bounds.height)}m
- Width: ${formatMeters(room.width)}m
- Depth: ${formatMeters(room.depth)}m
- Area: ${formatMeters(room.area)} m²
- Ceiling height: ${formatMeters(room.ceilingHeight)}m
- Walls: ${wallsDescription}
- Doors:
${doors}
- Windows:
${windows}`;
}

function buildCameraSection(scene: RenderSceneSpec): string {
  const camera = scene.camera;
  if (!camera) {
    return "CAMERA:\nNo camera selected. The render must not invent a viewpoint.";
  }

  const view = describeCameraView(scene);

  return `CAMERA:
- Position: x=${formatMeters(camera.x)}m, y=${formatMeters(camera.y)}m
- Rotation: ${Math.round(camera.rotation)}° (0 = north, 90 = east, 180 = south, 270 = west)
- Direction: ${camera.direction}
- Field of view: ${Math.round(camera.fov)}°
- Camera height: ${formatMeters(camera.height)}m (eye level)
- Room: ${camera.roomId}
- Camera confirmed inside room: ${camera.insideRoom ? "true" : "false"}
${view ? `- What the camera sees (in depth order): ${view}` : ""}`;
}

/**
 * Descrive cosa vede la camera: muri e mobili nel cono FOV, in ordine di
 * profondità (dal più vicino al più lontano). Aiuta il modello a tradurre
 * la mappa top-down 2D in una prospettiva 3D con l'angolatura corretta.
 */
function describeCameraView(scene: RenderSceneSpec): string {
  const camera = scene.camera;
  const room = scene.room;
  if (!camera || !room) return "";

  const rad = (camera.rotation * Math.PI) / 180;
  const forwardX = Math.sin(rad);
  const forwardY = -Math.cos(rad);
  const rightX = Math.cos(rad);
  const rightY = Math.sin(rad);
  const fovHalf = (camera.fov * Math.PI) / 360;

  // Muri visibili: per ogni segmento, calcola se interseca il cono FOV
  // (approssimazione: il punto medio del muro deve essere nel cono).
  const visibleWalls = room.walls
    .map((wall) => {
      const mx = (wall.start[0] + wall.end[0]) / 2;
      const my = (wall.start[1] + wall.end[1]) / 2;
      const dx = mx - camera.x;
      const dy = my - camera.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.01) return null;
      const forwardDot = (dx * forwardX + dy * forwardY) / distance;
      const rightDot = (dx * rightX + dy * rightY) / distance;
      const angle = Math.atan2(rightDot, forwardDot);
      if (Math.abs(angle) > fovHalf) return null;
      return { distance, angle, id: wall.id };
    })
    .filter((wall): wall is { distance: number; angle: number; id: string } => wall !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((wall) => `wall ${wall.id} at ${formatMeters(wall.distance)}m`);

  // Mobili visibili: nel cono FOV, ordinati per distanza.
  const visibleFurniture = scene.furnitureInstances
    .map((instance) => {
      const dx = instance.position.x - camera.x;
      const dy = instance.position.y - camera.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.01) return null;
      const forwardDot = (dx * forwardX + dy * forwardY) / distance;
      const rightDot = (dx * rightX + dy * rightY) / distance;
      const angle = Math.atan2(rightDot, forwardDot);
      if (Math.abs(angle) > fovHalf) return null;
      return { distance, angle, name: instance.productName, id: instance.instanceId };
    })
    .filter((f): f is { distance: number; angle: number; name: string; id: string } => f !== null)
    .sort((a, b) => a.distance - b.distance)
    .map((f) => `${f.name} at ${formatMeters(f.distance)}m`);

  const parts: string[] = [];
  if (visibleFurniture.length) parts.push(`furniture: ${visibleFurniture.join(", ")}`);
  if (visibleWalls.length) parts.push(`walls: ${visibleWalls.join(", ")}`);
  return parts.join("; ");
}

function buildFurnitureManifestSection(scene: RenderSceneSpec): string {
  const instances = scene.furnitureInstances;
  const count = instances.length;
  const camera = scene.camera;

  const lines = instances.map((instance, index) => {
    const dims = instance.footprint
      ? `${formatMeters(instance.footprint.width)}m W × ${formatMeters(instance.footprint.depth)}m D × ${formatMeters(instance.footprint.height)}m H`
      : "dimensions not available";
    const materials = instance.materials.length ? instance.materials.join(", ") : "not specified";
    const finishes = instance.finishes.length ? instance.finishes.join(", ") : "not specified";
    const relative = camera
      ? describeRelativePosition(instance.position, camera)
      : "";
    return `- [I${index + 1}] ${instance.productId} — ${instance.productName} by ${instance.productDesigner}
  Anchor: ${instance.anchorId} at (${formatMeters(instance.position.x)}m, ${formatMeters(instance.position.y)}m)
  Footprint: ${dims}
  Materials: ${materials}
  Finishes: ${finishes}${relative ? `\n  Relative to camera: ${relative}` : ""}`;
  });

  return `FURNITURE INSTANCE MANIFEST:
EXACT FURNITURE INSTANCE COUNT:
The scene contains exactly ${count} furniture instances.
Render exactly ${count} furniture instances.
Do not duplicate, remove, merge or invent any furniture instance.
${lines.length ? lines.join("\n") : "- No furniture instances in this scene."}`;
}

/**
 * Descrive la posizione di un mobile rispetto alla camera (distanza e lato).
 * Aiuta il modello a collocare il mobile correttamente nella prospettiva.
 */
function describeRelativePosition(
  position: { x: number; y: number },
  camera: { x: number; y: number; rotation: number }
): string {
  const dx = position.x - camera.x;
  const dy = position.y - camera.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Direzione della camera: rotation 0 = nord (y negativo), 90 = est (x positivo)
  const rad = (camera.rotation * Math.PI) / 180;
  const forwardX = Math.sin(rad);
  const forwardY = -Math.cos(rad);
  const rightX = Math.cos(rad);
  const rightY = Math.sin(rad);

  const forwardDot = dx * forwardX + dy * forwardY;
  const rightDot = dx * rightX + dy * rightY;

  const depth = forwardDot >= 0 ? "in front of the camera" : "behind the camera";
  const side =
    Math.abs(rightDot) < 0.5
      ? "centered"
      : rightDot > 0
        ? "to the right of the camera view"
        : "to the left of the camera view";

  return `${depth}, ${side}, approximately ${formatMeters(distance)}m from the camera`;
}

function buildReferenceImageSection(input: CanonicalPromptInput): string {
  const images = input.referenceImages ?? [];
  if (images.length === 0) {
    return "REFERENCE IMAGE MAPPING:\nNo reference images provided.";
  }

  const lines = images.map((image, index) => `- Image ${index + 1} (${image.name}) → ${image.label}`);
  return `REFERENCE IMAGE MAPPING:
${lines.join("\n")}
The reference images are authoritative for the identity of the furniture and the spatial layout. Reproduce them faithfully.`;
}

function buildFinishesSection(scene: RenderSceneSpec): string {
  const walls = scene.finishes.walls?.trim();
  const floor = scene.finishes.floor?.trim();

  if (!walls && !floor) {
    return "ROOM FINISHES:\nNo finishes specified by the user. Keep the room neutral and do not invent finishes.";
  }

  return `ROOM FINISHES:
- Wall finish: ${walls || "not specified"}
- Floor finish: ${floor || "not specified"}
These finishes come from the user fields and are authoritative.`;
}

function buildDesignerRulesSection(
  rules: CanonicalPromptInput["designerRules"]
): string {
  if (!rules) {
    return "DESIGNER RULES:\nNo designer rules provided.";
  }

  const style = rules.style;
  const palette = rules.colorPalette;
  const materials = rules.materials;
  const atmosphere = rules.atmosphere;

  const lines: string[] = [];
  if (style?.primary) {
    lines.push(`- Style: ${style.primary}${style.avoid?.length ? ` (avoid: ${style.avoid.join(", ")})` : ""}`);
  }
  if (palette?.preferred?.length) {
    lines.push(`- Preferred colors: ${palette.preferred.join(", ")}`);
  }
  if (palette?.accentAllowed?.length) {
    lines.push(`- Accents allowed: ${palette.accentAllowed.join(", ")}`);
  }
  if (palette?.avoid?.length) {
    lines.push(`- Avoid colors: ${palette.avoid.join(", ")}`);
  }
  if (materials?.preferred?.length) {
    lines.push(`- Preferred materials: ${materials.preferred.join(", ")}`);
  }
  if (materials?.avoid?.length) {
    lines.push(`- Avoid materials: ${materials.avoid.join(", ")}`);
  }
  if (atmosphere) {
    lines.push(
      `- Atmosphere: ${atmosphere.brightness ?? "bright"}, ${atmosphere.warmth ?? "neutral"}, ${atmosphere.formality ?? "balanced"}`
    );
  }
  if (rules.aiInstructions) {
    lines.push(`- ${rules.aiInstructions}`);
  }

  return `DESIGNER RULES:
${lines.join("\n")}`;
}

function buildUserDirectionSection(scene: RenderSceneSpec): string {
  const direction = scene.userDirection?.trim();
  if (!direction) {
    return "USER RENDER DIRECTION:\nNo user direction provided.";
  }
  return `USER RENDER DIRECTION:
${direction}`;
}

function buildAllowlistSection(scene: RenderSceneSpec): string {
  const count = scene.furnitureInstances.length;
  return `ABSOLUTE ALLOWLIST:
Render ONLY:
- The room described in ROOM (${scene.room?.name ?? "none"}).
- The ${count} furniture instances described in FURNITURE INSTANCE MANIFEST.
- The finishes described in ROOM FINISHES.
- The camera viewpoint described in CAMERA.
Nothing else may appear in the image.`;
}

function buildProhibitionsSection(scene: RenderSceneSpec): string {
  const count = scene.furnitureInstances.length;
  return `ABSOLUTE PROHIBITIONS:
- Do NOT add, remove, merge or duplicate furniture instances (exactly ${count} instances).
- Do NOT substitute any catalog product with generic or similar furniture.
- Do NOT change colors, materials, proportions or design of the catalog products.
- Do NOT add furniture, decor, plants, rugs, curtains, drapes, blinds, tables, chairs, lamps, shelves or objects not listed in the manifest.
- Do NOT add curtains, drapes or window treatments of any kind unless explicitly listed in ROOM FINISHES or USER RENDER DIRECTION.
- Do NOT render rooms other than the selected room.
- Do NOT change the room geometry, proportions, depth or openings.
- Do NOT move the camera or change the viewpoint.
- The top-down scene map is authoritative for the room shape, wall positions, furniture footprints and their placement. Match the perspective depth, camera angle and furniture positions to that map.
- The furniture dimensions in FURNITURE INSTANCE MANIFEST are authoritative. Scale each piece to fit the room: a ${count > 0 ? "sofa" : "piece"} must not exceed the room width or depth.`;
}

function buildOutputInstructionSection(scene: RenderSceneSpec): string {
  const camera = scene.camera;
  const room = scene.room;
  const viewpoint = camera
    ? `Render the interior from the exact camera position and direction described in CAMERA (x=${formatMeters(camera.x)}m, y=${formatMeters(camera.y)}m, rotation ${Math.round(camera.rotation)}°, FOV ${Math.round(camera.fov)}°).`
    : "Render the interior from a natural eye-level viewpoint inside the room.";

  const depth = room
    ? `The room is ${formatMeters(room.width)}m wide and ${formatMeters(room.depth)}m deep. Render the perspective depth accurately: the far wall must appear at the correct distance, and furniture must be scaled to fit the room dimensions.`
    : "";

  return `OUTPUT INSTRUCTION:
${viewpoint}
${depth}
Photorealistic interior render, professional architectural photography, natural daylight, realistic materials, accurate room proportions, high quality.`;
}

function buildDebugPrompt(providerPrompt: string, input: CanonicalPromptInput): string {
  const { scene } = input;
  const debugLines: string[] = [];

  debugLines.push(providerPrompt);

  debugLines.push(`\n\n=== DEBUG DIAGNOSTICS (not sent to the provider) ===`);
  debugLines.push(`Scene version: ${scene.version}`);
  debugLines.push(`Floorplan: ${scene.floorplanId}`);
  debugLines.push(`Room: ${scene.room?.name ?? "none"} [${scene.room?.id ?? "none"}]`);
  debugLines.push(`Camera: ${scene.camera ? `${formatMeters(scene.camera.x)}m, ${formatMeters(scene.camera.y)}m, ${Math.round(scene.camera.rotation)}°` : "none"}`);
  debugLines.push(`Furniture instances: ${scene.furnitureInstances.length}`);
  debugLines.push(`Unresolved assignments: ${scene.unresolvedAssignments.length}`);
  debugLines.push(`Reference images: ${(input.referenceImages ?? []).map((image) => image.name).join(", ") || "none"}`);

  return debugLines.join("\n");
}

function formatMeters(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0";
  return (Math.round(value * 100) / 100).toFixed(2);
}