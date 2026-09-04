import type { CameraPosition, Viewpoint } from "./camera/types";

export const PROJECT_SESSION_STORAGE_KEY = "filippucci:interior-project:v1";

export interface ProjectSessionSnapshot {
  version: 1;
  floorplanId: string;
  selectedRoomId: string | null;
  objectAssignments: Record<string, string>;
  prompt: string;
  wallFinish: string;
  floorFinish: string;
  doorFinish: string;
  windowFinish: string;
  camera: CameraPosition | null;
  viewpoints: Viewpoint[];
  selectedViewpointId: string | null;
  isCameraConfirmed: boolean;
  imageUrl: string | null;
  renderSignature: string | null;
  updatedAt: string;
}

export function readProjectSession(): ProjectSessionSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROJECT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ProjectSessionSnapshot>;
    if (parsed.version !== 1 || typeof parsed.floorplanId !== "string") return null;

    return {
      version: 1,
      floorplanId: parsed.floorplanId,
      selectedRoomId: parsed.selectedRoomId ?? null,
      objectAssignments: parsed.objectAssignments ?? {},
      prompt: parsed.prompt ?? "",
      wallFinish: parsed.wallFinish ?? "",
      floorFinish: parsed.floorFinish ?? "",
      doorFinish: parsed.doorFinish ?? "",
      windowFinish: parsed.windowFinish ?? "",
      camera: parsed.camera ?? null,
      viewpoints: parsed.viewpoints ?? [],
      selectedViewpointId: parsed.selectedViewpointId ?? null,
      isCameraConfirmed: Boolean(parsed.isCameraConfirmed),
      imageUrl: parsed.imageUrl ?? null,
      renderSignature: parsed.renderSignature ?? null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeProjectSession(snapshot: ProjectSessionSnapshot): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(PROJECT_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // La demo resta utilizzabile anche se il browser blocca il localStorage.
  }
}

export function clearProjectSession(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(PROJECT_SESSION_STORAGE_KEY);
  } catch {
    // Nessuna azione necessaria: il dato locale non è indispensabile al render.
  }
}
