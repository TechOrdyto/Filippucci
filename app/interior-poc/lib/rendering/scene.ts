import type { CameraPosition } from "../../lib/camera/types";
import { geometryBounds, geometryCenter, pointInPolygon } from "../../floorplan/geometry";
import type { FloorPlan, Geometry } from "../../floorplan/types";
import type { ObjectProductAssignment, Product } from "../types";

export interface RenderFinishes {
  walls: string | null;
  floor: string | null;
}

export interface RenderSceneRoom {
  id: string;
  name: string;
  polygon: [number, number][];
  bounds: { x: number; y: number; width: number; height: number };
  openings: RenderSceneOpening[];
}

export interface RenderSceneOpening {
  id: string;
  type: "door" | "window" | "french-door";
  position: { x: number; y: number };
  width: number;
  height?: number;
  wall: "north" | "south" | "east" | "west";
  exposure?: "north" | "south" | "east" | "west";
}

export interface RenderSceneCamera {
  x: number;
  y: number;
  rotation: number;
  fov: number;
  roomId: string;
}

export interface RenderSceneObject {
  objectId: string;
  roomId: string;
  anchor: Geometry;
  anchorCenter: { x: number; y: number };
  productId: string;
  productName: string;
  productDimensions: Product["dimensions"];
  catalogImage: string | null;
}

export interface RenderSceneSpec {
  version: 1;
  floorplanId: string;
  prompt: string;
  room: RenderSceneRoom | null;
  camera: RenderSceneCamera | null;
  objects: RenderSceneObject[];
  finishes: RenderFinishes;
  unresolvedAssignments: ObjectProductAssignment[];
}

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
}

export function normalizeRenderFinishes(
  finishes?: Partial<RenderFinishes> | null
): RenderFinishes {
  return {
    walls: normalizeFinish(finishes?.walls),
    floor: normalizeFinish(finishes?.floor),
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

    return [
      {
        objectId: object.id,
        roomId: object.roomId,
        anchor: object.geometry,
        anchorCenter: geometryCenter(object.geometry),
        productId: product.id,
        productName: product.name,
        productDimensions: product.dimensions,
        catalogImage: product.images[0] ?? null,
      },
    ];
  });

  return {
    version: 1,
    floorplanId: model.id,
    prompt: prompt.trim(),
    room: room
      ? {
          id: room.id,
          name: room.name,
          polygon: room.geometry.points,
          bounds: geometryBounds(room.geometry),
          openings: openings.filter((opening) =>
            pointInPolygon(opening.position.x, opening.position.y, room.geometry.points)
          ),
        }
      : null,
    camera: camera
      ? {
          x: camera.x,
          y: camera.y,
          rotation: camera.rotation,
          fov: camera.fov,
          roomId: camera.roomId,
        }
      : null,
    objects,
    finishes: normalizeRenderFinishes(finishes),
    unresolvedAssignments,
  };
}

export function validateRenderScene(scene: RenderSceneSpec): SceneValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!scene.room) {
    errors.push("Seleziona un ambiente prima di generare il render.");
  }

  if (!scene.camera) {
    errors.push("Imposta una visuale prima di generare il render.");
  }

  if (scene.camera && scene.room) {
    if (scene.camera.roomId !== scene.room.id) {
      errors.push("La camera selezionata non appartiene alla stanza attiva.");
    }
    if (!pointInPolygon(scene.camera.x, scene.camera.y, scene.room.polygon)) {
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
Treat this scene contract as the source of truth. Do not move the camera, change the room proportions, or substitute an assigned catalog product.`;
}

function normalizeFinish(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function roundPlanValue(value: number): string {
  return (value / 100).toFixed(2);
}

function pointInGeometry(px: number, py: number, polygon: [number, number][]): boolean {
  return pointInPolygon(px, py, polygon);
}
