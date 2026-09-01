"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MentionInput from "./components/MentionInput";
import DesignSummary from "./components/DesignSummary";
import RenderResult from "./components/RenderResult";
import RoomsSidebar from "./components/RoomsSidebar";
import FloorplanViewer from "./components/FloorplanViewer";
import Inspector from "./components/Inspector";
import { catalog, findProductById, parseMentions } from "./lib/catalog";
import type {
  DesignProposal,
  DesignState,
  FloorplanRoom,
  ProductMention,
} from "./lib/types";
import type { CameraPosition, Viewpoint } from "./lib/camera/types";
import { generateViewpoints, DEFAULT_CAMERA_CONFIG } from "./lib/camera/viewpoints";
import { buildCameraPrompt } from "./lib/camera/prompt-builder";
import { CadFloorPlanSource } from "./floorplan/source";
import { useFloorPlan } from "./floorplan/use-floor-plan";
import { getObject } from "./floorplan/model";
import { boundsFromPolygon, polygonCenter } from "./floorplan/geometry";
import type { Selection } from "./floorplan/types";
import floorplanDxfData from "./data/floorplan-dxf.json";
import designerRules from "./data/designer-rules.json";

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

  // Pannelli responsive (mobile/tablet)
  const [showRooms, setShowRooms] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  // Click esterno all'intera sezione planimetria (viewer + sidebar + inspector)
  // → deseleziona. L'Inspector è DENTRO il perimetro, quindi i suoi click
  // (es. "Aggiungi azione") non azzerano la selezione.
  const moduleRef = useRef<HTMLDivElement>(null);
  const handleSelectRef = useRef<(s: Selection | null) => void>(() => {});
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const el = moduleRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) handleSelectRef.current(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  // Nuovo modulo planimetria
  const {
    model,
    selection,
    mode,
    activeRoomId,
    selectRoom,
    selectObject,
    clearSelection,
    switchMode,
    handleAddAction,
    handleRemoveAction,
    renameRoom,
  } = useFloorPlan();

  const geometry = useMemo(
    () => new CadFloorPlanSource(floorplanDxfData as any).getGeometry(),
    []
  );

  const explicitProducts = useMemo(
    () => mentions.map((m) => findProductById(m.productId)).filter(Boolean),
    [mentions]
  );

  const toCameraRoom = (room: any): FloorplanRoom => {
    const bounds = boundsFromPolygon(room.geometry.points);
    return {
      id: room.id,
      name: room.name,
      area: Math.round(bounds.width * bounds.height * 100) / 100,
      bounds,
      polygon: room.geometry.points,
      openings: [],
    };
  };

  const focusRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    const room = model.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const center = polygonCenter(room.geometry.points);
    setCamera({
      x: Math.round(center.x * 100) / 100,
      y: Math.round(center.y * 100) / 100,
      rotation: 0,
      fov: DEFAULT_CAMERA_CONFIG.defaultFov,
      roomId,
    });
    setViewpoints(generateViewpoints(toCameraRoom(room), []));
  };

  const handleSelect = (sel: Selection | null) => {
    if (!sel) {
      clearSelection();
      return;
    }
    if (sel.type === "room") {
      selectRoom(sel.id);
      focusRoom(sel.id);
    } else {
      selectObject(sel.id);
      const obj = getObject(model, sel.id);
      if (obj) focusRoom(obj.roomId);
    }
  };
  handleSelectRef.current = handleSelect;

  const handleSelectRoom = (roomId: string) => {
    selectRoom(roomId);
    focusRoom(roomId);
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
    const room = model.rooms.find((r) => r.id === selectedRoomId);
    if (room) setViewpoints(generateViewpoints(toCameraRoom(room), []));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const proposal: DesignProposal = {
        ...createInitialProposal(),
        explicitProducts: explicitProducts as any[],
        suggestedProducts: [],
        narrative: prompt,
      };

      const selectedRoom = model.rooms.find((r) => r.id === selectedRoomId);
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

      const res = await fetch("/interior-poc/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          productIds: explicitProducts.map((p) => (p as any).id),
          floorplanId: model.id,
          roomId: selectedRoomId,
          camera: camera
            ? {
                x: camera.x,
                y: camera.y,
                rotation: camera.rotation,
                fov: camera.fov,
              }
            : null,
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
      <div className="mx-auto max-w-7xl px-4">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Ordyto — Interior Design AI
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            PoC: da planimetria a render fotorealistico con catalogo Molteni&C
          </p>
        </header>

        {/* MODULO PLANIMETRIA — tre aree */}
        <section className="mb-8">
          <div ref={moduleRef} className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:gap-4">
            {/* Toggle pannelli (mobile/tablet) */}
            <div className="mb-3 flex gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setShowRooms((v) => !v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  showRooms
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                🏠 Stanze
              </button>
              <button
                type="button"
                onClick={() => setShowInspector((v) => !v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  showInspector
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                🔍 Inspector
              </button>
            </div>

            {/* Stanze */}
            <div className={`mb-4 lg:mb-0 ${showRooms ? "block" : "hidden"} lg:block`}>
              <RoomsSidebar
                model={model}
                selection={selection}
                onSelectRoom={handleSelectRoom}
              />
            </div>

            {/* Planimetria */}
            <div className="mb-4 lg:mb-0">
              <FloorplanViewer
                geometry={geometry}
                model={model}
                selection={selection}
                mode={mode}
                activeRoomId={activeRoomId}
                onSelect={handleSelect}
                onSwitchMode={switchMode}
                onDeselectRoom={clearSelection}
              />
            </div>

            {/* Inspector */}
            <div className={`${showInspector ? "block" : "hidden"} lg:block`}>
              <Inspector
                model={model}
                selection={selection}
                onAddAction={handleAddAction}
                onRemoveAction={handleRemoveAction}
                onRenameRoom={renameRoom}
              />
            </div>
          </div>
        </section>

        {/* Prompt + render */}
        <div className="grid gap-6 lg:grid-cols-2">
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
                      {model.rooms.find((r) => r.id === camera.roomId)?.name ?? "—"}
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