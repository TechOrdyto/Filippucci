// Contratto di scena per la generazione render.
//
// Il contratto (RenderSceneSpec) è la ALLOWLIST ASSOLUTA per il modello
// immagini: contiene tutto e solo ciò che può essere renderizzato.
// Le tre fonti autorevoli:
//   1. Planimetria  → stanza, muri, aperture, camera, posizione/ingombro arredi
//   2. Catalogo     → identità, design, materiali, colori, dimensioni dei mobili
//   3. Campi utente → finiture e indicazioni esplicitamente inserite dall'utente
//
// Tutte le misure geometriche sono in METRI (il DXF resta in unità piano/cm;
// la conversione avviene qui con planUnitsToMeters).

import type { CameraPosition } from "../../lib/camera/types";
import { geometryBounds, geometryCenter, pointInPolygon } from "../../floorplan/geometry";
import type { FloorPlan, Geometry } from "../../floorplan/types";
import { planUnitsToMeters } from "../../floorplan/units";
import type { ObjectProductAssignment, Product } from "../types";
import { buildFurnitureInstances } from "./instances";
import type {
  FurnitureInstance,
  RenderFinishes,
  RenderSceneCamera,
  RenderSceneObject,
  RenderSceneOpening,
  RenderSceneRoom,
  RenderSceneSpec,
} from "./types";

export type {
  FurnitureInstance,
  RenderFinishes,
  RenderSceneCamera,
  RenderSceneObject,
  RenderSceneOpening,
  RenderSceneRoom,
  RenderSceneSpec,
} from "./types";

export interface SceneValidation {
  errors: string[];
  warnings: string[];
}

interface BuildRenderSceneInput {
  model: FloorPlan;
  roomId: string | null;
  camera: CameraPosition | null;
  assignments: ObjectProductAssignment[];
  products: Product[];
  prompt: string;
  finishes?: Partial<RenderFinishes> | null;
  openings?: RenderSceneOpening[];
  ceilingHeight?: number;
  walls?: Array<{ id: string; start: [number, number]; end: [number, number] }>;
}

export function normalizeRenderFinishes(
  finishes?: Partial<RenderFinishes> | null
): RenderFinishes {
  return {
    walls: normalizeFinish(finishes?.walls),
    floor: normalizeFinish(finishes?.floor),
    doors: normalizeFinish(finishes?.doors),
    windows: normalizeFinish(finishes?.windows),
  };
}

export function buildRenderScene({
  model,
  roomId,
  camera,
  assignments,
  products,
  prompt,
  finishes,
  openings = [],
  ceilingHeight = 2.7,
  walls = [],
}: BuildRenderSceneInput): RenderSceneSpec {
  const room = model.rooms.find((candidate) => candidate.id === roomId) ?? null;
  const productById = new Map(products.map((product) => [product.id, product]));
  const objectById = new Map(model.objects.map((object) => [object.id, object]));
  const unresolvedAssignments: ObjectProductAssignment[] = [];

  const objects = assignments.flatMap((assignment) => {
    const object = objectById.get(assignment.objectId);
    const product = productById.get(assignment.productId);

    if (!object || !product) {
      unresolvedAssignments.push(assignment);
      return [];
    }

    const anchorCenter = geometryCenter(object.geometry);

    return [
      {
        objectId: object.id,
        roomId: object.roomId,
        anchor: object.geometry,
        anchorCenter: {
          x: planUnitsToMeters(anchorCenter.x),
          y: planUnitsToMeters(anchorCenter.y),
        },
        productId: product.id,
        productName: product.name,
        productDimensions: product.dimensions,
        catalogImage: product.images[0] ?? null,
      },
    ];
  });

  // Manifest delle istanze fisiche: una voce per ogni ancora CAD associata.
  // La lista NON viene deduplicata (due ancore → due istanze dello stesso divano).
  const { instances: furnitureInstances, unresolvedAssignments: unresolvedInstances } =
    buildFurnitureInstances({ model, assignments, products });
  for (const unresolved of unresolvedInstances) {
    if (!unresolvedAssignments.some((a) => a.objectId === unresolved.objectId)) {
      unresolvedAssignments.push(unresolved);
    }
  }

  const roomOpenings = room
    ? openings.filter((opening) =>
        pointInPolygon(opening.position.x, opening.position.y, room.geometry.points)
      )
    : [];

  const renderRoom: RenderSceneRoom | null = room
    ? buildRenderRoom(room, roomOpenings, ceilingHeight, walls)
    : null;

  const renderCamera: RenderSceneCamera | null = camera
    ? buildRenderCamera(camera, renderRoom)
    : null;

  return {
    version: 2,
    floorplanId: model.id,
    prompt: prompt.trim(),
    userDirection: prompt.trim(),
    room: renderRoom,
    camera: renderCamera,
    objects,
    furnitureInstances,
    finishes: normalizeRenderFinishes(finishes),
    unresolvedAssignments,
  };
}

