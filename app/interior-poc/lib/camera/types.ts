// Tipi per il 2D Interior Camera Controller

export interface CameraPosition {
  x: number;          // metri, stesso sistema della planimetria
  y: number;          // metri
  rotation: number;   // gradi, 0 = nord, 90 = est, 180 = sud, 270 = ovest
  fov: number;        // campo visivo in gradi (default 70)
  roomId: string;     // stanza in cui si trova la camera
}

export interface CameraContext {
  roomId: string;
  roomName: string;
  position: { x: number; y: number };
  rotation: number;
  fov: number;
  viewDirection: { x: number; y: number };  // vettore normalizzato
  visibilityContext: {
    facing: "wall" | "window" | "door" | "room" | "outside";
    targetRoomId?: string;
    distanceToWall: number;
  };
}

export interface Viewpoint {
  id: string;
  roomId: string;
  position: { x: number; y: number };
  rotation: number;
  fov: number;
  label: string;  // "Angolo sud-ovest → nord-est"
}

export interface Point {
  x: number;
  y: number;
}

// Configurazione camera
export interface CameraConfig {
  minDistanceFromWall: number;  // metri (default 0.30)
  defaultFov: number;           // gradi (default 70)
  defaultViewpoints: number;    // quanti viewpoint generare (default 4)
}