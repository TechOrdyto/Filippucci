// Tipi per il 2D Interior Camera Controller

export interface CameraPosition {
  x: number;          // unità della planimetria (il DXF resta in unità piano)
  y: number;          // unità della planimetria (il DXF resta in unità piano)
  rotation: number;   // gradi, 0 = nord, 90 = est, 180 = sud, 270 = ovest
  fov: number;        // campo visivo in gradi (default 70)
  roomId: string;     // stanza in cui si trova la camera
  height?: number;    // altezza camera in metri (default 1.5)
}

export interface CameraContext {
  roomId: string;
  roomName: string;
  position: { x: number; y: number };
  roomBounds?: { x: number; y: number; width: number; height: number };
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
  label: string;
  kind?: "recommended" | "door" | "window" | "corner" | "center";
}

export interface Point {
  x: number;
  y: number;
}

// Configurazione camera
export interface CameraConfig {
  minDistanceFromWall: number;  // unità della planimetria
  defaultFov: number;           // gradi (default 70)
  defaultViewpoints: number;    // quanti viewpoint generare (default 4)
}
