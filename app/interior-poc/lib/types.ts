// Tipi condivisi per la PoC Interior Design

export interface Product {
  id: string;
  sku: string;
  name: string;
  nameForAI: string;
  collection: string;
  category: "Sofas" | "Chairs" | "Tables" | "Living Systems" | "Carpets";
  subcategory: string;
  designer: string;
  description: string;
  descriptionForAI: string;
  dimensions: {
    width: number; // cm
    depth: number; // cm
    height: number; // cm
  };
  seatHeight?: number;
  materials: string[];
  finishes: string[];
  images: string[];
  catalogRef: string;
  price: number | null;
}

export interface Wall {
  id: string;
  start: [number, number]; // [x, y] nelle unità della piantina
  end: [number, number]; // [x, y] nelle unità della piantina
  thickness: number;
  openings: Array<{
    type: "door" | "window" | "french-door";
    center: number;
    width: number;
  }>;
}

export interface FloorplanRoom {
  id: string;
  name: string;
  area: number;
  bounds: { x: number; y: number; width: number; height: number }; // unità piano
  // Polygon opzionale per forme irregolari (perimetro esterno, vani scala)
  polygon?: Array<[number, number]>; // unità piano
  openings: FloorplanOpening[];
}

export interface FloorplanOpening {
  id: string;
  type: "window" | "french-door" | "door";
  position: { x: number; y: number };
  width: number;
  height: number;
  wall: "north" | "south" | "east" | "west";
  exposure: "north" | "south" | "east" | "west";
}

export interface DesignerRules {
  id: string;
  name: string;
  version: string;
  style: {
    primary: string;
    secondary: string[];
    avoid: string[];
  };
  colorPalette: {
    preferred: string[];
    accentAllowed: string[];
    avoid: string[];
  };
  materials: {
    preferred: string[];
    avoid: string[];
  };
  layoutPrinciples: {
    minPassageWidth: number;
    preferOpenSpace: boolean;
    avoidClutter: boolean;
    minSpaceAroundFurniture: number;
  };
  atmosphere: {
    brightness: "bright" | "medium" | "soft";
    warmth: "warm" | "neutral" | "cool";
    formality: "casual" | "balanced" | "formal";
  };
  aiInstructions: string;
}

export interface ProductMention {
  type: "explicit" | "ai_suggested" | "decorative";
  productId: string;
  displayName: string;
  position: { start: number; end: number };
  confidence: number;
}

export interface ObjectProductAssignment {
  objectId: string;
  productId: string;
}

export interface DesignProposal {
  explicitProducts: Product[];
  suggestedProducts: Product[];
  objectAssignments: ObjectProductAssignment[];
  style: string;
  atmosphere: {
    warmth: number;
    elegance: number;
    minimalism: number;
    cozy: number;
  };
  lighting: {
    type: "natural" | "mixed" | "artificial" | "dramatic";
    mood: "bright" | "soft" | "moody" | "dramatic";
    naturalLightEmphasis: boolean;
  };
  decorativeElements: string[];
  narrative: string;
}

export interface DesignState {
  sessionId: string;
  current: DesignProposal;
  history: {
    id: string;
    timestamp: Date;
    prompt: string;
    resultingProposal: DesignProposal;
  }[];
}
