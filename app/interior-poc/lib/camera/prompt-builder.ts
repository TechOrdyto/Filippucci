// Prompt Builder: trasforma CameraContext in testo per il prompt di generazione
// Separazione netta: la camera non conosce l'API, il prompt non conosce la camera

import type { CameraContext } from "./types";

/**
 * Costruisce il segmento di prompt relativo alla camera
 */
export function buildCameraPromptSegment(ctx: CameraContext): string {
  const direction = describeDirection(ctx.rotation);
  const facing = describeFacing(ctx.visibilityContext);
  const position = describePosition(ctx);

  return [
    `Camera positioned ${position} of the ${ctx.roomName},`,
    `looking toward ${direction},`,
    `facing ${facing}.`,
    `Field of view: ${ctx.fov} degrees.`,
  ].join(" ");
}

/**
 * Descrive la posizione della camera nella stanza
 */
function describePosition(ctx: CameraContext): string {
  const { x, y } = ctx.position;
  const room = ctx.roomName;

  // Posizione relativa: vicino a quale lato?
  const sides: string[] = [];
  if (y < 0.33) sides.push("the north side");
  else if (y > 0.66) sides.push("the south side");
  else sides.push("the center");

  if (x < 0.33) sides.push("the west side");
  else if (x > 0.66) sides.push("the east side");

  return sides.join(", ");
}

/**
 * Descrive la direzione di osservazione
 */
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

/**
 * Descrive cosa si trova di fronte alla camera
 */
function describeFacing(visibility: CameraContext["visibilityContext"]): string {
  switch (visibility.facing) {
    case "window":
      return "a window with natural light";
    case "door":
      return "a doorway";
    case "room":
      return visibility.targetRoomId
        ? `the adjacent ${visibility.targetRoomId}`
        : "the room interior";
    case "outside":
      return "the exterior";
    case "wall":
    default:
      return "the wall";
  }
}

/**
 * Costruisce il contesto completo per il prompt
 */
export function buildCameraPrompt(
  ctx: CameraContext,
  userPrompt: string
): string {
  const cameraSegment = buildCameraPromptSegment(ctx);
  return `${cameraSegment}\n\n${userPrompt}`;
}