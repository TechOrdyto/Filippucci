// Manifest delle istanze di arredo per il render.
//
// Regola architetturale: la lista delle ISTANZE non viene mai deduplicata
// (ogni ancora CAD associata a un prodotto è una istanza fisica separata),
// mentre la lista dei PRODOTTI viene deduplicata solo per il caricamento
// delle immagini di riferimento (una foto per prodotto, non per istanza).

import type { FloorPlan, FloorPlanObject } from "../../floorplan/types";
import { geometryCenter } from "../../floorplan/geometry";
import { planUnitsToMeters } from "../../floorplan/units";
import type { ObjectProductAssignment, Product } from "../types";
import type { FurnitureInstance } from "./types";

export interface FurnitureInstanceInput {
  model: FloorPlan;
  assignments: ObjectProductAssignment[];
  products: Product[];
}

export interface FurnitureInstanceResult {
  instances: FurnitureInstance[];
  /** Prodotti deduplicati, usati SOLO per caricare le immagini di riferimento. */
  productsForImages: Product[];
  unresolvedAssignments: ObjectProductAssignment[];
}

export function buildFurnitureInstances({
  model,
  assignments,
  products,
}: FurnitureInstanceInput): FurnitureInstanceResult {
  const productById = new Map(products.map((product) => [product.id, product]));
  const objectById = new Map(model.objects.map((object) => [object.id, object]));
  const unresolvedAssignments: ObjectProductAssignment[] = [];
  const instances: FurnitureInstance[] = [];

  for (const assignment of assignments) {
    const object = objectById.get(assignment.objectId);
    const product = productById.get(assignment.productId);

    if (!object || !product) {
      unresolvedAssignments.push(assignment);
      continue;
    }

    const center = geometryCenter(object.geometry);
    const dimensions = product.dimensions;

    instances.push({
      instanceId: `instance-${object.id}`,
      anchorId: object.id,
      roomId: object.roomId,
      productId: product.id,
      productName: product.name,
      productDesigner: product.designer,
      position: {
        x: planUnitsToMeters(center.x),
        y: planUnitsToMeters(center.y),
      },
      footprint: {
        width: dimensions?.width ? planUnitsToMeters(dimensions.width) : 0,
        depth: dimensions?.depth ? planUnitsToMeters(dimensions.depth) : 0,
        height: dimensions?.height ? planUnitsToMeters(dimensions.height) : 0,
      },
      materials: product.materials ?? [],
      finishes: product.finishes ?? [],
      catalogImage: product.images?.[0] ?? null,
    });
  }

  // Dedup SOLO per il caricamento immagini: un prodotto = una foto di
  // riferimento, anche se compare più volte nella stanza.
  const productsForImages = Array.from(
    new Map(instances.map((instance) => [instance.productId, instance])).values()
  )
    .map((instance) => productById.get(instance.productId))
    .filter((product): product is Product => Boolean(product));

  return { instances, productsForImages, unresolvedAssignments };
}

export function furnitureInstanceCount(instances: FurnitureInstance[]): number {
  return instances.length;
}

export function isObjectInRoom(object: FloorPlanObject, roomId: string | null): boolean {
  return !roomId || object.roomId === roomId;
}