function buildRenderRoom(
  room: FloorPlan["rooms"][number],
  openings: RenderSceneOpening[],
  ceilingHeight: number,
  walls: Array<{ id: string; start: [number, number]; end: [number, number] }>
): RenderSceneRoom {
  const bounds = geometryBounds(room.geometry);
  const width = planUnitsToMeters(bounds.width);
  const depth = planUnitsToMeters(bounds.height);
  const area = width * depth;

  // Le aperture arrivano in unità piano (cm): convertiamo in metri.
  const openingsInMeters: RenderSceneOpening[] = openings.map((opening) => ({
    ...opening,
    position: {
      x: planUnitsToMeters(opening.position.x),
      y: planUnitsToMeters(opening.position.y),
    },
    width: planUnitsToMeters(opening.width),
    height: opening.height !== undefined ? planUnitsToMeters(opening.height) : undefined,
  }));

  const doors = openingsInMeters.filter(
    (opening) => opening.type === "door" || opening.type === "french-door"
  );
  const windows = openingsInMeters.filter((opening) => opening.type === "window");

  return {
    id: room.id,
    name: room.name,
    type: room.type,
    polygon: room.geometry.points.map(([x, y]) => [planUnitsToMeters(x), planUnitsToMeters(y)]),
    bounds: {
      x: planUnitsToMeters(bounds.x),
      y: planUnitsToMeters(bounds.y),
      width,
      height: depth,
    },
    width,
    depth,
    area: Math.round(area * 100) / 100,
    ceilingHeight,
    walls: walls.map((wall) => ({
      id: wall.id,
      start: [planUnitsToMeters(wall.start[0]), planUnitsToMeters(wall.start[1])],
      end: [planUnitsToMeters(wall.end[0]), planUnitsToMeters(wall.end[1])],
    })),
    doors,
    windows,
    openings: openingsInMeters,
  };
}

function buildRenderCamera(
  camera: CameraPosition,
  room: RenderSceneRoom | null
): RenderSceneCamera {
  const cameraX = planUnitsToMeters(camera.x);
  const cameraY = planUnitsToMeters(camera.y);
  const insideRoom = room
    ? pointInPolygon(cameraX, cameraY, room.polygon)
    : false;

  return {
    x: cameraX,
    y: cameraY,
    rotation: camera.rotation,
    direction: describeDirection(camera.rotation),
    fov: camera.fov,
    height: camera.height ?? 1.5,
    roomId: camera.roomId,
    insideRoom,
  };
}

function describeDirection(rotation: number): string {
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
  const idx = Math.round(rotation / 45) % 8;
  return dirs[idx];
}

export function validateRenderScene(scene: RenderSceneSpec): SceneValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!scene.room) {
    errors.push("Scegli una visuale prima di generare il render.");
  }

  if (!scene.camera) {
    errors.push("Imposta una visuale prima di generare il render.");
  }

  if (scene.camera && scene.room) {
    if (scene.camera.roomId !== scene.room.id) {
      errors.push("La camera selezionata non appartiene alla stanza attiva.");
    }
    if (!scene.camera.insideRoom) {
      errors.push("Il punto della camera è fuori dalla stanza selezionata.");
    }
    if (scene.camera.fov < 35 || scene.camera.fov > 100) {
      errors.push("Il campo visivo della camera non è valido.");
    }
  }

  if (scene.room && scene.room.openings.length === 0) {
    warnings.push("Questo ambiente non contiene porte o finestre nel file CAD: il render manterrà le pareti chiuse.");
  }

  if (scene.unresolvedAssignments.length > 0) {
    errors.push("Una o più associazioni catalogo non sono più disponibili.");
  }

  for (const object of scene.objects) {
    if (scene.room && object.roomId !== scene.room.id) {
      warnings.push(`${object.productName} appartiene a un altro ambiente e non verrà mostrato in questa vista.`);
    }
    if (!object.catalogImage) {
      warnings.push(`${object.productName} non ha ancora una foto catalogo associata.`);
    }
    if (scene.room && !pointInGeometry(object.anchorCenter.x, object.anchorCenter.y, scene.room.polygon)) {
      warnings.push(`L'ancora ${object.objectId} è fuori dal poligono della stanza.`);
    }
  }

  return { errors, warnings };
}

export function formatRenderScene(scene: RenderSceneSpec): string {
  const room = scene.room
    ? `${scene.room.name} [${scene.room.id}], polygon ${scene.room.polygon
        .map(([x, y]) => `(${roundPlanValue(x)}m,${roundPlanValue(y)}m)`)
        .join(" → ")}`
    : "not selected";
  const camera = scene.camera
    ? `x=${roundPlanValue(scene.camera.x)}m, y=${roundPlanValue(scene.camera.y)}m, rotation=${Math.round(
        scene.camera.rotation
      )}°, FOV=${Math.round(scene.camera.fov)}°`
    : "not selected";
  const objects = scene.objects.length
    ? scene.objects
        .filter((object) => !scene.room || object.roomId === scene.room.id)
        .map(
          (object) =>
            `${object.objectId} → ${object.productName} [${object.productId}], anchor center (${roundPlanValue(
              object.anchorCenter.x
            )}m,${roundPlanValue(object.anchorCenter.y)}m), catalog reference ${
              object.catalogImage ?? "missing"
            }`
        )
        .join("; ")
    : "none";
  const openings = scene.room?.openings.length
    ? scene.room.openings
        .map(
          (opening) =>
            `${opening.type} ${opening.id} at (${roundPlanValue(opening.position.x)}m,${roundPlanValue(
              opening.position.y
            )}m), width ${roundPlanValue(opening.width)}m on ${opening.wall} wall`
        )
        .join("; ")
    : "none";

  return `RENDER SCENE CONTRACT (AUTHORITATIVE):
- Selected room: ${room}
- Openings: ${openings}
- Camera: ${camera}
- Wall finish: ${scene.finishes.walls ?? "not specified"}
- Floor finish: ${scene.finishes.floor ?? "not specified"}
- Catalog anchors: ${objects}
- Furniture instances: ${scene.furnitureInstances.length}
Treat this scene contract as the source of truth. Do not move the camera, change the room proportions, or substitute an assigned catalog product.`;
}

function normalizeFinish(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function roundPlanValue(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function pointInGeometry(px: number, py: number, polygon: [number, number][]): boolean {
  return pointInPolygon(px, py, polygon);
}
