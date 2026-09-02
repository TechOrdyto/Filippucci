"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MentionInput from "./components/MentionInput";
import DesignSummary from "./components/DesignSummary";
import RenderResult, { type RenderVariant } from "./components/RenderResult";
import ReferenceImagePicker from "./components/ReferenceImagePicker";
import ThemeToggle from "./components/ThemeToggle";
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
const CAMERA_DIRECTIONS = [
  "Nord",
  "Nord-est",
  "Est",
  "Sud-est",
  "Sud",
  "Sud-ovest",
  "Ovest",
  "Nord-ovest",
] as const;

function getCameraDirection(rotation: number): string {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  return CAMERA_DIRECTIONS[Math.round(normalizedRotation / 45) % CAMERA_DIRECTIONS.length];
}

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
  const [generatedImages, setGeneratedImages] = useState<RenderVariant[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("Tutti");

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
      const generatedImage: RenderVariant = {
        id: crypto.randomUUID(),
        imageUrl: data.imageUrl,
        prompt,
        createdAt: new Date(),
      };
      setImageUrl(data.imageUrl);
      setGeneratedImages((previous) => [generatedImage, ...previous].slice(0, 8));
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

  const selectedRoomName = selectedRoomId
    ? model.rooms.find((room: any) => room.id === selectedRoomId)?.name
    : null;
  const currentStep = imageUrl ? 4 : prompt.trim() ? 3 : camera ? 2 : 1;
  const catalogCategories = [
    "Tutti",
    ...Array.from(new Set(catalog.map((product) => product.category))),
  ];
  const filteredCatalog = catalog.filter((product) => {
    const query = catalogQuery.trim().toLowerCase();
    const matchesCategory = catalogCategory === "Tutti" || product.category === catalogCategory;
    const matchesQuery =
      !query ||
      [product.name, product.collection, product.category, product.designer]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesCategory && matchesQuery;
  });

  const handleUseProduct = (productName: string) => {
    const nextPrompt = `${prompt.trim()}${prompt.trim() ? " " : ""}@${productName} `;
    setPrompt(nextPrompt);
    setMentions(parseMentions(nextPrompt));
  };

  const resultMobileOrder = state ? "order-5" : "order-4";

  return (
    <main className="studio-shell min-h-screen">
      <header className="studio-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <svg
              className="brand-logo h-9 w-36 shrink-0 sm:h-10 sm:w-40"
              viewBox="0 0 289.4 71.8"
              role="img"
              aria-label="Filippucci Home Design"
            >
              <use href="/logo-filipucci.svg#filippucci-mark" />
            </svg>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-[var(--text-muted)] md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Progetto demo · Ordyto.it
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <section className="mb-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start md:gap-8">
            <div className="max-w-3xl">
              <p className="eyebrow mb-3">Preparazione della proposta</p>
              <h2 className="display-title text-4xl leading-[0.98] text-[var(--text)] sm:text-5xl">
                Prepara l’immagine da mostrare al cliente.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[var(--text-muted)]">
                Scegli la stanza, imposta la vista e inserisci le indicazioni di progetto.
                Il sistema preparerà il render per la presentazione.
              </p>
            </div>
            <div className="shrink-0 text-left md:pt-0 md:text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">Progetto</p>
              <p className="mt-1 text-sm font-medium text-[var(--text)]">Casa privata · 01</p>
            </div>
          </div>
        </section>

        <nav aria-label="Stato del progetto" className="panel mb-8 overflow-hidden rounded-2xl">
          <ol className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0">
            {[
              [1, "Piantina", "Scegli una stanza"],
              [2, "Vista", "Scegli da dove guardare"],
              [3, "Indicazioni", "Inserisci cosa mostrare"],
              [4, "Risultato", "Guarda l’immagine"],
            ].map(([step, title, description]) => {
              const stepNumber = step as number;
              const isActive = currentStep === stepNumber;
              const isComplete = currentStep > stepNumber;
              return (
                <li
                  key={stepNumber}
                  className={`flex items-center gap-3 px-4 py-4 sm:px-5 ${
                    isActive ? "bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      isActive || isComplete
                        ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-white"
                        : "border-[var(--border-strong)] text-[var(--text-muted)]"
                    }`}
                  >
                    {isComplete ? "✓" : stepNumber}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text)]">{title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
                      {description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:self-stretch">
            <div className="order-3">
            <section className="panel rounded-2xl p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2">03 · Indicazioni</p>
                  <h3 className="display-title text-2xl text-[var(--text)]">Cosa vuoi mostrare al cliente?</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Indica stile, materiali, colori e prodotti da inserire nell’immagine.
                  </p>
                </div>
              </div>

              <MentionInput
                value={prompt}
                onChange={setPrompt}
                onMentionsChange={setMentions}
              />

              <ReferenceImagePicker />

              <div className="mt-4">
                <p className="eyebrow mb-2">Suggerimenti</p>
                <div className="flex flex-wrap gap-2" aria-label="Suggerimenti per il brief">
                  {[
                    "Soggiorno luminoso e minimale",
                    "Toni caldi e legno naturale",
                    "Immagine elegante e ordinata",
                    "Colori neutri e materiali naturali",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setPrompt(example);
                        setMentions(parseMentions(example));
                      }}
                      className="ghost-action rounded-full px-3 py-1.5 text-xs"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {explicitProducts.length > 0 && (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="eyebrow">Prodotti da mostrare</span>
                    <span className="text-xs text-[var(--text-soft)]">Catalogo Molteni&amp;C</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {explicitProducts.map((product) => (
                      <span
                        key={(product as any).id}
                        className="soft-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        {(product as any).name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="primary-action mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
              >
                <span aria-hidden="true">{isGenerating ? "···" : "→"}</span>
                {isGenerating ? "Stiamo preparando l’immagine" : "Prepara immagine"}
              </button>
              <p className="mt-3 text-center text-xs text-[var(--text-soft)]">
                L’immagine richiede normalmente 20–40 secondi.
              </p>
            </section>
            </div>

            {/* MODULO PLANIMETRIA — tre aree (DXF-first) */}
            <div className="order-1">
              <section className="panel rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">01 · Piantina</p>
                    <h3 className="display-title text-2xl text-[var(--text)]">Scegli una stanza.</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Clicca sulla stanza che vuoi vedere nell’immagine.
                    </p>
                  </div>
                </div>

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
            </div>
          </div>

          <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:self-stretch">
            {camera && (
              <div className="order-2">
              <section className="panel rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">02 · Vista</p>
                    <h3 className="display-title text-2xl text-[var(--text)]">Da dove vuoi guardare?</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {selectedRoomName ?? "Ambiente selezionato"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateViewpoints}
                    className="ghost-action rounded-full px-3 py-2 text-xs font-semibold"
                  >
                    🔄 Genera visuali
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["Stanza", selectedRoomName ?? "—"],
                    ["Direzione", getCameraDirection(camera.rotation)],
                    ["Apertura vista", `${camera.fov}°`],
                  ].map(([label, value]) => (
                    <div key={label} className="panel-muted rounded-xl p-3">
                      <span className="block text-[11px] uppercase tracking-[0.12em] text-[var(--text-soft)]">{label}</span>
                      <span className="mt-1 block truncate text-sm font-semibold text-[var(--text)]">{value}</span>
                    </div>
                  ))}
                </div>

                {viewpoints.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="eyebrow">Altri punti di vista</span>
                      <span className="text-xs text-[var(--text-soft)]">Selezionane una</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {viewpoints.map((viewpoint, index) => (
                        <button
                          key={viewpoint.id}
                          type="button"
                          onClick={() => handleSelectViewpoint(viewpoint)}
                          aria-label={`Scegli visuale ${index + 1}`}
                          className="ghost-action rounded-xl px-3 py-3 text-left text-xs font-medium"
                        >
                          <span className="mb-1 block text-[var(--accent)]">Visuale {index + 1}</span>
                          <span className="text-[var(--text)]">Scegli questa visuale</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              </div>
            )}
            {state && (
              <div className="order-4">
                <DesignSummary
                  proposal={state.current}
                  onRemoveSuggested={handleRemoveSuggested}
                />
              </div>
            )}
            <aside
              className={`${resultMobileOrder} lg:sticky lg:top-24 lg:self-stretch`}
            >
              <RenderResult
                imageUrl={imageUrl}
                generatedImages={generatedImages}
                isLoading={isGenerating}
                error={error}
                onRegenerate={handleGenerate}
                onSelectImage={setImageUrl}
              />
            </aside>
          </div>
        </div>

        <section className="mt-12 border-t border-[var(--border)] pt-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow mb-2">Arredi</p>
              <h2 className="display-title text-3xl text-[var(--text)]">Scegli un prodotto da aggiungere.</h2>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{filteredCatalog.length} di {catalog.length} prodotti</p>
          </div>

          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="field-shell flex min-h-11 w-full items-center gap-3 rounded-xl px-4 lg:max-w-sm">
              <span aria-hidden="true" className="text-sm text-[var(--accent)]">⌕</span>
              <span className="sr-only">Cerca nella collezione</span>
              <input
                type="search"
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Cerca un prodotto o una collezione"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtra per categoria">
              {catalogCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCatalogCategory(category)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                    catalogCategory === category
                      ? "bg-[var(--accent-strong)] text-white"
                      : "ghost-action"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {filteredCatalog.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((product) => (
              <article key={product.id} className="catalog-card rounded-2xl p-3">
                <div className="flex gap-4">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-24 w-24 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-strong)] text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                      {product.category.slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 py-1">
                    <p className="eyebrow truncate">{product.category}</p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{product.name}</h3>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{product.designer}</p>
                    <p className="mt-2 text-xs text-[var(--text-soft)]">
                      {product.dimensions
                        ? `${product.dimensions.width} × ${product.dimensions.depth} × ${product.dimensions.height} cm`
                        : "Dimensioni su richiesta"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUseProduct(product.name)}
                  className="ghost-action mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold"
                >
                  Aggiungi alle indicazioni
                </button>
              </article>
            ))}
            </div>
          ) : (
            <div className="panel-muted rounded-2xl border border-dashed border-[var(--border-strong)] p-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">Nessun elemento corrisponde alla ricerca.</p>
              <button
                type="button"
                onClick={() => {
                  setCatalogQuery("");
                  setCatalogCategory("Tutti");
                }}
                className="mt-3 text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
              >
                Azzera filtri
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
