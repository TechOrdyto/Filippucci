// Estrazione piantina rule-based (senza AI)
// Analizza il testo OCR delle piantine architettoniche

import type { FloorplanData } from "../types";

export interface FloorplanExtractionResult {
  floorplan: FloorplanData | null;
  warnings: string[];
  source: "rule-based" | "ai";
}

// Pattern per riconoscere elementi della piantina
const FLOORPLAN_PATTERNS = {
  // Nome piano: "PIANO RIALZATO"
  floorName: /PIANO\s+([A-ZÀ-Ù]+)/i,

  // Stanza: "CUCINA/ SOGGIORNO" o "CAMERA" o "BAGNO"
  roomName: /^([A-ZÀ-Ù\/\s]+)$/m,

  // Superficie: "mq. 47.09" o "mq, 4,19"
  area: /mq[.,]?\s*([\d.,]+)/i,

  // Misure: "3.62", "2.61", "1.65", "7.22"
  measure: /(\d+[.,]\d+)/g,

  // Altezza: "H. 2.75"
  ceilingHeight: /H\.?\s*([\d.,]+)/i,

  // Rapporto illuminotecnico: "r.i.-r.a.= 0.154"
  lightRatio: /r\.i\.-r\.a\.=\s*([\d.,]+)/i,
};

const ROOM_TYPE_MAP: Record<string, string> = {
  CUCINA: "cucina",
  SOGGIORNO: "soggiorno",
  CAMERA: "camera",
  BAGNO: "bagno",
  GUARDAROBA: "guardaroba",
  INGRESSO: "ingresso",
  BALCONE: "balcone",
  SALA: "sala",
  STUDIO: "studio",
  LAVANDERIA: "lavanderia",
  DISIMPEGNO: "disimpegno",
  CORRIDOIO: "corridoio",
};

/**
 * Estrae la piantina dal testo OCR usando regole
 */
export function extractFloorplanFromText(text: string): FloorplanExtractionResult {
  const warnings: string[] = [];

  // 1. Nome piano
  const nameMatch = text.match(FLOORPLAN_PATTERNS.floorName);
  const name = nameMatch ? `Piano ${nameMatch[1]}` : "Piano";

  // 2. Altezza soffitto
  const heightMatch = text.match(FLOORPLAN_PATTERNS.ceilingHeight);
  const ceilingHeight = heightMatch ? parseFloat(heightMatch[1].replace(",", ".")) : 2.75;

  // 3. Misure totali (le più grandi)
  const measures = [...text.matchAll(FLOORPLAN_PATTERNS.measure)]
    .map((m) => parseFloat(m[1].replace(",", ".")))
    .filter((v) => v > 1 && v < 30);

  const totalWidth = measures.length > 0 ? Math.max(...measures) : 10;
  const totalHeight = measures.length > 1 ? measures[1] : totalWidth;

  // 4. Stanze
  const rooms: FloorplanData["rooms"] = [];
  const lines = text.split("\n");

  let currentRoom: any = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Riconosci nome stanza
    const roomMatch = trimmed.match(FLOORPLAN_PATTERNS.roomName);
    if (roomMatch && trimmed.length < 40) {
      const roomName = trimmed.replace(/\s+/g, " ").trim();
      const roomType = Object.keys(ROOM_TYPE_MAP).find((k) =>
        roomName.toUpperCase().includes(k)
      );

      if (roomType) {
        if (currentRoom) rooms.push(currentRoom);
        currentRoom = {
          id: `${ROOM_TYPE_MAP[roomType]}-${rooms.length + 1}`,
          name: roomName,
          area: 0,
          bounds: { x: 0, y: 0, width: 3, height: 3 },
          openings: [],
        };
        continue;
      }
    }

    // Riconosci superficie
    if (currentRoom) {
      const areaMatch = trimmed.match(FLOORPLAN_PATTERNS.area);
      if (areaMatch) {
        currentRoom.area = parseFloat(areaMatch[1].replace(",", "."));
      }
    }
  }
  if (currentRoom) rooms.push(currentRoom);

  if (rooms.length === 0) {
    warnings.push("Nessuna stanza riconosciuta con regole. Prova con interpretazione AI.");
    return { floorplan: null, warnings, source: "rule-based" };
  }

  // Distribuisci le stanze in griglia approssimativa
  const gridCols = Math.ceil(Math.sqrt(rooms.length));
  const cellW = totalWidth / gridCols;
  const cellH = totalHeight / gridCols;

  rooms.forEach((room, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    room.bounds = {
      x: Math.round(col * cellW * 100) / 100,
      y: Math.round(row * cellH * 100) / 100,
      width: Math.round(cellW * 100) / 100,
      height: Math.round(cellH * 100) / 100,
    };
  });

  const floorplan: FloorplanData = {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    unit: "m",
    dimensions: {
      width: Math.round(totalWidth * 100) / 100,
      height: Math.round(totalHeight * 100) / 100,
    },
    ceilingHeight,
    rooms,
  };

  return { floorplan, warnings, source: "rule-based" };
}