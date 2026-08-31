"use client";

import { useMemo, useState } from "react";
import MentionInput from "./components/MentionInput";
import FloorplanViewer from "./components/FloorplanViewer";
import DesignSummary from "./components/DesignSummary";
import RenderResult from "./components/RenderResult";
import { catalog, findProductById, parseMentions } from "./lib/catalog";
import type { DesignProposal, DesignState, ProductMention } from "./lib/types";
import type { CameraPosition, Viewpoint } from "./lib/camera/types";
import { findRoomAtPoint, clampToRoom, distanceToWalls } from "./lib/camera/geometry";
import { generateViewpoints, DEFAULT_CAMERA_CONFIG } from "./lib/camera/viewpoints";
import { buildCameraPrompt } from "./lib/camera/prompt-builder";
import floorplanData from "./data/floorplan.json";
import designerRules from "./data/designer-rules.json";

const floorplan = floorplanData as any;
const rules = designerRules as any;

function createInitialProposal(): DesignProposal {
  return {
    explicitProducts: [],
    suggestedProducts: [],
    style: rules.style.primary,
    atmosphere: {
      warmth: 5,
      elegance: 5,
      minimalism: 5,
      cozy: 5,
    },
    lighting: {
      type: "natural",
      mood: "bright",
      naturalLightEmphasis: true,
    },
    decorativeElements: [],
    narrative: "",
  };
}

export default function InteriorPocPage() {
  const [prompt, setPrompt] = useState("");
  const [mentions, setMentions] = useState<ProductMention[]>([]);
  const [state, setState] = useState<DesignState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Camera 2D state
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraPosition | null>(null);
  const [viewpoints, setViewpoints] = useState<Viewpoint[]>([]);

  const explicitProducts = useMemo(
    () => mentions.map((m) => findProductById(m.productId)).filter(Boolean),
    [mentions]
  );

  const handleRoomClick = (roomId: string, x: number, y: number) => {
    const room = floorplan.rooms.find((r: any) => r.id === roomId);
    if (!room) return;

    setSelectedRoomId(roomId);

    // Clamp alla distanza minima dai muri
    const point = clampToRoom({ x, y }, room);
    const dist = distanceToWalls(point, room, floorplan.walls ?? []);
    const minDist = DEFAULT_CAMERA_CONFIG.minDistanceFromWall;

    const finalPos =
      dist < minDist
        ? {
            x: point.x + (point.x < room.bounds.x + room.bounds.width / 2 ? minDist : -minDist),
            y: point.y + (point.y < room.bounds.y + room.bounds.height / 2 ? minDist : -minDist),
          }
        : point;

    setCamera({
      x: Math.round(finalPos.x * 100) / 100,
      y: Math.round(finalPos.y * 100) / 100,
      rotation: 0,
      fov: DEFAULT_CAMERA_CONFIG.defaultFov,
      roomId,
    });

    // Genera viewpoint per la stanza
    setViewpoints(generateViewpoints(room, floorplan.walls ?? []));
  };

  const handleCameraChange = (newCamera: CameraPosition) => {
    const room = floorplan.rooms.find((r: any) => r.id === newCamera.roomId);
    if (!room) return;

    // Clamp dentro la stanza
    const clamped = clampToRoom({ x: newCamera.x, y: newCamera.y }, room);
    setCamera({
      ...newCamera,
      x: Math.round(clamped.x * 100) / 100,
      y: Math.round(clamped.y * 100) / 100,
    });
  };

  const handleSelectViewpoint = (vp: Viewpoint) => {
    setCamera({
      x: vp.position.x,
      y: vp.position.y,
      rotation: vp.rotation,
      fov: vp.fov,
      roomId: vp.roomId,
    });
  };

  const handleGenerateViewpoints = () => {
    if (!selectedRoomId) return;
    const room = floorplan.rooms.find((r: any) => r.id === selectedRoomId);
    if (room) setViewpoints(generateViewpoints(room, floorplan.walls ?? []));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Build proposal from mentions + prompt
      const proposal: DesignProposal = {
        ...createInitialProposal(),
        explicitProducts: explicitProducts as any[],
        suggestedProducts: [],
        narrative: prompt,
      };

      // 3. Costruisci il prompt con il contesto camera
      const selectedRoom = floorplan.rooms.find((r: any) => r.id === selectedRoomId);
      const finalPrompt =
        camera && selectedRoom
          ? buildCameraPrompt(
              {
                roomId: camera.roomId,
                roomName: selectedRoom.name,
                position: { x: camera.x, y: camera.y },
                rotation: camera.rotation,
                fov: camera.fov,
                viewDirection: {
                  x: Math.cos(((camera.rotation - 90) * Math.PI) / 180),
                  y: Math.sin(((camera.rotation - 90) * Math.PI) / 180),
                },
                visibilityContext: { facing: "room", distanceToWall: 0 },
              },
              prompt
            )
          : prompt;

      // 4. Update state
      const newState: DesignState = {
        sessionId: crypto.randomUUID(),
        current: proposal,
        history: [
          ...(state?.history ?? []),
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            prompt: finalPrompt,
            resultingProposal: proposal,
          },
        ],
      };
      setState(newState);

      // 5. Call generation API
      const res = await fetch("/interior-poc/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          productIds: explicitProducts.map((p) => (p as any).id),
          floorplanId: floorplan.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Errore nella generazione");
      }

      const data = await res.json();
      setImageUrl(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveSuggested = (productId: string) => {
    if (!state) return;
    setState({
      ...state,
      current: {
        ...state.current,
        suggestedProducts: state.current.suggestedProducts.filter(
          (p) => p.id !== productId
        ),
      },
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Ordyto — Interior Design AI
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            PoC: da planimetria a render fotorealistico con catalogo Molteni&C
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Colonna sinistra: input + planimetria */}
          <div className="space-y-6">
            {/* Prompt input */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                Descrivi l'ambiente
              </h2>
              <MentionInput
                value={prompt}
                onChange={setPrompt}
                onMentionsChange={setMentions}
              />

              {/* Prodotti rilevati */}
              {explicitProducts.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Prodotti rilevati dal catalogo
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {explicitProducts.map((p) => (
                      <span
                        key={(p as any).id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                      >
                        ✅ {(p as any).name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? "Generazione in corso..." : "🎨 Genera Render"}
              </button>
            </section>

            {/* Planimetria */}
            <FloorplanViewer
              floorplan={floorplan}
              camera={camera}
              selectedRoomId={selectedRoomId}
              viewpoints={viewpoints}
              onRoomClick={handleRoomClick}
              onCameraChange={handleCameraChange}
              onSelectViewpoint={handleSelectViewpoint}
            />

            {/* Pannello Camera */}
            {camera && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">📷 Camera 2D</h3>
                  <button
                    type="button"
                    onClick={handleGenerateViewpoints}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    🔄 Genera visuali
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Stanza:</span>{" "}
                    <span className="font-medium text-gray-900">
                      {floorplan.rooms.find((r: any) => r.id === camera.roomId)?.name ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Posizione:</span>{" "}
                    <span className="font-medium text-gray-900">
                      {camera.x}, {camera.y} m
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Direzione:</span>{" "}
                    <span className="font-medium text-gray-900">{camera.rotation}°</span>
                  </div>
                  <div>
                    <span className="text-gray-500">FOV:</span>{" "}
                    <span className="font-medium text-gray-900">{camera.fov}°</span>
                  </div>
                </div>
                {viewpoints.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Visuali suggerite
                    </div>
                    <div className="space-y-1">
                      {viewpoints.map((vp) => (
                        <button
                          key={vp.id}
                          type="button"
                          onClick={() => handleSelectViewpoint(vp)}
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
                        >
                          {vp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Colonna destra: proposta + render */}
          <div className="space-y-6">
            {state && (
              <DesignSummary
                proposal={state.current}
                onRemoveSuggested={handleRemoveSuggested}
              />
            )}
            <RenderResult
              imageUrl={imageUrl}
              isLoading={isGenerating}
              error={error}
              onRegenerate={handleGenerate}
            />
          </div>
        </div>

        {/* Catalogo disponibile */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Catalogo disponibile ({catalog.length} prodotti)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((product) => (
              <div
                key={product.id}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xl">
                      {product.category === "Sofas" ? "🛋️" : product.category === "Tables" ? "🪑" : "📦"}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {product.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {product.category} · {product.designer}
                        </div>
                      </div>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {product.id}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {product.dimensions
                        ? `${product.dimensions.width}×${product.dimensions.depth}×${product.dimensions.height} cm`
                        : "Dimensioni non disponibili"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {product.materials?.join(", ") ?? "Materiali non disponibili"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}